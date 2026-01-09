import type { App } from 'obsidian';
import type { JiraClient } from '../../api/JiraClient';
import type {
  ExportedProjectConfig,
  ConfigurationDiff,
  ApplyOptions,
  ApplyResult,
  ApplyStepResult,
  ApplyItemResult,
  ApplyStepStatus,
  FieldConfig,
  IssueTypeConfig,
  WorkflowConfig,
  WorkflowStatus,
  BoardDetailedConfig,
} from '../../types';

interface TargetProjectInfo {
  projectKey: string;
  projectId: string;
  issueTypeSchemeId: string | null;
  existingIssueTypes: Map<string, string>;
}

export class ConfigurationApplyService {
  constructor(
    private app: App,
    private client: JiraClient,
  ) {}

  async apply(
    config: ExportedProjectConfig,
    targetProjectKey: string,
    diff: ConfigurationDiff,
    options: ApplyOptions,
  ): Promise<ApplyResult> {
    const targetInfo = await this.fetchTargetProjectInfo(targetProjectKey);
    const backupPath = await this.createBackup(targetProjectKey, config.meta.projectKey);

    const results: ApplyStepResult[] = [];
    const manualSteps: string[] = [];
    let overallSuccess = true;

    if (options.dryRun) {
      return this.generateDryRunResult(diff, backupPath);
    }

    const fieldsResult = await this.applyFields(config, targetInfo, diff, options);
    results.push(fieldsResult);

    const issueTypesResult = await this.applyIssueTypes(config, targetInfo, diff);
    results.push(issueTypesResult);

    const statusesResult = await this.applyStatuses(config, targetInfo, diff);
    results.push(statusesResult);

    const boardsResult = await this.applyBoards(config, targetInfo, diff);
    results.push(boardsResult);

    for (const stepResult of results) {
      if (stepResult.status === 'error') {
        const hasRealErrors = stepResult.results.some(r => r.status === 'error');
        if (hasRealErrors) {
          overallSuccess = false;
        }
      }
    }

    if (diff.workflows.modified.length > 0) {
      manualSteps.push('Review and update workflow transitions in Jira admin');
    }

    if (diff.boards.new.length > 0) {
      manualSteps.push('Configure board columns and swimlanes in Jira (some settings cannot be set via API)');
    }

    return {
      success: overallSuccess,
      backupPath,
      results,
      manualSteps,
    };
  }

  private async fetchTargetProjectInfo(projectKey: string): Promise<TargetProjectInfo> {
    const project = await this.client.getProject(projectKey);
    const issueTypeScheme = await this.client.getIssueTypeSchemeForProject(project.id);

    const projectIssueTypes = await this.client.getIssueTypesForProject(projectKey);
    const existingIssueTypes = new Map<string, string>();
    for (const it of projectIssueTypes) {
      existingIssueTypes.set(it.name.toLowerCase(), it.id);
    }

    return {
      projectKey,
      projectId: project.id,
      issueTypeSchemeId: issueTypeScheme?.id || null,
      existingIssueTypes,
    };
  }

  private async createBackup(targetProjectKey: string, sourceProjectKey: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFolder = `Jira/Configs/_backups/${targetProjectKey}-${timestamp}`;

    await this.ensureFolderExists(backupFolder);

    const backupMeta = {
      createdAt: new Date().toISOString(),
      targetProject: targetProjectKey,
      sourceProject: sourceProjectKey,
      type: 'pre-import-backup',
    };

    await this.writeFile(`${backupFolder}/backup-meta.json`, JSON.stringify(backupMeta, null, 2));

    return backupFolder;
  }

  private async ensureFolderExists(path: string): Promise<void> {
    const parts = path.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      if (!folder) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }

