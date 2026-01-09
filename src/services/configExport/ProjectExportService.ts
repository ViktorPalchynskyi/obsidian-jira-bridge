import type { App } from 'obsidian';
import type { JiraInstance } from '../../types';
import type {
  ExportedProjectConfig,
  ExportMeta,
  FieldConfig,
  UserConfig,
  PriorityConfig,
  IssueTypeConfig,
  BoardConfig,
  BoardDetailedConfig,
  ExportProgressCallback,
} from '../../types/configExport.types';
import { JiraClient } from '../../api/JiraClient';
import { FieldExportService } from './FieldExportService';
import { WorkflowExportService } from './WorkflowExportService';

const CONFIG_VERSION = '1.0';

export interface ExportOptions {
  includeFields: boolean;
  includeWorkflows: boolean;
  includeIssueTypes: boolean;
  includeBoards: boolean;
}

export class ProjectExportService {
  private client: JiraClient;
  private fieldExportService: FieldExportService;
  private workflowExportService: WorkflowExportService;

  constructor(
    private app: App,
    private instance: JiraInstance,
    private pluginVersion: string,
  ) {
    this.client = new JiraClient(instance);
    this.fieldExportService = new FieldExportService(app, instance, pluginVersion);
    this.workflowExportService = new WorkflowExportService(instance);
  }

  async exportProjectConfig(
    projectKey: string,
    issueTypeIds: string[],
    options: ExportOptions,
    onProgress?: ExportProgressCallback,
  ): Promise<ExportedProjectConfig> {
    const progress = (step: string, current: number, total: number, detail?: string) => {
      onProgress?.({ step, current, total, detail });
    };

    const totalSteps = this.calculateTotalSteps(options);
    let currentStep = 0;

    progress('Fetching project details', currentStep++, totalSteps);
    const project = await this.client.getProject(projectKey);

    if (project.projectTypeKey !== 'software') {
      throw new Error(`Only software projects are supported. Project ${projectKey} is of type ${project.projectTypeKey}`);
    }

    let fields: FieldConfig[] = [];
    let assignableUsers: UserConfig[] = [];
    let priorities: PriorityConfig[] = [];

    if (options.includeFields) {
      progress('Fetching fields', currentStep++, totalSteps);
      const fieldConfig = await this.fieldExportService.exportFieldConfig(projectKey, issueTypeIds, subProgress => {
        progress(subProgress.step, currentStep - 1, totalSteps, subProgress.detail);
      });
      fields = fieldConfig.fields;
      assignableUsers = fieldConfig.assignableUsers;
      priorities = fieldConfig.priorities;
    }

    let issueTypes: IssueTypeConfig[] = [];
    if (options.includeIssueTypes) {
      progress('Fetching issue types', currentStep++, totalSteps);
      issueTypes = await this.fetchIssueTypes(projectKey, issueTypeIds);
    }

    let workflows: ExportedProjectConfig['workflows'] = [];
    let workflowScheme: ExportedProjectConfig['workflowScheme'] = null;

    if (options.includeWorkflows) {
      progress('Fetching workflows', currentStep++, totalSteps);
      const workflowData = await this.workflowExportService.exportWorkflows(projectKey, project.id, issueTypeIds);
      workflows = workflowData.workflows;
      workflowScheme = workflowData.workflowScheme;
    }

    let boards: BoardConfig[] = [];
    let boardConfigs: BoardDetailedConfig[] = [];
    if (options.includeBoards) {
      progress('Fetching boards', currentStep++, totalSteps);
      const boardData = await this.fetchBoardsWithConfig(projectKey);
      boards = boardData.boards;
      boardConfigs = boardData.boardConfigs;
    }

    const meta: ExportMeta = {
      version: CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      pluginVersion: this.pluginVersion,
      projectKey: project.key,
      projectName: project.name,
      projectId: project.id,
      projectType: 'software',
      instanceName: this.instance.name,
      instanceId: this.instance.id,
      selectedIssueTypes: issueTypeIds,
    };

    progress('Export complete', totalSteps, totalSteps);

    return {
      meta,
      fields,
      assignableUsers,
      priorities,
      issueTypes,
      workflows,
      workflowScheme,
      boards,
      boardConfigs,
    };
  }

  private calculateTotalSteps(options: ExportOptions): number {
    let steps = 1;
    if (options.includeFields) steps++;
    if (options.includeIssueTypes) steps++;
    if (options.includeWorkflows) steps++;
    if (options.includeBoards) steps++;
    return steps;
  }

