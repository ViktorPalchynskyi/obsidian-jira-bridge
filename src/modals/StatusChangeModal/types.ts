import type { JiraInstance } from '../../types';

export interface StatusChangeResult {
  issueKey: string;
  transitionId: string;
  transitionName: string;
  newStatusName: string;
}

export interface StatusChangeModalOptions {
  instances: JiraInstance[];
  recentIssues: RecentIssue[];
  defaultInstanceId?: string;
  initialIssueKey?: string;
}

export interface RecentIssue {
  key: string;
  summary: string;
  instanceId: string;
  timestamp: number;
}
