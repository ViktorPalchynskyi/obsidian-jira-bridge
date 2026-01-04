import type { PluginSettings, ContentParsingConfig, ProjectMappingConfig } from '../types';

export const DEFAULT_CONTENT_PARSING: ContentParsingConfig = {
  summaryPattern: '^## Summary\\s*\\n+```\\s*\\n(.+?)\\n```',
  summaryFlags: 'm',
  descriptionPattern: '^## Description[\\s\\t]*$',
  descriptionFlags: 'm',
};

export const DEFAULT_PROJECT_CONFIG: ProjectMappingConfig = {
  frontmatterMappings: [],
  contentParsing: DEFAULT_CONTENT_PARSING,
};

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
    enableCustomFields: false,
  },
  createTicket: {
    customFields: [],
  },
  advanced: {
    requestTimeout: 30000,
    maxRetries: 3,
    logLevel: 'info',
    cacheEnabled: true,
    cacheTTL: 300,
  },
  recentIssues: [],
};
