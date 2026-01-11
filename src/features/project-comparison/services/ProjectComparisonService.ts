import type { JiraClient } from '../../../api/JiraClient';
import type { ConfigurationDiff, DiffCategory, FieldConfig, IssueTypeConfig, WorkflowConfig, BoardDetailedConfig } from '../../../types';

interface ProjectConfig {
  key: string;
  name: string;
  fields: FieldConfig[];
  issueTypes: IssueTypeConfig[];
  workflows: WorkflowConfig[];
  boards: BoardDetailedConfig[];
}

export interface ComparisonProjectInfo {
  key: string;
  name: string;
  fieldsCount: number;
  issueTypesCount: number;
  workflowsCount: number;
  boardsCount: number;
}

export interface ProjectComparisonResult {
  diff: ConfigurationDiff;
  projectAInfo: ComparisonProjectInfo;
  projectBInfo: ComparisonProjectInfo;
}

export class ProjectComparisonService {
  async compare(clientA: JiraClient, projectKeyA: string, clientB: JiraClient, projectKeyB: string): Promise<ProjectComparisonResult> {
    const [configA, configB] = await Promise.all([
      this.fetchProjectConfig(clientA, projectKeyA),
      this.fetchProjectConfig(clientB, projectKeyB),
    ]);

    const diff = this.generateDiff(configA, configB);

    return {
      diff,
      projectAInfo: {
        key: configA.key,
        name: configA.name,
        fieldsCount: configA.fields.length,
        issueTypesCount: configA.issueTypes.length,
        workflowsCount: configA.workflows.length,
        boardsCount: configA.boards.length,
      },
      projectBInfo: {
        key: configB.key,
        name: configB.name,
        fieldsCount: configB.fields.length,
        issueTypesCount: configB.issueTypes.length,
        workflowsCount: configB.workflows.length,
        boardsCount: configB.boards.length,
      },
    };
  }

  private async fetchProjectConfig(client: JiraClient, projectKey: string): Promise<ProjectConfig> {
    const project = await client.getProject(projectKey);
    const [fields, issueTypes, statuses, boards] = await Promise.all([
      client.getProjectFields(project.id),
      client.getIssueTypesForProject(projectKey),
      client.getProjectStatuses(projectKey),
      this.fetchBoardConfigs(client, projectKey),
    ]);

    const workflows = this.buildWorkflowsFromStatuses(statuses);

    return {
      key: project.key,
      name: project.name,
      fields: fields.filter(f => f.custom).map(f => this.mapField(f)),
      issueTypes: issueTypes.map(it => this.mapIssueType(it)),
      workflows,
      boards,
    };
  }

  private async fetchBoardConfigs(client: JiraClient, projectKey: string): Promise<BoardDetailedConfig[]> {
    const boards = await client.getBoardsForProject(projectKey);
    const configs: BoardDetailedConfig[] = [];

    for (const board of boards) {
      const config = await client.getBoardConfiguration(board.id);
      if (!config) continue;

      const quickFilters = await client.getBoardQuickFilters(board.id);

      configs.push({
        id: board.id,
        name: board.name,
        type: board.type,
        filter: {
          id: config.filter.id,
          name: config.filter.name,
          query: config.filter.query,
        },
        columnConfig: {
          columns: config.columnConfig.columns.map(col => ({
            name: col.name,
            statuses: col.statuses.map(s => ({ id: s.id, name: s.name })),
            min: col.min,
            max: col.max,
          })),
          constraintType: config.columnConfig.constraintType as BoardDetailedConfig['columnConfig']['constraintType'],
        },
        quickFilters: quickFilters.map(qf => ({
          id: qf.id,
          name: qf.name,
          query: qf.query,
          description: qf.description,
        })),
      });
    }

    return configs;
  }

  private buildWorkflowsFromStatuses(
    statuses: {
      issueTypeId: string;
      issueTypeName: string;
      statuses: { id: string; name: string; statusCategory: { id: number; key: string; name: string } }[];
    }[],
  ): WorkflowConfig[] {
    const workflowMap = new Map<string, WorkflowConfig>();

    for (const its of statuses) {
      const statusKey = its.statuses
        .map(s => s.id)
        .sort()
        .join(',');

      if (!workflowMap.has(statusKey)) {
        workflowMap.set(statusKey, {
          id: `workflow-${statusKey}`,
          name: `Workflow for ${its.issueTypeName}`,
          statuses: its.statuses.map(s => ({
            id: s.id,
            name: s.name,
            statusCategory: s.statusCategory,
          })),
          transitions: [],
          issueTypes: [its.issueTypeId],
        });
      } else {
        const wf = workflowMap.get(statusKey)!;
        wf.issueTypes.push(its.issueTypeId);
        wf.name = `Shared workflow (${wf.issueTypes.length} types)`;
      }
    }

    return Array.from(workflowMap.values());
  }

  private mapField(field: {
    id: string;
    key?: string;
    name: string;
    custom: boolean;
    schema?: { type: string; custom?: string };
  }): FieldConfig {
    return {
      id: field.id,
      key: field.key || field.id,
      name: field.name,
      type: field.schema?.type || 'unknown',
      custom: field.custom,
      required: false,
      schema: { type: field.schema?.type || 'unknown', custom: field.schema?.custom },
      contexts: [],
      options: [],
    };
  }

