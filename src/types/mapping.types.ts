import type { JiraInstance, JiraProject } from './jira.types';

export interface FolderMapping {
  id: string;
  folderPath: string;
  instanceId: string;
  projectKey: string;
  defaultIssueType?: string;
  enabled: boolean;
  priority: number;
  pattern?: string;
}

export interface ResolvedMapping {
  mapping: FolderMapping;
  instance: JiraInstance;
  project?: JiraProject;
}
