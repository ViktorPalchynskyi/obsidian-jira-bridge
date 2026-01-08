import type { JiraInstance } from '../../types';
import type { WorkflowConfig, WorkflowSchemeConfig, WorkflowStatus, WorkflowTransition } from '../../types/configExport.types';
import { JiraClient } from '../../api/JiraClient';

export class WorkflowExportService {
  private client: JiraClient;

  constructor(private instance: JiraInstance) {
    this.client = new JiraClient(instance);
  }

  async exportWorkflows(
    projectKey: string,
    projectId: string,
    issueTypeIds: string[],
  ): Promise<{ workflows: WorkflowConfig[]; workflowScheme: WorkflowSchemeConfig | null }> {
    const workflowScheme = await this.fetchWorkflowScheme(projectId);
    const projectStatuses = await this.client.getProjectStatuses(projectKey);

    if (workflowScheme) {
      const allWorkflows = await this.client.getWorkflows();
      const relevantWorkflowNames = this.getRelevantWorkflowNames(workflowScheme, issueTypeIds);
      const workflows = this.filterAndMapWorkflows(allWorkflows, relevantWorkflowNames, projectStatuses, issueTypeIds);

      return {
        workflows,
        workflowScheme: {
          id: workflowScheme.id,
          name: workflowScheme.name,
          defaultWorkflow: workflowScheme.defaultWorkflow,
          issueTypeMappings: workflowScheme.issueTypeMappings,
        },
      };
    }

    const workflows = this.buildWorkflowsFromProjectStatuses(projectStatuses, issueTypeIds);

    return {
      workflows,
      workflowScheme: null,
    };
  }

  private async fetchWorkflowScheme(projectId: string): Promise<{
    id: string;
    name: string;
    defaultWorkflow: string;
    issueTypeMappings: Record<string, string>;
  } | null> {
    return this.client.getWorkflowScheme(projectId);
  }

  private getRelevantWorkflowNames(
    workflowScheme: { defaultWorkflow: string; issueTypeMappings: Record<string, string> },
    issueTypeIds: string[],
  ): Set<string> {
    const names = new Set<string>();

    if (workflowScheme.defaultWorkflow) {
      names.add(workflowScheme.defaultWorkflow);
    }

    for (const issueTypeId of issueTypeIds) {
      const workflowName = workflowScheme.issueTypeMappings[issueTypeId];
      if (workflowName) {
        names.add(workflowName);
      }
    }

    return names;
  }

  private filterAndMapWorkflows(
    allWorkflows: {
      id: string;
      name: string;
      description?: string;
      statuses: { id: string; name: string; statusCategory: { id: number; key: string; name: string } }[];
      transitions: { id: string; name: string; from: string | null; to: string }[];
    }[],
    relevantWorkflowNames: Set<string>,
    projectStatuses: {
      issueTypeId: string;
      issueTypeName: string;
      statuses: { id: string; name: string; statusCategory: { id: number; key: string; name: string } }[];
    }[],
    issueTypeIds: string[],
  ): WorkflowConfig[] {
    const workflows: WorkflowConfig[] = [];

    for (const wf of allWorkflows) {
      if (!relevantWorkflowNames.has(wf.name)) {
        continue;
      }

      const issueTypes = this.getIssueTypesForWorkflow(wf.name, issueTypeIds, projectStatuses);

      const statuses: WorkflowStatus[] = wf.statuses.map(s => ({
        id: s.id,
        name: s.name,
        statusCategory: s.statusCategory,
      }));

      const transitions: WorkflowTransition[] = wf.transitions.map(t => ({
        id: t.id,
        name: t.name,
        from: t.from,
        to: t.to,
      }));

      workflows.push({
        id: wf.id,
        name: wf.name,
        description: wf.description,
        statuses,
        transitions,
        issueTypes,
      });
    }

    return workflows;
  }

  private buildWorkflowsFromProjectStatuses(
    projectStatuses: {
      issueTypeId: string;
      issueTypeName: string;
      statuses: { id: string; name: string; statusCategory: { id: number; key: string; name: string } }[];
    }[],
    issueTypeIds: string[],
  ): WorkflowConfig[] {
    const statusSignatureMap = new Map<string, WorkflowConfig>();

    for (const ps of projectStatuses) {
      if (!issueTypeIds.includes(ps.issueTypeId)) {
        continue;
      }

      const statusIds = ps.statuses
        .map(s => s.id)
        .sort()
        .join(',');

      const existing = statusSignatureMap.get(statusIds);
      if (existing) {
        existing.issueTypes.push(ps.issueTypeName);
      } else {
        const statuses: WorkflowStatus[] = ps.statuses.map(s => ({
          id: s.id,
          name: s.name,
          statusCategory: s.statusCategory,
        }));

        statusSignatureMap.set(statusIds, {
          id: `workflow-${ps.issueTypeId}`,
          name: `${ps.issueTypeName} Workflow`,
          description: `Workflow for ${ps.issueTypeName} (team-managed project)`,
          statuses,
          transitions: [],
          issueTypes: [ps.issueTypeName],
        });
      }
    }

    return Array.from(statusSignatureMap.values());
  }

  private getIssueTypesForWorkflow(
    _workflowName: string,
    issueTypeIds: string[],
    projectStatuses: { issueTypeId: string; issueTypeName: string }[],
  ): string[] {
    const issueTypeNames: string[] = [];

    for (const status of projectStatuses) {
      if (issueTypeIds.includes(status.issueTypeId)) {
        issueTypeNames.push(status.issueTypeName);
      }
    }

    return issueTypeNames;
  }
}
