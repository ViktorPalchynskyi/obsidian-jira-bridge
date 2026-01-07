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
    autoSync: false,
    syncInterval: 1,
    syncOnFileOpen: true,
    updateFrontmatter: true,
    frontmatterFields: [
      { jiraField: 'status', frontmatterKey: 'jira_status', enabled: true, readOnly: true },
      { jiraField: 'assignee', frontmatterKey: 'jira_assignee', enabled: true, readOnly: true },
    ],
    syncFields: [
      { jiraField: 'status', frontmatterKey: 'jira_status', enabled: true, readOnly: true },
      { jiraField: 'assignee', frontmatterKey: 'jira_assignee', enabled: true, readOnly: true },
      { jiraField: 'priority', frontmatterKey: 'jira_priority', enabled: true, readOnly: true },
      { jiraField: 'updated', frontmatterKey: 'jira_updated', enabled: false, readOnly: true },
      { jiraField: 'reporter', frontmatterKey: 'jira_reporter', enabled: false, readOnly: true },
      { jiraField: 'summary', frontmatterKey: 'jira_summary', enabled: false, readOnly: true },
    ],
  },
  ui: {
    showRibbonIcon: true,
    showStatusBarInstance: true,
    showStatusBarProject: true,
    showStatusBarStatus: true,
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
