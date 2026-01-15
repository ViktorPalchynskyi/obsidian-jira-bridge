import { App, TFile, TFolder, Notice } from 'obsidian';
import type { PluginSettings, SyncFieldConfig, SyncResult, SyncStats, SyncChange } from '../../../types';
import type { SyncOptions, SyncContext, SyncCacheStrategy, SyncScopeStrategy } from './types';
import type { ResolvedContext } from '../../../types/mapping.types';
import { MappingResolver } from '../../../mapping';
import { JiraClient } from '../../../api/JiraClient';
import type { EventBus } from '../../../core/EventBus';
import { addFrontmatterFields } from '../../../utils/frontmatter';
import { FieldExtractor } from './FieldExtractor';
import { createCacheStrategy } from './strategies/caching';
import { OpenNotesScope, FolderScope } from './strategies/syncScope';

export class SyncService {
  private app: App;
  private settings: PluginSettings;
  private mappingResolver: MappingResolver;
  private clients: Map<string, JiraClient> = new Map();
  private intervalId: number | null = null;
  private cacheStrategy: SyncCacheStrategy;
  private eventBus: EventBus;
  private fieldExtractor: FieldExtractor;

  constructor(app: App, settings: PluginSettings, eventBus: EventBus, fieldExtractor?: FieldExtractor, cacheStrategy?: SyncCacheStrategy) {
    this.app = app;
    this.settings = settings;
    this.mappingResolver = new MappingResolver(settings);
    this.eventBus = eventBus;
    this.fieldExtractor = fieldExtractor ?? new FieldExtractor();
    this.cacheStrategy = cacheStrategy ?? createCacheStrategy(settings);

    for (const instance of settings.instances.filter(i => i.enabled)) {
      this.clients.set(instance.id, new JiraClient(instance));
    }
  }

