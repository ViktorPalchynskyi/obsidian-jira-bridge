import type { JiraInstance, JiraProject } from './jira.types';
import type { SyncFieldConfig } from './settings.types';

export type MappingType = 'instance' | 'project';

export type BuiltInFieldType = 'issue_type' | 'labels' | 'parent' | 'priority' | 'assignee';
export type FrontmatterFieldType = BuiltInFieldType | 'custom';

export interface FrontmatterFieldMapping {
  frontmatterKey: string;
  jiraFieldType: FrontmatterFieldType;
  customFieldId?: string;
  customFieldName?: string;
}

export interface ContentParsingConfig {
  summaryPattern: string;
  summaryFlags: string;
  descriptionPattern: string;
  descriptionFlags: string;
}

export interface ProjectSyncConfig {
  enableSync: boolean;
  syncFields?: SyncFieldConfig[];
}

export interface ProjectMappingConfig {
  frontmatterMappings: FrontmatterFieldMapping[];
  contentParsing: ContentParsingConfig;
  syncConfig?: ProjectSyncConfig;
}

export interface FolderMapping {
  id: string;
  folderPath: string;
  type: MappingType;
  instanceId?: string;
  projectKey?: string;
  enabled: boolean;
  projectConfig?: ProjectMappingConfig;
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
  isInstanceInherited: boolean;
  isProjectInherited: boolean;
  isDefault: boolean;
}
