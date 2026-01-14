import type {
  JiraInstance,
  ResolvedContext,
  CustomFieldConfig,
  ProjectMappingConfig,
  JiraProject,
  JiraIssueType,
  JiraPriority,
  JiraFieldMeta,
} from '../../../../types';

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

export interface CreateTicketFormState {
  summary: string;
  description: string;
  projectKey: string;
  issueTypeId: string;
  priorityId: string;
  projects: JiraProject[];
  issueTypes: JiraIssueType[];
  priorities: JiraPriority[];
  isLoadingProjects: boolean;
  isLoadingIssueTypes: boolean;
  isLoadingPriorities: boolean;
  isSubmitting: boolean;
  error: string | null;
  customFieldValues: Record<string, unknown>;
  customFieldsMeta: JiraFieldMeta[];
  isLoadingCustomFields: boolean;
}