  async syncNote(file: TFile, options: SyncOptions = {}): Promise<SyncResult> {
    const metadata = this.app.metadataCache.getFileCache(file);
    const issueKey = metadata?.frontmatter?.issue_id;

    if (!issueKey) {
      return {
        success: false,
        ticketKey: '',
        changes: [],
        skipped: true,
        skipReason: 'no_issue_id',
      };
    }

    const context = this.mappingResolver.resolve(file.path);

    if (!context.instance) {
      return {
        success: false,
        ticketKey: issueKey,
        changes: [],
        skipped: true,
        skipReason: 'no_instance_mapping',
      };
    }

    const syncFields = this.getEffectiveSyncConfig(context);

    if (syncFields.length === 0) {
      return {
        success: false,
        ticketKey: issueKey,
        changes: [],
        skipped: true,
        skipReason: 'sync_disabled',
      };
    }

    if (!options.force && this.cacheStrategy.has(issueKey)) {
      return {
        success: true,
        ticketKey: issueKey,
        changes: [],
        skipped: true,
        skipReason: 'cached',
      };
    }

    try {
      const syncContext: SyncContext = {
        file,
        issueKey,
        instanceId: context.instance.id,
        syncFields,
        trigger: 'manual',
      };

      const result = await this.performSync(syncContext, options);

      if (result.success && !options.silent) {
        this.eventBus.emit('sync:complete', result);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (err.message.includes('404')) {
        await addFrontmatterFields(this.app, file, {
          jira_sync_status: 'unlinked',
        });

        return {
          success: false,
          ticketKey: issueKey,
          changes: [],
          error: new Error('Ticket not found in Jira'),
          skipped: true,
          skipReason: 'not_found',
        };
      }

      return {
        success: false,
        ticketKey: issueKey,
        changes: [],
        error: err,
      };
    }
  }

  async syncAllOpenNotes(options: SyncOptions = {}): Promise<SyncStats> {
    return this.syncBatch(new OpenNotesScope(), options);
  }

  async syncFolder(folder: TFolder, options: SyncOptions = {}): Promise<SyncStats> {
    return this.syncBatch(new FolderScope(folder), options);
  }

  async syncBatch(scope: SyncScopeStrategy, options: SyncOptions = {}): Promise<SyncStats> {
    const stats: SyncStats = {
      total: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
      changes: 0,
    };

    const files = scope.collectFiles(this.app);
    stats.total = files.length;

    for (const file of files) {
      const result = await this.syncNote(file, { ...options, silent: true });

      if (result.skipped) {
        stats.skipped++;
      } else if (result.success) {
        stats.synced++;
        stats.changes += result.changes.length;
      } else {
        stats.failed++;
      }
    }

    if (!options.silent && stats.synced > 0) {
      new Notice(scope.getNotificationMessage(stats));
    }

    return stats;
  }

  startAutoSync(): void {
    if (this.intervalId !== null) {
      return;
    }

    const intervalMs = (this.settings.sync?.syncInterval ?? 1) * 60 * 1000;

    this.intervalId = window.setInterval(async () => {
      await this.syncAllOpenNotes({ silent: true, force: true });
    }, intervalMs);
  }

  stopAutoSync(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
    this.mappingResolver.updateSettings(settings);

    this.clients.clear();
    for (const instance of settings.instances.filter(i => i.enabled)) {
      this.clients.set(instance.id, new JiraClient(instance));
    }

    const ttlMs = (settings.sync.syncInterval ?? 1) * 60 * 1000;
    this.cacheStrategy.updateConfig({ maxSize: 100, ttlMs });

    if (this.intervalId !== null) {
      this.stopAutoSync();
      if (settings.sync.autoSync) {
        this.startAutoSync();
      }
    }
  }

  private async performSync(context: SyncContext, _options: SyncOptions): Promise<SyncResult> {
    let client = this.clients.get(context.instanceId);
    if (!client) {
      const instance = this.settings.instances.find(i => i.id === context.instanceId && i.enabled);
      if (!instance) {
        throw new Error('Jira instance not found or disabled');
      }
      client = new JiraClient(instance);
      this.clients.set(context.instanceId, client);
    }

    const fieldNames = context.syncFields.map(f => f.jiraField);
    const issueData = await client.getIssue(context.issueKey, fieldNames);

    const changes: SyncChange[] = [];
    const fieldsToUpdate: Record<string, string> = {};

    const metadata = this.app.metadataCache.getFileCache(context.file);

    for (const syncField of context.syncFields) {
      if (!syncField.enabled) continue;

      const jiraValue = this.fieldExtractor.extract(issueData.fields, syncField.jiraField);
      const currentValue = metadata?.frontmatter?.[syncField.frontmatterKey];

      if (jiraValue !== currentValue) {
        changes.push({
          field: syncField.jiraField,
          oldValue: currentValue,
          newValue: jiraValue,
          direction: 'fromJira',
          frontmatterKey: syncField.frontmatterKey,
        });

        fieldsToUpdate[syncField.frontmatterKey] = jiraValue || '';
      }
    }

    if (Object.keys(fieldsToUpdate).length > 0 && this.settings.sync.updateFrontmatter) {
      fieldsToUpdate.jira_synced_at = new Date().toISOString();
      await addFrontmatterFields(this.app, context.file, fieldsToUpdate);
    }

    this.cacheStrategy.set(context.issueKey, issueData.fields);

    return {
      success: true,
      ticketKey: context.issueKey,
      changes,
    };
  }

  private getEffectiveSyncConfig(context: ResolvedContext): SyncFieldConfig[] {
    const projectConfig = context.projectMapping?.projectConfig;

    if (projectConfig?.syncConfig) {
      if (!projectConfig.syncConfig.enableSync) {
        return [];
      }

      if (projectConfig.syncConfig.syncFields) {
        return projectConfig.syncConfig.syncFields.filter(f => f.enabled);
      }
    }

    const defaultSyncFields: SyncFieldConfig[] = [{ jiraField: 'status', frontmatterKey: 'jira_status', enabled: false, readOnly: true }];

    const syncFields = this.settings.sync?.syncFields ?? defaultSyncFields;
    return syncFields.filter(f => f.enabled);
  }
}
