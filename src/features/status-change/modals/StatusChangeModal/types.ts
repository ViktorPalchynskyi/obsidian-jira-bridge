import type { JiraInstance, JiraStatus, JiraTransition, JiraSprint, JiraBoard } from '../../../../types';

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

export interface StatusChangeModalState {
  issueKey: string;
  instanceId: string;
  isLoadingIssue: boolean;
  isLoadingTransitions: boolean;
  isSubmitting: boolean;
  isSearching: boolean;
  isLoadingSprint: boolean;
  currentStatus: JiraStatus | null;
  issueSummary: string;
  transitions: JiraTransition[];
  selectedTransitionId: string | null;
  error: string | null;
  searchResults: { key: string; summary: string }[];
  sprint: JiraSprint | null;
  inBacklog: boolean;
  board: JiraBoard | null;
  availableSprints: JiraSprint[];
}
