import type { FolderMapping, JiraInstance, SyncFieldConfig, ProjectSyncConfig } from '../../../../types';

export interface SyncSettingsModalOptions {
  mapping: FolderMapping;
  instance: JiraInstance;
  globalSyncFields: SyncFieldConfig[];
}

export interface SyncSettingsModalResult {
  syncConfig: ProjectSyncConfig;
}
