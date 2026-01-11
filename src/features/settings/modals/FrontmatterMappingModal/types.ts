import type { FolderMapping, JiraInstance, ProjectMappingConfig, CustomFieldConfig } from '../../../../types';

export interface FrontmatterMappingModalOptions {
  mapping: FolderMapping;
  instance: JiraInstance;
  customFields: CustomFieldConfig[];
}

export interface FrontmatterMappingModalResult {
  projectConfig: ProjectMappingConfig;
}
