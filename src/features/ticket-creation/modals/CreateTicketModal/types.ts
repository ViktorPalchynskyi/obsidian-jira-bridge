import type { JiraInstance, ResolvedContext, CustomFieldConfig, ProjectMappingConfig } from '../../../../types';

export interface FrontmatterValues {
  issueType?: string;
  labels?: string[];
  parentSummary?: string;
  priority?: string;
  assignee?: string;
  customFields?: Record<string, unknown>;
}

export interface CreateTicketModalOptions {
  instances: JiraInstance[];
  context: ResolvedContext;
  initialSummary?: string;
  initialDescription?: string;
  filePath?: string;
  customFields?: CustomFieldConfig[];
  frontmatterValues?: FrontmatterValues;
  projectConfig?: ProjectMappingConfig;
}

export interface CreateTicketResult {
  issueKey: string;
  issueUrl: string;
}

export interface CreateTicketFormData {
  instanceId: string;
  projectKey: string;
  issueType: string;
  summary: string;
  description?: string;
  priority?: string;
}
