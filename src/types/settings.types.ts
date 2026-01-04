import type { JiraInstance } from './jira.types';
import type { FolderMapping } from './mapping.types';

export interface PluginSettings {
  instances: JiraInstance[];
  mappings: FolderMapping[];
  sync: SyncSettings;
  ui: UISettings;
  advanced: AdvancedSettings;
}

export interface SyncSettings {
  autoSync: boolean;
  syncInterval: number;
  syncOnFileOpen: boolean;
  updateFrontmatter: boolean;
  frontmatterFields: FrontmatterFieldConfig[];
}

export interface UISettings {
  showRibbonIcon: boolean;
  showStatusBarInstance: boolean;
  showStatusBarProject: boolean;
  defaultModalSize: 'small' | 'medium' | 'large';
}

export interface AdvancedSettings {
  requestTimeout: number;
  maxRetries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  cacheEnabled: boolean;
  cacheTTL: number;
}

export interface FrontmatterFieldConfig {
  jiraField: string;
  frontmatterKey: string;
  enabled: boolean;
  readOnly: boolean;
}
