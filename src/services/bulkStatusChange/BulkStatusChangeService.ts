import type { App, TFile } from 'obsidian';
import type { PluginSettings } from '../../types';
import type {
  NoteToChangeStatus,
  BulkStatusChangeResult,
  StatusChangeProgressCallback,
  BulkStatusChangeProgress,
  SkippedNote,
} from './types';
import type { BulkOperationTarget } from '../types';
import { MappingResolver } from '../../mapping';
import { JiraClient } from '../../api/JiraClient';
import { parseSummaryFromContent } from '../../utils';
import { addFrontmatterFields } from '../../utils/frontmatter';
import { DEFAULT_CONTENT_PARSING } from '../../constants/defaults';
import { collectMarkdownFiles } from '../utils';

export interface BulkStatusChangeOptions {
  transitionId?: string;
  transitionName?: string;
  agileAction?: 'backlog' | 'board' | 'sprint';
  sprintId?: number;
  boardId?: string;
}

export class BulkStatusChangeService {
  private mappingResolver: MappingResolver;
  private cancelled = false;

  constructor(
    private app: App,
    private settings: PluginSettings,
    private instanceId: string,
  ) {
    this.mappingResolver = new MappingResolver(settings);
  }

  cancel(): void {
    this.cancelled = true;
  }

  async execute(
    target: BulkOperationTarget,
    options: BulkStatusChangeOptions,
    onProgress: StatusChangeProgressCallback,
  ): Promise<BulkStatusChangeResult> {
    this.cancelled = false;
    const result: BulkStatusChangeResult = {
      changed: [],
      resolved: [],
      skipped: [],
      failed: [],
    };

    const allFiles = collectMarkdownFiles(this.app, target);
    const progress: BulkStatusChangeProgress = {
      total: allFiles.length,
      processed: 0,
      currentFile: '',
      status: 'Collecting notes...',
      changed: 0,
      resolved: 0,
      skipped: 0,
      failed: 0,
    };
    onProgress(progress);

    const { notesToProcess, skippedNotes } = await this.collectNotesToProcess(allFiles, progress, onProgress, result);
    result.skipped.push(...skippedNotes);

    if (notesToProcess.length === 0) {
      progress.status = 'No notes to process';
      onProgress(progress);
      return result;
    }

    progress.status = 'Changing status...';
    onProgress(progress);

    const instance = this.settings.instances.find(i => i.id === this.instanceId);
    if (!instance) throw new Error('Jira instance not found');
    const client = new JiraClient(instance);

    for (const note of notesToProcess) {
      if (this.cancelled) {
        progress.status = 'Cancelled';
        onProgress(progress);
        break;
      }

      progress.currentFile = note.file.name;
      progress.status = `Processing: ${note.file.name}`;
      onProgress(progress);

      try {
        const issue = await client.getIssue(note.issueKey, ['status']);
        const oldStatus = (issue.fields.status as any)?.name || '';

        if (options.transitionId) {
          await client.transitionIssue(note.issueKey, options.transitionId);
        }

        if (options.agileAction === 'backlog') {
          await client.moveToBacklog([note.issueKey], options.boardId);
        } else if (options.agileAction === 'board' && options.boardId) {
          await client.moveToBoard([note.issueKey], options.boardId);
        } else if (options.agileAction === 'sprint' && options.sprintId) {
          await client.moveToSprint([note.issueKey], options.sprintId);
        }

        const newStatus = options.transitionName || oldStatus;
        result.changed.push({
          file: note.file,
          issueKey: note.issueKey,
          oldStatus,
          newStatus,
        });
        progress.changed++;
      } catch (error) {
        result.failed.push({
          file: note.file,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        progress.failed++;
      }

      progress.processed++;
      onProgress(progress);
    }

    progress.status = 'Complete';
    progress.currentFile = '';
    onProgress(progress);

    return result;
  }

  private async collectNotesToProcess(
    files: TFile[],
    progress: BulkStatusChangeProgress,
    onProgress: StatusChangeProgressCallback,
    result: BulkStatusChangeResult,
  ): Promise<{
    notesToProcess: NoteToChangeStatus[];
    skippedNotes: SkippedNote[];
  }> {
    const notesToProcess: NoteToChangeStatus[] = [];
    const skippedNotes: SkippedNote[] = [];

    const instance = this.settings.instances.find(i => i.id === this.instanceId);
    if (!instance) throw new Error('Jira instance not found');
    const client = new JiraClient(instance);

    for (const file of files) {
      if (this.cancelled) break;

      progress.currentFile = file.name;
      progress.status = `Analyzing: ${file.name}`;
      onProgress(progress);

      const context = this.mappingResolver.resolve(file.path);
      if (!context.projectKey) {
        skippedNotes.push({ file, reason: 'no project mapping' });
        progress.skipped++;
        progress.processed++;
        onProgress(progress);
        continue;
      }

      const metadata = this.app.metadataCache.getFileCache(file);
      let issueKey = metadata?.frontmatter?.issue_id;
      let issueUrl = metadata?.frontmatter?.issue_link;

      if (!issueKey) {
        const content = await this.app.vault.read(file);
        const projectConfig = context.projectMapping?.projectConfig;
        const contentParsing = projectConfig?.contentParsing || DEFAULT_CONTENT_PARSING;
        const summary = parseSummaryFromContent(content, contentParsing.summaryPattern, contentParsing.summaryFlags);

        if (!summary) {
          skippedNotes.push({ file, reason: 'no issue_id and no summary' });
          progress.skipped++;
          progress.processed++;
          onProgress(progress);
          continue;
        }

        const issues = await client.searchIssuesBySummary(context.projectKey, summary, 5);
        const exactMatch = issues.find(i => i.summary.toLowerCase() === summary.toLowerCase());

        if (!exactMatch) {
          skippedNotes.push({ file, reason: 'no issue_id and not found by summary' });
          progress.skipped++;
          progress.processed++;
          onProgress(progress);
          continue;
        }

        issueKey = exactMatch.key;
        issueUrl = client.getIssueUrl(issueKey);

        try {
          await addFrontmatterFields(this.app, file, {
            issue_id: issueKey,
            issue_link: issueUrl,
          });
          result.resolved.push({ file, issueKey });
          progress.resolved++;
        } catch (error) {
          console.error(`Failed to add frontmatter for ${file.name}:`, error);
        }
      }

      notesToProcess.push({
        file,
        issueKey,
        issueUrl: issueUrl || client.getIssueUrl(issueKey),
        currentStatus: metadata?.frontmatter?.status,
      });
    }

    return { notesToProcess, skippedNotes };
  }
}
