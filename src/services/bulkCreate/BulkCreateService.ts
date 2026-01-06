import type { App, TFile } from 'obsidian';
import type { PluginSettings, ProjectMappingConfig } from '../../types';
import type { FrontmatterValues } from '../../modals/CreateTicketModal/types';
import type { NoteToProcess, SkippedNote, BulkCreateResult, ProgressCallback, BulkCreateProgress } from './types';
import type { BulkOperationTarget } from '../types';
import { MappingResolver } from '../../mapping';
import { BulkCreateCache } from './BulkCreateCache';
import { parseSummaryFromContent, parseDescriptionFromContent } from '../../utils';
import { DEFAULT_CONTENT_PARSING } from '../../constants/defaults';
import { collectMarkdownFiles } from '../utils';

export class BulkCreateService {
  private mappingResolver: MappingResolver;
  private cache: BulkCreateCache;
  private cancelled = false;

  constructor(
    private app: App,
    private settings: PluginSettings,
  ) {
    this.mappingResolver = new MappingResolver(settings);
    this.cache = new BulkCreateCache(settings.instances);
  }

  cancel(): void {
    this.cancelled = true;
  }

  async execute(target: BulkOperationTarget, onProgress: ProgressCallback): Promise<BulkCreateResult> {
    this.cancelled = false;
    const result: BulkCreateResult = { created: [], skipped: [], failed: [] };

    const allFiles = collectMarkdownFiles(this.app, target);
    const progress: BulkCreateProgress = {
      total: allFiles.length,
      processed: 0,
      currentFile: '',
      status: 'Collecting notes...',
      created: 0,
      skipped: 0,
      failed: 0,
    };
    onProgress(progress);

    const { notesToProcess, skippedNotes } = await this.collectNotesToProcess(allFiles, progress, onProgress);
    result.skipped.push(...skippedNotes);

    if (notesToProcess.length === 0) {
      progress.status = 'No notes to process';
      onProgress(progress);
      return result;
    }

    progress.status = 'Checking duplicates...';
    onProgress(progress);

    const duplicates = await this.checkAllDuplicates(notesToProcess);

    const notesAfterDuplicateCheck: NoteToProcess[] = [];
    for (const note of notesToProcess) {
      const existingKey = duplicates.get(`${note.instanceId}:${note.projectKey}:${note.summary.toLowerCase()}`);
      if (existingKey) {
        result.skipped.push({
          file: note.file,
          reason: `duplicate (${existingKey})`,
          existingIssueKey: existingKey,
        });
        progress.skipped++;
      } else {
        notesAfterDuplicateCheck.push(note);
      }
    }

    const { withoutParent, withParent } = this.partitionNotesByDependency(notesAfterDuplicateCheck);
    const allNotesToCreate = [...withoutParent, ...withParent];

    progress.status = 'Creating tickets...';
    onProgress(progress);

    for (const note of allNotesToCreate) {
      if (this.cancelled) {
        progress.status = 'Cancelled';
        onProgress(progress);
        break;
      }

      progress.currentFile = note.file.name;
      progress.status = `Creating: ${note.file.name}`;
      onProgress(progress);

      try {
        const issueKey = await this.createTicket(note);
        const client = this.cache.getClient(note.instanceId);
        const issueUrl = client?.getIssueUrl(issueKey) || '';

        result.created.push({
          file: note.file,
          issueKey,
          issueUrl,
        });
        progress.created++;

        this.cache.addCreatedIssue(note.instanceId, note.projectKey, note.summary, issueKey);
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
    progress: BulkCreateProgress,
    onProgress: ProgressCallback,
  ): Promise<{ notesToProcess: NoteToProcess[]; skippedNotes: SkippedNote[] }> {
    const notesToProcess: NoteToProcess[] = [];
    const skippedNotes: SkippedNote[] = [];

    for (const file of files) {
      if (this.cancelled) break;

      progress.currentFile = file.name;
      progress.status = `Analyzing: ${file.name}`;
      onProgress(progress);

      const context = this.mappingResolver.resolve(file.path);

      if (!context.instance || !context.projectKey) {
        skippedNotes.push({ file, reason: 'no project mapping' });
        progress.skipped++;
        progress.processed++;
        onProgress(progress);
        continue;
      }

      const content = await this.app.vault.read(file);
      const projectConfig = context.projectMapping?.projectConfig;
      const contentParsing = projectConfig?.contentParsing || DEFAULT_CONTENT_PARSING;

      const summary = parseSummaryFromContent(content, contentParsing.summaryPattern, contentParsing.summaryFlags);

      if (!summary) {
        skippedNotes.push({ file, reason: 'no summary' });
        progress.skipped++;
        progress.processed++;
        onProgress(progress);
        continue;
      }

      const description = parseDescriptionFromContent(content, contentParsing.descriptionPattern, contentParsing.descriptionFlags) || '';

      const frontmatterValues = this.extractFrontmatterValues(file, projectConfig);

      notesToProcess.push({
        file,
        folderPath: file.parent?.path || '',
        instanceId: context.instance.id,
        projectKey: context.projectKey,
        summary,
        description,
        frontmatterValues,
      });
    }

    return { notesToProcess, skippedNotes };
  }

  private partitionNotesByDependency(notes: NoteToProcess[]): {
    withoutParent: NoteToProcess[];
    withParent: NoteToProcess[];
  } {
    const withoutParent: NoteToProcess[] = [];
    const withParent: NoteToProcess[] = [];

    for (const note of notes) {
      if (note.frontmatterValues.parentSummary) {
        withParent.push(note);
      } else {
        withoutParent.push(note);
      }
    }

    return { withoutParent, withParent };
  }

  private extractFrontmatterValues(file: TFile, projectConfig?: ProjectMappingConfig): FrontmatterValues {
    const values: FrontmatterValues = {};

    if (!projectConfig || projectConfig.frontmatterMappings.length === 0) {
      return values;
    }

    const metadata = this.app.metadataCache.getFileCache(file);
    const frontmatter = metadata?.frontmatter;

    if (!frontmatter) {
      return values;
    }

    for (const mapping of projectConfig.frontmatterMappings) {
      const fmValue = frontmatter[mapping.frontmatterKey];
      if (fmValue === undefined || fmValue === null) continue;

      switch (mapping.jiraFieldType) {
        case 'issue_type':
          if (typeof fmValue === 'string') values.issueType = fmValue;
          break;
        case 'labels':
          if (Array.isArray(fmValue)) values.labels = fmValue.map(String);
          else if (typeof fmValue === 'string') values.labels = [fmValue];
          break;
        case 'parent':
          if (typeof fmValue === 'string') values.parentSummary = fmValue;
          break;
        case 'priority':
          if (typeof fmValue === 'string') values.priority = fmValue;
          break;
        case 'assignee':
          if (typeof fmValue === 'string') values.assignee = fmValue;
          break;
        case 'custom':
          if (mapping.customFieldId) {
            if (!values.customFields) values.customFields = {};
            values.customFields[mapping.customFieldId] = fmValue;
          }
          break;
      }
    }

    return values;
  }

  private async checkAllDuplicates(notes: NoteToProcess[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    const grouped = new Map<string, NoteToProcess[]>();
    for (const note of notes) {
      const key = `${note.instanceId}:${note.projectKey}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(note);
    }

    for (const [groupKey, groupNotes] of grouped) {
      const [instanceId, projectKey] = groupKey.split(':');
      const summaries = groupNotes.map(n => n.summary);
      const duplicates = await this.cache.checkDuplicates(instanceId, projectKey, summaries);

      for (const [summary, issueKey] of duplicates) {
        result.set(`${instanceId}:${projectKey}:${summary.toLowerCase()}`, issueKey);
      }
    }

    return result;
  }

  private async createTicket(note: NoteToProcess): Promise<string> {
    const client = this.cache.getClient(note.instanceId);
    if (!client) throw new Error('Jira client not found');

    const issueTypes = await this.cache.getIssueTypes(note.instanceId, note.projectKey);
    const priorities = await this.cache.getPriorities(note.instanceId);

    let issueTypeId = issueTypes[0]?.id;
    if (note.frontmatterValues.issueType) {
      const matchedType = issueTypes.find(t => t.name.toLowerCase() === note.frontmatterValues.issueType!.toLowerCase());
      if (matchedType) issueTypeId = matchedType.id;
    }

    if (!issueTypeId) throw new Error('No issue type available');

    let priorityId: string | undefined;
    if (note.frontmatterValues.priority) {
      const matchedPriority = priorities.find(p => p.name.toLowerCase() === note.frontmatterValues.priority!.toLowerCase());
      if (matchedPriority) priorityId = matchedPriority.id;
    }

    let assigneeAccountId: string | undefined;
    if (note.frontmatterValues.assignee) {
      const users = await this.cache.getAssignableUsers(note.instanceId, note.projectKey);
      const normalizedSearch = note.frontmatterValues.assignee.toLowerCase();

      const matchedUser = users.find(
        u => u.displayName.toLowerCase() === normalizedSearch || u.displayName.toLowerCase().includes(normalizedSearch),
      );

      if (matchedUser) {
        assigneeAccountId = matchedUser.accountId;
      }
    }

    const customFields: Record<string, unknown> = {};

    if (note.frontmatterValues.labels && note.frontmatterValues.labels.length > 0) {
      customFields['labels'] = note.frontmatterValues.labels;
    }

    if (note.frontmatterValues.parentSummary) {
      let parentKey: string | null = null;

      parentKey = this.cache.findCreatedIssue(note.instanceId, note.projectKey, note.frontmatterValues.parentSummary);

      if (!parentKey) {
        const parentIssues = await client.searchIssuesBySummary(note.projectKey, note.frontmatterValues.parentSummary, 5);
        const exactMatch = parentIssues.find(i => i.summary.toLowerCase() === note.frontmatterValues.parentSummary!.toLowerCase());
        if (exactMatch) {
          parentKey = exactMatch.key;
        }
      }

      if (parentKey) {
        customFields['parent'] = { key: parentKey };
      }
    }

    if (assigneeAccountId) {
      customFields['assignee'] = { accountId: assigneeAccountId };
    }

    if (note.frontmatterValues.customFields) {
      for (const [fieldId, value] of Object.entries(note.frontmatterValues.customFields)) {
        customFields[fieldId] = value;
      }
    }

    const result = await client.createIssue(
      note.projectKey,
      issueTypeId,
      note.summary,
      note.description || undefined,
      priorityId,
      Object.keys(customFields).length > 0 ? customFields : undefined,
    );

    return result.key;
  }
}
