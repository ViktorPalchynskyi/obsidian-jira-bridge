import type { JiraInstance, JiraProject } from './jira.types';

export type MappingType = 'instance' | 'project';

export interface FolderMapping {
  id: string;
  folderPath: string;
  type: MappingType;
  instanceId?: string;
  projectKey?: string;
  enabled: boolean;
}

export interface ResolvedMapping {
  mapping: FolderMapping;
  instance: JiraInstance;
  project?: JiraProject;
}

export interface ResolvedContext {
  instance: JiraInstance | null;
  instanceMapping: FolderMapping | null;
  projectKey: string | null;
  projectMapping: FolderMapping | null;
}