  private mapIssueType(it: { id: string; name: string; description?: string; subtask: boolean; hierarchyLevel: number }): IssueTypeConfig {
    return {
      id: it.id,
      name: it.name,
      description: it.description,
      subtask: it.subtask,
      hierarchyLevel: it.hierarchyLevel,
    };
  }

  private generateDiff(configA: ProjectConfig, configB: ProjectConfig): ConfigurationDiff {
    return {
      fields: this.compareItems(configA.fields, configB.fields, f => f.id),
      issueTypes: this.compareItems(configA.issueTypes, configB.issueTypes, it => it.name.toLowerCase()),
      workflows: this.compareWorkflows(configA.workflows, configB.workflows),
      boards: this.compareBoards(configA.boards, configB.boards),
    };
  }

  private compareItems<T extends { id: string }>(itemsA: T[], itemsB: T[], keyFn: (item: T) => string): DiffCategory<T> {
    const result: DiffCategory<T> = {
      new: [],
      modified: [],
      skipped: [],
      unchanged: [],
    };

    const mapB = new Map(itemsB.map(item => [keyFn(item), item]));
    const seenInB = new Set<string>();

    for (const itemA of itemsA) {
      const key = keyFn(itemA);
      const itemB = mapB.get(key);

      if (itemB) {
        seenInB.add(key);
        result.unchanged.push({
          item: itemA,
          status: 'unchanged',
          reason: `Exists in both projects`,
        });
      } else {
        result.new.push({
          item: itemA,
          status: 'new',
          reason: `Only in Project A`,
        });
      }
    }

    for (const itemB of itemsB) {
      const key = keyFn(itemB);
      if (!seenInB.has(key)) {
        result.skipped.push({
          item: itemB,
          status: 'skipped',
          reason: `Only in Project B`,
        });
      }
    }

    return result;
  }

  private compareWorkflows(workflowsA: WorkflowConfig[], workflowsB: WorkflowConfig[]): DiffCategory<WorkflowConfig> {
    const result: DiffCategory<WorkflowConfig> = {
      new: [],
      modified: [],
      skipped: [],
      unchanged: [],
    };

    const statusMapA = new Map<string, { id: string; name: string; category?: string }>();
    const statusMapB = new Map<string, { id: string; name: string; category?: string }>();

    for (const wf of workflowsA) {
      for (const s of wf.statuses) {
        statusMapA.set(s.name.toLowerCase(), {
          id: s.id,
          name: s.name,
          category: s.statusCategory?.name,
        });
      }
    }

    for (const wf of workflowsB) {
      for (const s of wf.statuses) {
        statusMapB.set(s.name.toLowerCase(), {
          id: s.id,
          name: s.name,
          category: s.statusCategory?.name,
        });
      }
    }

    for (const [key, statusA] of statusMapA) {
      const statusB = statusMapB.get(key);
      const item: WorkflowConfig = {
        id: statusA.id,
        name: statusA.name,
        statuses: [],
        transitions: [],
        issueTypes: [],
      };

      if (!statusB) {
        result.new.push({
          item,
          status: 'new',
          reason: statusA.category || 'Only in Project A',
        });
      } else {
        result.unchanged.push({
          item,
          status: 'unchanged',
          reason: statusA.category || 'In both projects',
        });
      }
    }

    for (const [key, statusB] of statusMapB) {
      if (!statusMapA.has(key)) {
        result.skipped.push({
          item: {
            id: statusB.id,
            name: statusB.name,
            statuses: [],
            transitions: [],
            issueTypes: [],
          },
          status: 'skipped',
          reason: statusB.category || 'Only in Project B',
        });
      }
    }

    result.new.sort((a, b) => a.item.name.localeCompare(b.item.name));
    result.skipped.sort((a, b) => a.item.name.localeCompare(b.item.name));
    result.unchanged.sort((a, b) => a.item.name.localeCompare(b.item.name));

    return result;
  }

  private compareBoards(boardsA: BoardDetailedConfig[], boardsB: BoardDetailedConfig[]): DiffCategory<BoardDetailedConfig> {
    const result: DiffCategory<BoardDetailedConfig> = {
      new: [],
      modified: [],
      skipped: [],
      unchanged: [],
    };

    for (const boardA of boardsA) {
      const boardB = boardsB.find(b => b.name.toLowerCase() === boardA.name.toLowerCase());

      if (!boardB) {
        result.new.push({
          item: boardA,
          status: 'new',
          reason: `Only in Project A`,
        });
      } else {
        const colsA = boardA.columnConfig.columns.map(c => c.name).join(', ');
        const colsB = boardB.columnConfig.columns.map(c => c.name).join(', ');

        if (colsA !== colsB) {
          result.modified.push({
            item: boardA,
            status: 'modified',
            reason: `Different columns: [${colsA}] vs [${colsB}]`,
          });
        } else {
          result.unchanged.push({
            item: boardA,
            status: 'unchanged',
            reason: `Same configuration`,
          });
        }
      }
    }

    for (const boardB of boardsB) {
      const boardA = boardsA.find(b => b.name.toLowerCase() === boardB.name.toLowerCase());
      if (!boardA) {
        result.skipped.push({
          item: boardB,
          status: 'skipped',
          reason: `Only in Project B`,
        });
      }
    }

    return result;
  }
}
