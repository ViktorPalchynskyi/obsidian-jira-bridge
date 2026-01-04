export interface CreateTicketResult {
  instanceId: string;
  projectKey: string;
  issueType: string;
  summary: string;
  description?: string;
  priority?: string;
  labels?: string[];
}
