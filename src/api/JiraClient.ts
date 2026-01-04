import { requestUrl, RequestUrlResponse } from 'obsidian';
import type {
  JiraInstance,
  JiraProject,
  JiraIssueType,
  JiraPriority,
  CreateIssueResponse,
  JiraFieldMeta,
  JiraStatus,
  JiraTransition,
} from '../types';
import type { TestConnectionResult, JiraUser } from './types';
import { markdownToAdf } from '../utils/markdownToAdf';

export class JiraClient {
  constructor(private instance: JiraInstance) {}

  private getAuthHeader(): string {
    const credentials = `${this.instance.email}:${this.instance.apiToken}`;
    return `Basic ${btoa(credentials)}`;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: this.getAuthHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'obsidian-jira-bridge/1.0',
    };
  }

  private buildUrl(path: string): string {
    const baseUrl = this.instance.baseUrl.replace(/\/+$/, '');
    return `${baseUrl}${path}`;
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl('/rest/api/3/myself'),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status === 200) {
        const user: JiraUser = {
          displayName: response.json.displayName,
          emailAddress: response.json.emailAddress,
          accountId: response.json.accountId,
        };
        return { success: true, user };
      }

      return {
        success: false,
        error: `Unexpected response: ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        error: this.parseError(error),
      };
    }
  }

  async getProjects(): Promise<JiraProject[]> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl('/rest/api/3/project'),
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch projects: ${response.status}`);
    }

    return response.json.map((project: Record<string, unknown>) => ({
      id: project.id as string,
      key: project.key as string,
      name: project.name as string,
      issueTypes: [],
      avatarUrl: (project.avatarUrls as Record<string, string>)?.['48x48'],
    }));
  }

  async getIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`),
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch issue types: ${response.status}`);
    }

    return response.json.issueTypes.map((type: Record<string, unknown>) => ({
      id: type.id as string,
      name: type.name as string,
      iconUrl: type.iconUrl as string | undefined,
      subtask: type.subtask as boolean,
    }));
  }

  async getPriorities(): Promise<JiraPriority[]> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl('/rest/api/3/priority'),
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch priorities: ${response.status}`);
    }

    return response.json.map((priority: Record<string, unknown>) => ({
      id: priority.id as string,
      name: priority.name as string,
      iconUrl: priority.iconUrl as string | undefined,
    }));
  }

  async getFieldsForIssueType(projectKey: string, issueTypeId: string): Promise<JiraFieldMeta[]> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(`/rest/api/3/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}`),
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch fields: ${response.status}`);
    }

    const fields = response.json.fields || response.json.values || [];
    const systemFields = ['summary', 'description', 'issuetype', 'project', 'priority', 'reporter', 'attachment', 'issuerestriction'];

    return fields
      .filter((field: Record<string, unknown>) => {
        const fieldId = field.fieldId as string;
        return !systemFields.includes(fieldId);
      })
      .map((field: Record<string, unknown>) => ({
        fieldId: field.fieldId as string,
        name: field.name as string,
        required: field.required as boolean,
        schema: field.schema as JiraFieldMeta['schema'],
        allowedValues: field.allowedValues as JiraFieldMeta['allowedValues'],
        autoCompleteUrl: field.autoCompleteUrl as string | undefined,
      }));
  }

  async getAssignableUsers(projectKey: string): Promise<{ accountId: string; displayName: string }[]> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(`/rest/api/3/user/assignable/search?project=${projectKey}`),
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch assignable users: ${response.status}`);
    }

    return response.json.map((user: Record<string, unknown>) => ({
      accountId: user.accountId as string,
      displayName: user.displayName as string,
    }));
  }

  async getLabels(): Promise<string[]> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl('/rest/api/3/label'),
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch labels: ${response.status}`);
    }

    return response.json.values || [];
  }

  async getParentableIssues(projectKey: string): Promise<{ key: string; summary: string; issueType: string }[]> {
    const jql = `project=${projectKey} AND statusCategory != Done ORDER BY created DESC`;
    const url = this.buildUrl('/rest/api/3/search/jql') + `?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,issuetype`;

    const response: RequestUrlResponse = await requestUrl({
      url,
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to search issues: ${response.status}`);
    }

    return response.json.issues.map((issue: Record<string, unknown>) => {
      const fields = issue.fields as Record<string, unknown>;
      const issueType = fields.issuetype as Record<string, unknown>;
      return {
        key: issue.key as string,
        summary: fields.summary as string,
        issueType: issueType.name as string,
      };
    });
  }

  async searchIssuesBySummary(
    projectKey: string,
    summaryText: string,
    maxResults: number = 10,
  ): Promise<{ key: string; summary: string; issueType: string }[]> {
    const escapedSummary = summaryText.replace(/"/g, '\\"');
    const jql = `project=${projectKey} AND summary ~ "${escapedSummary}" AND statusCategory != Done ORDER BY created DESC`;
    const url =
      this.buildUrl('/rest/api/3/search/jql') + `?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,issuetype`;

    const response: RequestUrlResponse = await requestUrl({
      url,
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to search issues: ${response.status}`);
    }

    return response.json.issues.map((issue: Record<string, unknown>) => {
      const fields = issue.fields as Record<string, unknown>;
      const issueType = fields.issuetype as Record<string, unknown>;
      return {
        key: issue.key as string,
        summary: fields.summary as string,
        issueType: issueType.name as string,
      };
    });
  }

  async findDuplicateBySummary(projectKey: string, summary: string): Promise<{ key: string; summary: string } | null> {
    const escapedSummary = summary.replace(/"/g, '\\"');
    const jql = `project=${projectKey} AND summary ~ "${escapedSummary}"`;
    const url = this.buildUrl('/rest/api/3/search/jql') + `?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary`;

    const response: RequestUrlResponse = await requestUrl({
      url,
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      return null;
    }

    const normalizedSearch = summary.toLowerCase().trim();
    for (const issue of response.json.issues) {
      const fields = issue.fields as Record<string, unknown>;
      const issueSummary = (fields.summary as string).toLowerCase().trim();
      if (issueSummary === normalizedSearch) {
        return { key: issue.key as string, summary: fields.summary as string };
      }
    }

    return null;
  }

  async searchIssuesBySummaries(projectKey: string, summaries: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (summaries.length === 0) return result;

    const summaryConditions = summaries.map(s => `summary ~ "${s.replace(/"/g, '\\"')}"`).join(' OR ');
    const jql = `project=${projectKey} AND (${summaryConditions})`;
    const url = this.buildUrl('/rest/api/3/search/jql') + `?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary`;

    try {
      const response: RequestUrlResponse = await requestUrl({
        url,
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return result;
      }

      const normalizedSummaries = new Map(summaries.map(s => [s.toLowerCase().trim(), s]));

      for (const issue of response.json.issues) {
        const fields = issue.fields as Record<string, unknown>;
        const issueSummary = (fields.summary as string).toLowerCase().trim();
        if (normalizedSummaries.has(issueSummary)) {
          result.set(normalizedSummaries.get(issueSummary)!, issue.key as string);
        }
      }
    } catch {
      return result;
    }

    return result;
  }

  async createIssue(
    projectKey: string,
    issueTypeId: string,
    summary: string,
    description?: string,
    priorityId?: string,
    customFields?: Record<string, unknown>,
  ): Promise<CreateIssueResponse> {
    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      issuetype: { id: issueTypeId },
      summary,
    };

    if (description) {
      fields.description = markdownToAdf(description);
    }

    if (priorityId) {
      fields.priority = { id: priorityId };
    }

    if (customFields) {
      for (const [fieldId, value] of Object.entries(customFields)) {
        fields[fieldId] = value;
      }
    }

    const url = this.buildUrl('/rest/api/3/issue');
    const body = JSON.stringify({ fields });

    let response: RequestUrlResponse;
    try {
      response = await requestUrl({
        url,
        method: 'POST',
        headers: this.getHeaders(),
        body,
      });
    } catch (error: unknown) {
      const err = error as { status?: number; text?: string };
      let errorMessage = `Request failed: status ${err.status}`;
      if (err.text) {
        try {
          const parsed = JSON.parse(err.text);
          if (parsed.errorMessages) {
            errorMessage = parsed.errorMessages.join(', ');
          } else if (parsed.errors) {
            errorMessage = Object.values(parsed.errors).join(', ');
          }
        } catch {
          errorMessage = err.text;
        }
      }
      throw new Error(errorMessage);
    }

    if (response.status !== 201) {
      const errorMessage = response.json?.errors
        ? Object.values(response.json.errors).join(', ')
        : response.json?.errorMessages?.join(', ') || `Failed to create issue: ${response.status}`;
      throw new Error(errorMessage);
    }

    return {
      id: response.json.id,
      key: response.json.key,
      self: response.json.self,
    };
  }

  async getIssue(issueKey: string): Promise<{ key: string; summary: string; status: JiraStatus }> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(`/rest/api/3/issue/${issueKey}?fields=summary,status`),
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch issue: ${response.status}`);
    }

    return {
      key: response.json.key,
      summary: response.json.fields.summary,
      status: response.json.fields.status,
    };
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(`/rest/api/3/issue/${issueKey}/transitions`),
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch transitions: ${response.status}`);
    }

    return response.json.transitions.map((t: Record<string, unknown>) => ({
      id: t.id as string,
      name: t.name as string,
      to: t.to as JiraStatus,
      hasScreen: t.hasScreen as boolean,
      isGlobal: t.isGlobal as boolean,
      isInitial: t.isInitial as boolean,
      isConditional: t.isConditional as boolean,
    }));
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(`/rest/api/3/issue/${issueKey}/transitions`),
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ transition: { id: transitionId } }),
    });

    if (response.status !== 204) {
      throw new Error(`Failed to transition issue: ${response.status}`);
    }
  }

  getIssueUrl(issueKey: string): string {
    return `${this.instance.baseUrl.replace(/\/+$/, '')}/browse/${issueKey}`;
  }

  private parseError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('401')) {
        return 'Invalid credentials. Check your email and API token.';
      }
      if (error.message.includes('403')) {
        return 'Access forbidden. Check your permissions.';
      }
      if (error.message.includes('404')) {
        return 'Jira instance not found. Check the URL.';
      }
      if (error.message.includes('net::')) {
        return 'Network error. Check your internet connection.';
      }
      return error.message;
    }
    return 'Unknown error occurred';
  }
}