  private async writeFile(path: string, content: string): Promise<void> {
    const existingFile = this.app.vault.getAbstractFileByPath(path);
    if (existingFile) {
      await this.app.vault.adapter.write(path, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  private generateDryRunResult(diff: ConfigurationDiff, backupPath: string): ApplyResult {
    const results: ApplyStepResult[] = [];

    const fieldsToCreate = diff.fields.new.map(f => ({
      name: f.item.name,
      status: 'skipped' as ApplyStepStatus,
      reason: 'Dry run - would create custom field',
    }));

    const fieldsToUpdate = diff.fields.modified.map(f => ({
      name: f.item.name,
      status: 'skipped' as ApplyStepStatus,
      reason: 'Dry run - would update field options',
    }));

    results.push({
      step: 'Custom Fields',
      status: 'skipped',
      results: [...fieldsToCreate, ...fieldsToUpdate],
    });

    const issueTypesToCreate = diff.issueTypes.new.map(it => ({
      name: it.item.name,
      status: 'skipped' as ApplyStepStatus,
      reason: 'Dry run - would create issue type',
    }));

    results.push({
      step: 'Issue Types',
      status: 'skipped',
      results: issueTypesToCreate,
    });

    const workflowsModified = diff.workflows.modified.map(wf => ({
      name: wf.item.name,
      status: 'skipped' as ApplyStepStatus,
      reason: 'Dry run - would create missing statuses',
    }));

    results.push({
      step: 'Workflow Statuses',
      status: 'skipped',
      results: workflowsModified,
    });

    const boardsToCreate = diff.boards.new.map(b => ({
      name: b.item.name,
      status: 'skipped' as ApplyStepStatus,
      reason: 'Dry run - would create board with filter',
    }));

    results.push({
      step: 'Boards',
      status: 'skipped',
      results: boardsToCreate,
    });

    return {
      success: true,
      backupPath,
      results,
      manualSteps: ['This was a dry run. No changes were made.'],
    };
  }

  private async applyFields(
    config: ExportedProjectConfig,
    targetInfo: TargetProjectInfo,
    diff: ConfigurationDiff,
    options: ApplyOptions,
  ): Promise<ApplyStepResult> {
    const results: ApplyItemResult[] = [];

    for (const fieldDiff of diff.fields.new) {
      const field = fieldDiff.item;
      const result = await this.createCustomField(field, targetInfo, options);
      results.push(result);
    }

    if (options.updateFieldOptions) {
      for (const fieldDiff of diff.fields.modified) {
        const field = fieldDiff.item;
        const result = await this.updateFieldOptions(field);
        results.push(result);
      }
    }

    const hasRealError = results.some(r => r.status === 'error');
    const hasSuccess = results.some(r => r.status === 'success');
    const allSkipped = results.length > 0 && results.every(r => r.status === 'skipped');

    let status: ApplyStepStatus = 'success';
    if (hasRealError) status = 'error';
    else if (allSkipped) status = 'skipped';
    else if (hasSuccess && results.some(r => r.status === 'skipped')) status = 'partial';
    else if (results.length === 0) status = 'skipped';

    return {
      step: 'Custom Fields',
      status,
      results,
    };
  }

  private async createCustomField(field: FieldConfig, targetInfo: TargetProjectInfo, options: ApplyOptions): Promise<ApplyItemResult> {
    try {
      const searcherKey = this.getSearcherKeyForFieldType(field.schema.type, field.schema.custom);

      const created = await this.client.createCustomField({
        name: field.name,
        description: '',
        type: field.schema.custom || field.schema.type,
        searcherKey,
      });

      if (options.updateFieldContexts) {
        await this.client.createFieldContext(created.id, [targetInfo.projectId]);
      }

      if (options.updateFieldOptions && field.options.length > 0) {
        const contexts = await this.client.getFieldContexts(created.id);
        if (contexts.length > 0) {
          const optionValues = field.options.map(o => o.value);
          await this.client.addFieldOptions(created.id, contexts[0].id, optionValues);
        }
      }

      return {
        name: field.name,
        status: 'success',
        reason: `Created field ${created.key}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('400') || errorMsg.includes('409') || errorMsg.toLowerCase().includes('already exists')) {
        return this.addExistingFieldToProject(field, targetInfo, options);
      }
      return {
        name: field.name,
        status: 'error',
        error: errorMsg,
      };
    }
  }

  private async addExistingFieldToProject(
    field: FieldConfig,
    targetInfo: TargetProjectInfo,
    options: ApplyOptions,
  ): Promise<ApplyItemResult> {
    try {
      if (options.updateFieldContexts) {
        await this.client.createFieldContext(field.id, [targetInfo.projectId]);
      }

      if (options.updateFieldOptions && field.options.length > 0) {
        const contexts = await this.client.getFieldContexts(field.id);
        if (contexts.length > 0) {
          const existingOptions = await this.client.getFieldOptions(field.id, contexts[0].id);
          const existingValues = new Set(existingOptions.map(o => o.value.toLowerCase()));
          const newOptions = field.options.filter(o => !existingValues.has(o.value.toLowerCase())).map(o => o.value);

          if (newOptions.length > 0) {
            await this.client.addFieldOptions(field.id, contexts[0].id, newOptions);
          }
        }
      }

      return {
        name: field.name,
        status: 'success',
        reason: 'Added existing field to project',
      };
    } catch (innerError) {
      const innerMsg = innerError instanceof Error ? innerError.message : 'Unknown error';
      if (innerMsg.includes('400') || innerMsg.includes('409')) {
        return {
          name: field.name,
          status: 'skipped',
          reason: 'Field context already exists for project',
        };
      }
      return {
        name: field.name,
        status: 'error',
        error: `Failed to add field to project: ${innerMsg}`,
      };
    }
  }

  private getSearcherKeyForFieldType(type: string, customType?: string): string | undefined {
    const searcherMap: Record<string, string> = {
      string: 'com.atlassian.jira.plugin.system.customfieldtypes:textsearcher',
      number: 'com.atlassian.jira.plugin.system.customfieldtypes:exactnumber',
      option: 'com.atlassian.jira.plugin.system.customfieldtypes:selectsearcher',
      'option-with-child': 'com.atlassian.jira.plugin.system.customfieldtypes:cascadingselectsearcher',
      array: 'com.atlassian.jira.plugin.system.customfieldtypes:multiselectsearcher',
      date: 'com.atlassian.jira.plugin.system.customfieldtypes:daterange',
      datetime: 'com.atlassian.jira.plugin.system.customfieldtypes:datetimerange',
      user: 'com.atlassian.jira.plugin.system.customfieldtypes:userpickergroupsearcher',
    };

    if (customType?.includes('select')) {
      return searcherMap['option'];
    }
    if (customType?.includes('multiselect')) {
      return searcherMap['array'];
    }

    return searcherMap[type];
  }

  private async updateFieldOptions(field: FieldConfig): Promise<ApplyItemResult> {
    if (field.options.length === 0) {
      return {
        name: field.name,
        status: 'skipped',
        reason: 'No options to update',
      };
    }

    try {
      const contexts = await this.client.getFieldContexts(field.id);
      if (contexts.length === 0) {
        return {
          name: field.name,
          status: 'skipped',
          reason: 'No contexts found for field',
        };
      }

      const existingOptions = await this.client.getFieldOptions(field.id, contexts[0].id);
      const existingValues = new Set(existingOptions.map(o => o.value.toLowerCase()));

      const newOptions = field.options.filter(o => !existingValues.has(o.value.toLowerCase())).map(o => o.value);

      if (newOptions.length === 0) {
        return {
          name: field.name,
          status: 'skipped',
          reason: 'All options already exist',
        };
      }

      await this.client.addFieldOptions(field.id, contexts[0].id, newOptions);

      return {
        name: field.name,
        status: 'success',
        reason: `Added ${newOptions.length} new options`,
      };
    } catch (error) {
      return {
        name: field.name,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async applyIssueTypes(
    config: ExportedProjectConfig,
    targetInfo: TargetProjectInfo,
    diff: ConfigurationDiff,
  ): Promise<ApplyStepResult> {
    const results: ApplyItemResult[] = [];

    for (const itDiff of diff.issueTypes.new) {
      const issueType = itDiff.item;
      const result = await this.createIssueType(issueType, targetInfo);
      results.push(result);
    }

    const hasRealError = results.some(r => r.status === 'error');
    const hasSuccess = results.some(r => r.status === 'success');
    const allSkipped = results.length > 0 && results.every(r => r.status === 'skipped');

    let status: ApplyStepStatus = 'success';
    if (hasRealError) status = 'error';
    else if (allSkipped) status = 'skipped';
    else if (hasSuccess && results.some(r => r.status === 'skipped')) status = 'partial';
    else if (results.length === 0) status = 'skipped';

    return {
      step: 'Issue Types',
      status,
      results,
    };
  }

  private async createIssueType(issueType: IssueTypeConfig, targetInfo: TargetProjectInfo): Promise<ApplyItemResult> {
    const existingId = targetInfo.existingIssueTypes.get(issueType.name.toLowerCase());
    if (existingId) {
      return {
        name: issueType.name,
        status: 'skipped',
        reason: `Already exists in project (ID: ${existingId})`,
      };
    }

    const isTeamManaged = !targetInfo.issueTypeSchemeId;

    try {
      const created = await this.client.createIssueType({
        name: issueType.name,
        description: issueType.description,
        type: issueType.subtask ? 'subtask' : 'standard',
        hierarchyLevel: issueType.hierarchyLevel,
        projectId: isTeamManaged ? targetInfo.projectId : undefined,
      });

      if (targetInfo.issueTypeSchemeId) {
        await this.client.addIssueTypeToScheme(targetInfo.issueTypeSchemeId, created.id);
      }

      return {
        name: issueType.name,
        status: 'success',
        reason: isTeamManaged ? `Created project-scoped issue type with ID ${created.id}` : `Created issue type with ID ${created.id}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('409') || errorMsg.toLowerCase().includes('already exists')) {
        return this.addExistingIssueTypeToScheme(issueType, targetInfo);
      }
      return {
        name: issueType.name,
        status: 'error',
        error: errorMsg,
      };
    }
  }

  private async addExistingIssueTypeToScheme(issueType: IssueTypeConfig, targetInfo: TargetProjectInfo): Promise<ApplyItemResult> {
    try {
      const allTypes = await this.client.getAllIssueTypes();
      const existing = allTypes.find(t => t.name.toLowerCase() === issueType.name.toLowerCase());

      if (!existing) {
        return {
          name: issueType.name,
          status: 'skipped',
          reason: 'Issue type exists but could not be found',
        };
      }

      if (targetInfo.issueTypeSchemeId) {
        await this.client.addIssueTypeToScheme(targetInfo.issueTypeSchemeId, existing.id);
        return {
          name: issueType.name,
          status: 'success',
          reason: `Added existing issue type (ID: ${existing.id}) to project scheme`,
        };
      }

      const created = await this.client.createIssueType({
        name: issueType.name,
        description: issueType.description,
        type: issueType.subtask ? 'subtask' : 'standard',
        hierarchyLevel: issueType.hierarchyLevel,
        projectId: targetInfo.projectId,
      });

      return {
        name: issueType.name,
        status: 'success',
        reason: `Created project-scoped issue type with ID ${created.id}`,
      };
    } catch (innerError) {
      const innerMsg = innerError instanceof Error ? innerError.message : 'Unknown error';
      if (innerMsg.includes('400') || innerMsg.includes('409')) {
        return {
          name: issueType.name,
          status: 'skipped',
          reason: 'Issue type already exists in project or name conflicts with global type',
        };
      }
      return {
        name: issueType.name,
        status: 'error',
        error: `Failed to add issue type to scheme: ${innerMsg}`,
      };
    }
  }

  private async applyStatuses(
    config: ExportedProjectConfig,
    targetInfo: TargetProjectInfo,
    diff: ConfigurationDiff,
  ): Promise<ApplyStepResult> {
    const results: ApplyItemResult[] = [];

    const statusesToCreate = this.collectMissingStatuses(config.workflows, diff);

    if (statusesToCreate.length === 0) {
      return {
        step: 'Workflow Statuses',
        status: 'skipped',
        results: [],
      };
    }

    try {
      const statusParams = statusesToCreate.map(s => ({
        name: s.name,
        description: '',
        statusCategory: this.mapStatusCategory(s.statusCategory.key),
      }));

      const created = await this.client.createStatuses(targetInfo.projectId, statusParams);

      for (const status of created) {
        results.push({
          name: status.name,
          status: 'success',
          reason: `Created status with ID ${status.id}`,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('400') || errorMsg.includes('409') || errorMsg.toLowerCase().includes('already exists')) {
        for (const status of statusesToCreate) {
          results.push({
            name: status.name,
            status: 'skipped',
            reason: 'Status may already exist',
          });
        }
      } else {
        results.push({
          name: 'Statuses',
          status: 'error',
          error: errorMsg,
        });
      }
    }

    const hasRealError = results.some(r => r.status === 'error');
    const hasSuccess = results.some(r => r.status === 'success');
    const allSkipped = results.length > 0 && results.every(r => r.status === 'skipped');

    let status: ApplyStepStatus = 'success';
    if (hasRealError) status = 'error';
    else if (allSkipped) status = 'skipped';
    else if (hasSuccess && results.some(r => r.status === 'skipped')) status = 'partial';
    else if (results.length === 0) status = 'skipped';

    return {
      step: 'Workflow Statuses',
      status,
      results,
    };
  }

  private collectMissingStatuses(workflows: WorkflowConfig[], diff: ConfigurationDiff): WorkflowStatus[] {
    const missingStatuses: WorkflowStatus[] = [];
    const seenIds = new Set<string>();

    for (const wfDiff of diff.workflows.modified) {
      const workflow = workflows.find(w => w.id === wfDiff.item.id);
      if (!workflow) continue;

      for (const status of workflow.statuses) {
        if (!seenIds.has(status.id)) {
          seenIds.add(status.id);
          missingStatuses.push(status);
        }
      }
    }

    return missingStatuses;
  }

  private mapStatusCategory(key: string): 'TODO' | 'IN_PROGRESS' | 'DONE' {
    switch (key.toLowerCase()) {
      case 'new':
      case 'undefined':
        return 'TODO';
      case 'indeterminate':
        return 'IN_PROGRESS';
      case 'done':
        return 'DONE';
      default:
        return 'TODO';
    }
  }

  private async applyBoards(
    config: ExportedProjectConfig,
    targetInfo: TargetProjectInfo,
    diff: ConfigurationDiff,
  ): Promise<ApplyStepResult> {
    const results: ApplyItemResult[] = [];

    for (const boardDiff of diff.boards.new) {
      const boardConfig = boardDiff.item;
      const result = await this.createBoard(boardConfig, targetInfo);
      results.push(result);
    }

    const hasRealError = results.some(r => r.status === 'error');
    const hasSuccess = results.some(r => r.status === 'success');
    const allSkipped = results.length > 0 && results.every(r => r.status === 'skipped');

    let status: ApplyStepStatus = 'success';
    if (hasRealError) status = 'error';
    else if (allSkipped) status = 'skipped';
    else if (hasSuccess && results.some(r => r.status === 'skipped')) status = 'partial';
    else if (results.length === 0) status = 'skipped';

    return {
      step: 'Boards',
      status,
      results,
    };
  }

  private async createBoard(boardConfig: BoardDetailedConfig, targetInfo: TargetProjectInfo): Promise<ApplyItemResult> {
    try {
      const jql = boardConfig.filter.query.replace(/project\s*=\s*\w+/gi, `project = ${targetInfo.projectKey}`);
      const filterName = `Filter for ${boardConfig.name} - ${targetInfo.projectKey}`;

      const filter = await this.client.createFilter({
        name: filterName,
        jql: jql,
        favourite: false,
      });

      if (!filter) {
        return {
          name: boardConfig.name,
          status: 'error',
          error: 'Failed to create filter for board',
        };
      }

      const boardType = boardConfig.type === 'simple' ? 'kanban' : boardConfig.type;
      const board = await this.client.createBoard({
        name: boardConfig.name,
        type: boardType,
        filterId: filter.id,
        projectKeyOrId: targetInfo.projectKey,
      });

      if (!board) {
        return {
          name: boardConfig.name,
          status: 'error',
          error: 'Failed to create board',
        };
      }

      return {
        name: boardConfig.name,
        status: 'success',
        reason: `Created board (ID: ${board.id}) with filter "${filterName}"`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('400') || errorMsg.includes('409') || errorMsg.toLowerCase().includes('already exists')) {
        return {
          name: boardConfig.name,
          status: 'skipped',
          reason: 'Board or filter with this name may already exist',
        };
      }
      return {
        name: boardConfig.name,
        status: 'error',
        error: errorMsg,
      };
    }
  }
}
