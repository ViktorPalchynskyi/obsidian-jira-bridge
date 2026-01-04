import type { JiraInstance, ResolvedContext } from '../../types';

export interface CreateTicketModalOptions {
  instances: JiraInstance[];
  context: ResolvedContext;
  initialTitle?: string;
  filePath?: string;
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
