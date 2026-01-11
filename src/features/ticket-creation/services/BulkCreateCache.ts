import type { JiraInstance, JiraIssueType, JiraPriority, JiraFieldMeta } from '../../../types';
import { JiraClient } from '../../../api/JiraClient';

export class BulkCreateCache {
  private issueTypes = new Map<string, JiraIssueType[]>();
  private priorities = new Map<string, JiraPriority[]>();
  private fieldsMeta = new Map<string, JiraFieldMeta[]>();
  private existingSummaries = new Map<string, Map<string, string>>();
  private assignableUsers = new Map<string, { accountId: string; displayName: string }[]>();
  private clients = new Map<string, JiraClient>();

  constructor(private instances: JiraInstance[]) {
    for (const instance of instances) {
      this.clients.set(instance.id, new JiraClient(instance));
    }
  }

  getClient(instanceId: string): JiraClient | undefined {
    return this.clients.get(instanceId);
  }

  async getIssueTypes(instanceId: string, projectKey: string): Promise<JiraIssueType[]> {
    const cacheKey = `${instanceId}:${projectKey}`;
    if (this.issueTypes.has(cacheKey)) {
      return this.issueTypes.get(cacheKey)!;
    }

    const client = this.clients.get(instanceId);
    if (!client) return [];

    const types = await client.getIssueTypes(projectKey);
    this.issueTypes.set(cacheKey, types);
    return types;
  }

  async getPriorities(instanceId: string): Promise<JiraPriority[]> {
    if (this.priorities.has(instanceId)) {
      return this.priorities.get(instanceId)!;
    }

    const client = this.clients.get(instanceId);
    if (!client) return [];

    const priorities = await client.getPriorities();
    this.priorities.set(instanceId, priorities);
    return priorities;
  }

  async getFieldsMeta(instanceId: string, projectKey: string, issueTypeId: string): Promise<JiraFieldMeta[]> {
    const cacheKey = `${instanceId}:${projectKey}:${issueTypeId}`;
    if (this.fieldsMeta.has(cacheKey)) {
      return this.fieldsMeta.get(cacheKey)!;
    }

    const client = this.clients.get(instanceId);
    if (!client) return [];

    const fields = await client.getFieldsForIssueType(projectKey, issueTypeId);
    this.fieldsMeta.set(cacheKey, fields);
    return fields;
  }

  async checkDuplicates(instanceId: string, projectKey: string, summaries: string[]): Promise<Map<string, string>> {
    const cacheKey = `${instanceId}:${projectKey}`;
    let projectSummaries = this.existingSummaries.get(cacheKey);

    if (!projectSummaries) {
      projectSummaries = new Map();
      this.existingSummaries.set(cacheKey, projectSummaries);
    }

    const client = this.clients.get(instanceId);
    if (!client) return new Map();

    const uncheckedSummaries = summaries.filter(s => !projectSummaries!.has(s.toLowerCase()));

    if (uncheckedSummaries.length > 0) {
      const duplicates = await this.batchCheckDuplicates(client, projectKey, uncheckedSummaries);
      for (const [summary, issueKey] of duplicates) {
        projectSummaries.set(summary.toLowerCase(), issueKey);
      }
      for (const summary of uncheckedSummaries) {
        if (!projectSummaries.has(summary.toLowerCase())) {
          projectSummaries.set(summary.toLowerCase(), '');
        }
      }
    }

    const result = new Map<string, string>();
    for (const summary of summaries) {
      const issueKey = projectSummaries.get(summary.toLowerCase());
      if (issueKey) {
        result.set(summary, issueKey);
      }
    }
    return result;
  }

  private async batchCheckDuplicates(client: JiraClient, projectKey: string, summaries: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const batchSize = 20;

    for (let i = 0; i < summaries.length; i += batchSize) {
      const batch = summaries.slice(i, i + batchSize);
      const batchResult = await client.searchIssuesBySummaries(projectKey, batch);
      for (const [summary, issueKey] of batchResult) {
        result.set(summary, issueKey);
      }
    }

    return result;
  }

  addCreatedIssue(instanceId: string, projectKey: string, summary: string, issueKey: string): void {
    const cacheKey = `${instanceId}:${projectKey}`;
    let projectSummaries = this.existingSummaries.get(cacheKey);
    if (!projectSummaries) {
      projectSummaries = new Map();
      this.existingSummaries.set(cacheKey, projectSummaries);
    }
    projectSummaries.set(summary.toLowerCase(), issueKey);
  }

  async getAssignableUsers(instanceId: string, projectKey: string): Promise<{ accountId: string; displayName: string }[]> {
    const cacheKey = `${instanceId}:${projectKey}`;
    if (this.assignableUsers.has(cacheKey)) {
      return this.assignableUsers.get(cacheKey)!;
    }

    const client = this.clients.get(instanceId);
    if (!client) return [];

    const users = await client.getAssignableUsers(projectKey);
    this.assignableUsers.set(cacheKey, users);
    return users;
  }

  findCreatedIssue(instanceId: string, projectKey: string, summary: string): string | null {
    const cacheKey = `${instanceId}:${projectKey}`;
    const projectSummaries = this.existingSummaries.get(cacheKey);

    if (!projectSummaries) return null;

    const issueKey = projectSummaries.get(summary.toLowerCase());
    return issueKey && issueKey !== '' ? issueKey : null;
  }

  clear(): void {
    this.issueTypes.clear();
    this.priorities.clear();
    this.fieldsMeta.clear();
    this.existingSummaries.clear();
    this.assignableUsers.clear();
  }
}
