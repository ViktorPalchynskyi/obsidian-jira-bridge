import type { JiraInstance } from '../../../../types';

export interface LinkTicketModalOptions {
  instances: JiraInstance[];
  defaultInstanceId?: string;
  currentIssueKey?: string;
}

export interface LinkTicketModalResult {
  issueKey: string;
  instanceId: string;
  action: 'link' | 'sync';
}

export interface SearchIssueResult {
  key: string;
  summary: string;
  status: string;
  issueType: string;
}
