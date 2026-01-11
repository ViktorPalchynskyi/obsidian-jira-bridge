import type { FolderMapping, JiraInstance, CustomFieldConfig, SyncFieldConfig, ProjectMappingConfig } from '../../../../types';

export interface AdvancedConfigModalOptions {
  mapping: FolderMapping;
  instance: JiraInstance;
  customFields: CustomFieldConfig[];
  globalSyncFields: SyncFieldConfig[];
  onUpdate: (projectConfig: ProjectMappingConfig) => Promise<void>;
  onUpdateCustomFields: (customFields: CustomFieldConfig[]) => Promise<void>;
}
