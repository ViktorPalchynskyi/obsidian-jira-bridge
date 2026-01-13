export interface JiraInstance {
  id: string;
  name: string;
  baseUrl: string;
  email: string;
  apiToken: string;
  isDefault: boolean;
  enabled: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  issueTypes: JiraIssueType[];
  avatarUrl?: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  iconUrl?: string;
  subtask: boolean;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: JiraIssueFields;
}

export interface JiraIssueFields {
  summary: string;
  description?: string;
  status: JiraStatus;
  issuetype: JiraIssueType;
  project: JiraProject;
  priority?: JiraPriority;
  assignee?: JiraUser;
  reporter?: JiraUser;
  labels?: string[];
  created: string;
  updated: string;
  [key: string]: unknown;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string;
    name: string;
  };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: JiraStatus;
  hasScreen: boolean;
  isGlobal: boolean;
  isInitial: boolean;
  isConditional: boolean;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls: Record<string, string>;
  active: boolean;
}

export interface JiraPriority {
  id: string;
  name: string;
  iconUrl?: string;
}

export interface CreateIssueRequest {
  projectKey: string;
  issueType: string;
  summary: string;
  description?: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  customFields?: Record<string, unknown>;
}

export interface JiraFieldMeta {
  fieldId: string;
  name: string;
  required: boolean;
  schema: JiraFieldSchema;
  allowedValues?: JiraFieldOption[];
  autoCompleteUrl?: string;
}

export interface JiraFieldSchema {
  type: string;
  system?: string;
  custom?: string;
  customId?: number;
  items?: string;
}

export interface JiraFieldOption {
  id: string;
  value?: string;
  name?: string;
}

export interface CreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

export interface JiraBoard {
  id: string;
  name: string;
  type: 'scrum' | 'kanban' | 'simple';
  location?: {
    projectId?: number;
    projectKey?: string;
    projectName?: string;
  };
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed';
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export interface JiraSprintInfo {
  sprint: JiraSprint | null;
  inBacklog: boolean;
}

export interface JiraIssueData {
  key: string;
  fields: Record<string, unknown>;
}
