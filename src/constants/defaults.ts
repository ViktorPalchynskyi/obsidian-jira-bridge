import type { PluginSettings } from '../types';

export const DEFAULT_SETTINGS: PluginSettings = {
  instances: [],
  mappings: [],
  sync: {
    autoSync: true,
    syncInterval: 5,
    syncOnFileOpen: true,
    updateFrontmatter: true,
    frontmatterFields: [
      { jiraField: 'status', frontmatterKey: 'jira_status', enabled: true, readOnly: true },
      { jiraField: 'assignee', frontmatterKey: 'jira_assignee', enabled: true, readOnly: true },
    ],
  },
  ui: {
    showRibbonIcon: true,
    showStatusBarInstance: true,
    showStatusBarProject: true,
    defaultModalSize: 'medium',
  },
  advanced: {
    requestTimeout: 30000,
    maxRetries: 3,
    logLevel: 'info',
    cacheEnabled: true,
    cacheTTL: 300,
  },
};