  private async fetchIssueTypes(projectKey: string, selectedIssueTypeIds: string[]): Promise<IssueTypeConfig[]> {
    const allIssueTypes = await this.client.getIssueTypesForProject(projectKey);
    return allIssueTypes
      .filter(it => selectedIssueTypeIds.includes(it.id))
      .map(it => ({
        id: it.id,
        name: it.name,
        description: it.description,
        iconUrl: it.iconUrl,
        subtask: it.subtask,
        hierarchyLevel: it.hierarchyLevel,
      }));
  }

  private async fetchBoardsWithConfig(projectKey: string): Promise<{ boards: BoardConfig[]; boardConfigs: BoardDetailedConfig[] }> {
    const boards = await this.client.getBoardsForProject(projectKey);
    const basicBoards: BoardConfig[] = boards.map(b => ({
      id: b.id,
      name: b.name,
      type: b.type,
    }));

    const boardConfigs: BoardDetailedConfig[] = [];

    for (const board of boards) {
      const config = await this.client.getBoardConfiguration(board.id);
      if (!config) continue;

      const quickFilters = await this.client.getBoardQuickFilters(board.id);

      boardConfigs.push({
        id: board.id,
        name: board.name,
        type: board.type,
        filter: {
          id: config.filter.id,
          name: config.filter.name,
          query: config.filter.query,
        },
        subQuery: config.subQuery,
        columnConfig: {
          columns: config.columnConfig.columns.map(col => ({
            name: col.name,
            statuses: col.statuses.map(s => ({ id: s.id, name: s.name })),
            min: col.min,
            max: col.max,
          })),
          constraintType: config.columnConfig.constraintType as BoardDetailedConfig['columnConfig']['constraintType'],
        },
        estimation: config.estimation
          ? {
              type: config.estimation.type as 'none' | 'field',
              field: config.estimation.field,
            }
          : undefined,
        ranking: config.ranking,
        quickFilters: quickFilters.map(qf => ({
          id: qf.id,
          name: qf.name,
          query: qf.query,
          description: qf.description,
        })),
      });
    }

    return { boards: basicBoards, boardConfigs };
  }

  async saveToVault(config: ExportedProjectConfig, basePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const folderName = `${config.meta.projectKey}-${timestamp}`;
    const folderPath = `${basePath}/${folderName}`;

    await this.ensureFolderExists(basePath);
    await this.ensureFolderExists(folderPath);

    const jsonContent = JSON.stringify(config, null, 2);
    await this.app.vault.create(`${folderPath}/config.json`, jsonContent);

    const readmeContent = this.generateReadme(config);
    await this.app.vault.create(`${folderPath}/README.md`, readmeContent);

    if (config.fields.length > 0) {
      const fieldsContent = this.generateFieldsMarkdown(config);
      await this.app.vault.create(`${folderPath}/fields.md`, fieldsContent);
    }

    if (config.workflows.length > 0) {
      const workflowsContent = this.generateWorkflowsMarkdown(config);
      await this.app.vault.create(`${folderPath}/workflows.md`, workflowsContent);
    }

    if (config.issueTypes.length > 0) {
      const issueTypesContent = this.generateIssueTypesMarkdown(config);
      await this.app.vault.create(`${folderPath}/issue-types.md`, issueTypesContent);
    }

    if (config.boards.length > 0) {
      const boardsContent = this.generateBoardsMarkdown(config);
      await this.app.vault.create(`${folderPath}/boards.md`, boardsContent);
    }

    return folderPath;
  }

