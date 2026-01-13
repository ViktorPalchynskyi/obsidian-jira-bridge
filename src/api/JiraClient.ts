import { requestUrl, RequestUrlResponse } from 'obsidian';
import { z } from 'zod';
import type {
  JiraInstance,
  JiraProject,
  JiraIssueType,
  JiraPriority,
  CreateIssueResponse,
  JiraFieldMeta,
  JiraTransition,
  JiraBoard,
  JiraSprint,
  JiraSprintInfo,
  JiraIssueData,
} from '../types';
import type { TestConnectionResult, JiraUser } from './types';
import { markdownToAdf } from '../utils/markdownToAdf';
import { mapJiraError } from '../utils/errorMessages';
import {
  jiraProjectSchema,
  jiraIssueTypeResponseSchema,
  jiraPrioritySchema,
  jiraUserSchema,
  jiraTransitionsResponseSchema,
  jiraBoardSchema,
  jiraSprintSchema,
  jiraPaginatedResponseSchema,
} from './schemas';

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

    const projects = z.array(jiraProjectSchema).parse(response.json);
    return projects.map(project => ({
      id: project.id,
      key: project.key,
      name: project.name,
      issueTypes: [],
      avatarUrl: project.avatarUrls?.['48x48'],
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

    const data = jiraIssueTypeResponseSchema.parse(response.json);
    return data.issueTypes.map(type => ({
      id: type.id,
      name: type.name,
      iconUrl: type.iconUrl,
      subtask: type.subtask,
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

    const priorities = z.array(jiraPrioritySchema).parse(response.json);
    return priorities.map(priority => ({
      id: priority.id,
      name: priority.name,
      iconUrl: priority.iconUrl,
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

    const users = z.array(jiraUserSchema).parse(response.json);
    return users.map(user => ({
      accountId: user.accountId,
      displayName: user.displayName,
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

  async getIssue(issueKey: string, fields?: string[]): Promise<JiraIssueData> {
    const fieldList = fields?.join(',') || 'summary,status,assignee,priority,updated,reporter,description,labels';

    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(`/rest/api/3/issue/${issueKey}?fields=${fieldList}`),
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch issue: ${response.status}`);
    }

    return {
      key: response.json.key,
      fields: response.json.fields,
    };
  }

  async searchIssues(
    query: string,
    maxResults: number = 5,
  ): Promise<{ key: string; summary: string; status?: { name: string }; issueType?: { name: string } }[]> {
    if (!query || query.length < 2) return [];

    const isKeyPattern = /^[A-Z]+-\d*$/i.test(query);
    let jql: string;

    if (isKeyPattern) {
      jql = `key = "${query}" OR key ~ "${query}*" ORDER BY updated DESC`;
    } else {
      const escapedQuery = query.replace(/"/g, '\\"');
      jql = `summary ~ "${escapedQuery}" ORDER BY updated DESC`;
    }

    const url =
      this.buildUrl('/rest/api/3/search/jql') + `?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,status,issuetype`;

    try {
      const response: RequestUrlResponse = await requestUrl({
        url,
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return [];
      }

      return response.json.issues.map((issue: Record<string, unknown>) => {
        const fields = issue.fields as Record<string, unknown>;
        const status = fields.status as Record<string, unknown> | undefined;
        const issueType = fields.issuetype as Record<string, unknown> | undefined;
        return {
          key: issue.key as string,
          summary: fields.summary as string,
          status: status ? { name: status.name as string } : undefined,
          issueType: issueType ? { name: issueType.name as string } : undefined,
        };
      });
    } catch {
      return [];
    }
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

    const data = jiraTransitionsResponseSchema.parse(response.json);
    return data.transitions.map(t => ({
      id: t.id,
      name: t.name,
      to: t.to,
      hasScreen: t.hasScreen,
      isGlobal: t.isGlobal,
      isInitial: t.isInitial,
      isConditional: t.isConditional,
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
    return mapJiraError(error);
  }

  async getBoardsForProject(projectKey: string): Promise<JiraBoard[]> {
    try {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl(`/rest/agile/1.0/board?projectKeyOrId=${projectKey}`),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return [];
      }

      const data = jiraPaginatedResponseSchema(jiraBoardSchema).parse(response.json);
      return (data.values ?? []).map(board => ({
        id: String(board.id),
        name: board.name,
        type: board.type,
        location: board.location,
      }));
    } catch {
      return [];
    }
  }

  async getSprintsForBoard(boardId: string): Promise<JiraSprint[]> {
    try {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl(`/rest/agile/1.0/board/${boardId}/sprint?state=active,future`),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return [];
      }

      const data = jiraPaginatedResponseSchema(jiraSprintSchema).parse(response.json);
      return (data.values ?? []).map(sprint => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        goal: sprint.goal,
      }));
    } catch {
      return [];
    }
  }

  async getIssueSprintInfo(issueKey: string): Promise<JiraSprintInfo> {
    try {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl(`/rest/agile/1.0/issue/${issueKey}?fields=sprint`),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return { sprint: null, inBacklog: true };
      }

      const sprintField = response.json.fields?.sprint;
      if (!sprintField) {
        return { sprint: null, inBacklog: true };
      }

      return {
        sprint: {
          id: sprintField.id,
          name: sprintField.name,
          state: sprintField.state,
          startDate: sprintField.startDate,
          endDate: sprintField.endDate,
          goal: sprintField.goal,
        },
        inBacklog: false,
      };
    } catch {
      return { sprint: null, inBacklog: true };
    }
  }

  async isIssueInBacklog(boardId: string, issueKey: string): Promise<boolean> {
    try {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl(`/rest/agile/1.0/board/${boardId}/backlog?jql=key=${issueKey}`),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return true;
      }

      const issues = response.json.issues || [];
      return issues.some((issue: { key: string }) => issue.key === issueKey);
    } catch {
      return true;
    }
  }

  async moveToSprint(issueKeys: string[], sprintId: number): Promise<void> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(`/rest/agile/1.0/sprint/${sprintId}/issue`),
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ issues: issueKeys }),
    });

    if (response.status !== 204) {
      throw new Error(`Failed to move issues to sprint: ${response.status}`);
    }
  }

  async moveToBacklog(issueKeys: string[], boardId?: string): Promise<void> {
    const endpoint = boardId ? `/rest/agile/1.0/backlog/${boardId}/issue` : '/rest/agile/1.0/backlog/issue';

    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(endpoint),
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ issues: issueKeys }),
    });

    if (response.status !== 200 && response.status !== 204) {
      throw new Error(`Failed to move issues to backlog: ${response.status}`);
    }
  }

  async moveToBoard(issueKeys: string[], boardId: string): Promise<void> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(`/rest/agile/1.0/board/${boardId}/issue`),
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ issues: issueKeys }),
    });

    if (response.status !== 200 && response.status !== 204) {
      throw new Error(`Failed to move issues to board: ${response.status}`);
    }
  }

  async getProject(projectKey: string): Promise<{
    id: string;
    key: string;
    name: string;
    projectTypeKey: string;
    description?: string;
  }> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl(`/rest/api/3/project/${projectKey}`),
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch project: ${response.status}`);
    }

    return {
      id: response.json.id,
      key: response.json.key,
      name: response.json.name,
      projectTypeKey: response.json.projectTypeKey,
      description: response.json.description,
    };
  }

  async getProjectFields(projectId: string): Promise<
    {
      id: string;
      key: string;
      name: string;
      custom: boolean;
      schema: {
        type: string;
        system?: string;
        custom?: string;
        customId?: number;
        items?: string;
      };
    }[]
  > {
    const allFields: {
      id: string;
      key: string;
      name: string;
      custom: boolean;
      schema: {
        type: string;
        system?: string;
        custom?: string;
        customId?: number;
        items?: string;
      };
    }[] = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl(`/rest/api/3/field/search?projectIds=${projectId}&startAt=${startAt}&maxResults=${maxResults}`),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch fields: ${response.status}`);
      }

      const values = response.json.values || [];
      for (const field of values) {
        allFields.push({
          id: field.id,
          key: field.key || field.id,
          name: field.name,
          custom: field.schema?.custom !== undefined,
          schema: {
            type: field.schema?.type || 'unknown',
            system: field.schema?.system,
            custom: field.schema?.custom,
            customId: field.schema?.customId,
            items: field.schema?.items,
          },
        });
      }

      if (values.length < maxResults) {
        break;
      }
      startAt += maxResults;
    }

    return allFields;
  }

  async getProjectStatuses(projectKey: string): Promise<
    {
      issueTypeId: string;
      issueTypeName: string;
      statuses: { id: string; name: string; statusCategory: { id: number; key: string; name: string } }[];
    }[]
  > {
    try {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl(`/rest/api/3/project/${projectKey}/statuses`),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return [];
      }

      return (response.json || []).map((item: Record<string, unknown>) => ({
        issueTypeId: item.id as string,
        issueTypeName: item.name as string,
        statuses: ((item.statuses as Record<string, unknown>[]) || []).map(s => ({
          id: s.id as string,
          name: s.name as string,
          statusCategory: s.statusCategory as { id: number; key: string; name: string },
        })),
      }));
    } catch {
      return [];
    }
  }

  async getIssueTypesForProject(projectKey: string): Promise<
    {
      id: string;
      name: string;
      description?: string;
      iconUrl?: string;
      subtask: boolean;
      hierarchyLevel: number;
    }[]
  > {
    try {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl(`/rest/api/3/project/${projectKey}`),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return [];
      }

      const issueTypes = response.json.issueTypes || [];
      return issueTypes.map((it: Record<string, unknown>) => ({
        id: it.id as string,
        name: it.name as string,
        description: it.description as string | undefined,
        iconUrl: it.iconUrl as string | undefined,
        subtask: it.subtask as boolean,
        hierarchyLevel: (it.hierarchyLevel as number) || 0,
      }));
    } catch {
      return [];
    }
  }

  async getBoardConfiguration(boardId: string): Promise<{
    id: number;
    name: string;
    type: 'scrum' | 'kanban' | 'simple';
    filter: { id: string; name: string; query: string };
    subQuery?: { query: string };
    columnConfig: {
      columns: { name: string; statuses: { id: string; name: string }[]; min?: number; max?: number }[];
      constraintType?: string;
    };
    estimation?: { type: string; field?: { fieldId: string; displayName: string } };
    ranking?: { rankCustomFieldId: number };
  } | null> {
    try {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl(`/rest/agile/1.0/board/${boardId}/configuration`),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return null;
      }

      const config = response.json;
      return {
        id: config.id,
        name: config.name,
        type: config.type?.toLowerCase() || 'kanban',
        filter: {
          id: String(config.filter?.id || ''),
          name: config.filter?.name || '',
          query: config.filter?.query || '',
        },
        subQuery: config.subQuery ? { query: config.subQuery.query } : undefined,
        columnConfig: {
          columns: (config.columnConfig?.columns || []).map((col: Record<string, unknown>) => ({
            name: col.name as string,
            statuses: ((col.statuses as Record<string, unknown>[]) || []).map(s => ({
              id: s.id as string,
              name: (s.self as string)?.split('/').pop() || (s.id as string),
            })),
            min: col.min as number | undefined,
            max: col.max as number | undefined,
          })),
          constraintType: config.columnConfig?.constraintType,
        },
        estimation: config.estimation
          ? {
              type: config.estimation.type,
              field: config.estimation.field
                ? { fieldId: config.estimation.field.fieldId, displayName: config.estimation.field.displayName }
                : undefined,
            }
          : undefined,
        ranking: config.ranking ? { rankCustomFieldId: config.ranking.rankCustomFieldId } : undefined,
      };
    } catch {
      return null;
    }
  }

  async getBoardQuickFilters(boardId: string): Promise<{ id: string; name: string; query: string; description?: string }[]> {
    try {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl(`/rest/agile/1.0/board/${boardId}/quickfilter`),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return [];
      }

      return (response.json.values || []).map((qf: Record<string, unknown>) => ({
        id: String(qf.id),
        name: qf.name as string,
        query: qf.query as string,
        description: qf.description as string | undefined,
      }));
    } catch {
      return [];
    }
  }

  async getFilter(filterId: string): Promise<{ id: string; name: string; jql: string } | null> {
    try {
      const response: RequestUrlResponse = await requestUrl({
        url: this.buildUrl(`/rest/api/3/filter/${filterId}`),
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        return null;
      }

      return {
        id: String(response.json.id),
        name: response.json.name,
        jql: response.json.jql || '',
      };
    } catch {
      return null;
    }
  }

  async createStatuses(
    projectId: string,
    statuses: { name: string; description?: string; statusCategory: 'TODO' | 'IN_PROGRESS' | 'DONE' }[],
  ): Promise<{ id: string; name: string }[]> {
    const response: RequestUrlResponse = await requestUrl({
      url: this.buildUrl('/rest/api/3/statuses'),
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        scope: {
          project: { id: projectId },
          type: 'PROJECT',
        },
        statuses: statuses.map(s => ({
          name: s.name,
          description: s.description || '',
          statusCategory: s.statusCategory,
        })),
      }),
    });

    if (response.status !== 200 && response.status !== 201) {
      const errorMessage =
        response.json?.errorMessages?.join(', ') || response.json?.errors
          ? Object.values(response.json.errors).join(', ')
          : `Failed to create statuses: ${response.status}`;
      throw new Error(errorMessage);
    }

    return (response.json || []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      name: s.name as string,
    }));
  }
}
