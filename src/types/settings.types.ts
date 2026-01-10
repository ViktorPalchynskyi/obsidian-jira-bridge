import type { JiraInstance } from './jira.types';
import type { FolderMapping } from './mapping.types';

export interface PluginSettings {
  instances: JiraInstance[];
  mappings: FolderMapping[];
  sync: SyncSettings;
  ui: UISettings;
  createTicket: CreateTicketSettings;
  advanced: AdvancedSettings;
  recentIssues: RecentIssueEntry[];
}

export interface RecentIssueEntry {
  key: string;
  summary: string;
  instanceId: string;
  timestamp: number;
}

export interface CreateTicketSettings {
  customFields: CustomFieldConfig[];
}

export interface CustomFieldConfig {
  fieldId: string;
  fieldName: string;
  enabled: boolean;
  instanceId?: string;
  projectKey?: string;
}

export interface SyncFieldConfig {
  jiraField: string;
  frontmatterKey: string;
  enabled: boolean;
  readOnly: boolean;
}

export interface SyncSettings {
  autoSync: boolean;
  syncInterval: number;
  syncOnFileOpen: boolean;
  updateFrontmatter: boolean;
  frontmatterFields: FrontmatterFieldConfig[];
  syncFields: SyncFieldConfig[];
}

export interface UISettings {
  showRibbonIcon: boolean;
  showStatusBarInstance: boolean;
  showStatusBarProject: boolean;
  showStatusBarStatus: boolean;
  defaultModalSize: 'small' | 'medium' | 'large';
  enableCustomFields: boolean;
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
