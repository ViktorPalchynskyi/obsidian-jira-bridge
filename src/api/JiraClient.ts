import { requestUrl, RequestUrlResponse } from 'obsidian';
import type { JiraInstance, JiraProject } from '../types';
import type { TestConnectionResult, JiraUser } from './types';

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