  private async ensureFolderExists(path: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder) {
      await this.app.vault.createFolder(path);
    }
  }

  private generateReadme(config: ExportedProjectConfig): string {
    const lines: string[] = [];

    lines.push(`# Project Configuration: ${config.meta.projectKey}`);
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(`| Property | Value |`);
    lines.push(`|----------|-------|`);
    lines.push(`| Project | ${config.meta.projectName} (${config.meta.projectKey}) |`);
    lines.push(`| Instance | ${config.meta.instanceName} |`);
    lines.push(`| Project Type | ${config.meta.projectType} |`);
    lines.push(`| Exported | ${new Date(config.meta.exportedAt).toLocaleString()} |`);
    lines.push(`| Plugin Version | ${config.meta.pluginVersion} |`);
    lines.push(`| Config Version | ${config.meta.version} |`);
    lines.push('');

    lines.push('## Contents');
    lines.push('');
    lines.push(`- **Fields:** ${config.fields.length}`);
    lines.push(`- **Issue Types:** ${config.issueTypes.length}`);
    lines.push(`- **Workflows:** ${config.workflows.length}`);
    lines.push(`- **Boards:** ${config.boards.length}`);
    lines.push(`- **Assignable Users:** ${config.assignableUsers.length}`);
    lines.push(`- **Priorities:** ${config.priorities.length}`);
    lines.push('');

    lines.push('## Files');
    lines.push('');
    lines.push('- `config.json` - Full configuration in JSON format');
    lines.push('- `README.md` - This file');
    if (config.fields.length > 0) lines.push('- `fields.md` - Field details');
    if (config.workflows.length > 0) lines.push('- `workflows.md` - Workflow details');
    if (config.issueTypes.length > 0) lines.push('- `issue-types.md` - Issue type details');
    if (config.boards.length > 0) lines.push('- `boards.md` - Board details');
    lines.push('');

    lines.push('## Selected Issue Types');
    lines.push('');
    for (const it of config.issueTypes) {
      lines.push(`- ${it.name}${it.subtask ? ' (subtask)' : ''}`);
    }

    return lines.join('\n');
  }

  private generateFieldsMarkdown(config: ExportedProjectConfig): string {
    const lines: string[] = [];

    lines.push(`# Fields: ${config.meta.projectKey}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push('| Field Name | Field ID | Type | Custom | Options |');
    lines.push('|------------|----------|------|--------|---------|');

    for (const field of config.fields) {
      const optionsCount = field.options.length > 0 ? `${field.options.length} options` : '-';
      lines.push(`| ${field.name} | ${field.id} | ${field.type} | ${field.custom ? 'Yes' : 'No'} | ${optionsCount} |`);
    }

    lines.push('');
    lines.push('## Details');
    lines.push('');

    for (const field of config.fields) {
      lines.push(`### ${field.name} (${field.id})`);
      lines.push('');
      lines.push(`- **Type:** ${field.type}`);
      lines.push(`- **Custom:** ${field.custom ? 'Yes' : 'No'}`);

      if (field.contexts.length > 0) {
        lines.push(`- **Contexts:** ${field.contexts.length}`);
      }

      if (field.options.length > 0) {
        lines.push(`- **Options** (${field.options.length}):`);
        for (const opt of field.options.slice(0, 20)) {
          lines.push(`  - ${opt.value}${opt.disabled ? ' (disabled)' : ''}`);
        }
        if (field.options.length > 20) {
          lines.push(`  - ... and ${field.options.length - 20} more`);
        }
      }

      lines.push('');
    }

    lines.push('## Assignable Users');
    lines.push('');
    lines.push(`Total: ${config.assignableUsers.length} users`);
    lines.push('');

    for (const user of config.assignableUsers.slice(0, 50)) {
      lines.push(`- ${user.displayName}`);
    }
    if (config.assignableUsers.length > 50) {
      lines.push(`- ... and ${config.assignableUsers.length - 50} more`);
    }

    lines.push('');
    lines.push('## Priorities');
    lines.push('');

    for (const priority of config.priorities) {
      lines.push(`- ${priority.name}`);
    }

    return lines.join('\n');
  }

  private generateWorkflowsMarkdown(config: ExportedProjectConfig): string {
    const lines: string[] = [];

    lines.push(`# Workflows: ${config.meta.projectKey}`);
    lines.push('');

    if (config.workflowScheme) {
      lines.push('## Workflow Scheme');
      lines.push('');
      lines.push(`**Name:** ${config.workflowScheme.name}`);
      lines.push(`**Default Workflow:** ${config.workflowScheme.defaultWorkflow}`);
      lines.push('');

      if (Object.keys(config.workflowScheme.issueTypeMappings).length > 0) {
        lines.push('### Issue Type Mappings');
        lines.push('');
        lines.push('| Issue Type | Workflow |');
        lines.push('|------------|----------|');
        for (const [issueType, workflow] of Object.entries(config.workflowScheme.issueTypeMappings)) {
          const issueTypeName = config.issueTypes.find(it => it.id === issueType)?.name || issueType;
          lines.push(`| ${issueTypeName} | ${workflow} |`);
        }
        lines.push('');
      }
    }

    lines.push('## Workflows');
    lines.push('');

    for (const workflow of config.workflows) {
      lines.push(`### ${workflow.name}`);
      lines.push('');

      if (workflow.description) {
        lines.push(`${workflow.description}`);
        lines.push('');
      }

      if (workflow.issueTypes.length > 0) {
        lines.push(`**Issue Types:** ${workflow.issueTypes.join(', ')}`);
        lines.push('');
      }

      if (workflow.statuses.length > 0) {
        lines.push('#### Statuses');
        lines.push('');
        lines.push('| Status | Category |');
        lines.push('|--------|----------|');
        for (const status of workflow.statuses) {
          lines.push(`| ${status.name} | ${status.statusCategory.name} |`);
        }
        lines.push('');
      }

      if (workflow.transitions.length > 0) {
        lines.push('#### Transitions');
        lines.push('');
        lines.push('| Transition | From | To |');
        lines.push('|------------|------|-----|');
        for (const transition of workflow.transitions) {
          const fromStatus = transition.from ? workflow.statuses.find(s => s.id === transition.from)?.name || transition.from : 'Any';
          const toStatus = workflow.statuses.find(s => s.id === transition.to)?.name || transition.to;
          lines.push(`| ${transition.name} | ${fromStatus} | ${toStatus} |`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private generateIssueTypesMarkdown(config: ExportedProjectConfig): string {
    const lines: string[] = [];

    lines.push(`# Issue Types: ${config.meta.projectKey}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push('| Name | ID | Subtask | Hierarchy Level |');
    lines.push('|------|-----|---------|-----------------|');

    for (const it of config.issueTypes) {
      lines.push(`| ${it.name} | ${it.id} | ${it.subtask ? 'Yes' : 'No'} | ${it.hierarchyLevel} |`);
    }

    lines.push('');
    lines.push('## Details');
    lines.push('');

    for (const it of config.issueTypes) {
      lines.push(`### ${it.name}`);
      lines.push('');
      lines.push(`- **ID:** ${it.id}`);
      lines.push(`- **Subtask:** ${it.subtask ? 'Yes' : 'No'}`);
      lines.push(`- **Hierarchy Level:** ${it.hierarchyLevel}`);

      if (it.description) {
        lines.push(`- **Description:** ${it.description}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  private generateBoardsMarkdown(config: ExportedProjectConfig): string {
    const lines: string[] = [];

    lines.push(`# Boards: ${config.meta.projectKey}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push('| Name | ID | Type |');
    lines.push('|------|-----|------|');

    for (const board of config.boards) {
      lines.push(`| ${board.name} | ${board.id} | ${board.type} |`);
    }

    lines.push('');

    if (config.boardConfigs.length > 0) {
      lines.push('## Detailed Configuration');
      lines.push('');

      for (const boardConfig of config.boardConfigs) {
        lines.push(`### ${boardConfig.name}`);
        lines.push('');
        lines.push(`- **ID:** ${boardConfig.id}`);
        lines.push(`- **Type:** ${boardConfig.type}`);
        lines.push(`- **Filter:** ${boardConfig.filter.name} (ID: ${boardConfig.filter.id})`);
        lines.push(`- **Filter JQL:** \`${boardConfig.filter.query}\``);

        if (boardConfig.subQuery) {
          lines.push(`- **Sub-query:** \`${boardConfig.subQuery.query}\``);
        }

        if (boardConfig.estimation) {
          lines.push(
            `- **Estimation:** ${boardConfig.estimation.type}${boardConfig.estimation.field ? ` (${boardConfig.estimation.field.displayName})` : ''}`,
          );
        }

        lines.push('');
        lines.push('#### Columns');
        lines.push('');
        lines.push('| Column | Statuses | Min | Max |');
        lines.push('|--------|----------|-----|-----|');

        for (const col of boardConfig.columnConfig.columns) {
          const statusNames = col.statuses.map(s => s.name || s.id).join(', ');
          lines.push(`| ${col.name} | ${statusNames || '-'} | ${col.min ?? '-'} | ${col.max ?? '-'} |`);
        }

        if (boardConfig.columnConfig.constraintType) {
          lines.push('');
          lines.push(`**Constraint Type:** ${boardConfig.columnConfig.constraintType}`);
        }

        if (boardConfig.quickFilters.length > 0) {
          lines.push('');
          lines.push('#### Quick Filters');
          lines.push('');
          lines.push('| Name | Query |');
          lines.push('|------|-------|');

          for (const qf of boardConfig.quickFilters) {
            lines.push(`| ${qf.name} | \`${qf.query}\` |`);
          }
        }

        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
