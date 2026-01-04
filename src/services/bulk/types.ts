import type { TFile } from 'obsidian';
import type { JiraInstance, JiraIssueType, JiraPriority, JiraFieldMeta } from '../../types';
import type { FrontmatterValues } from '../../modals/CreateTicketModal/types';

export interface NoteToProcess {
  file: TFile;
  folderPath: string;
  instanceId: string;
  projectKey: string;
  summary: string;
  description: string;
  frontmatterValues: FrontmatterValues;
}

export interface SkippedNote {
  file: TFile;
  reason: string;
  existingIssueKey?: string;
}

export interface CreatedTicket {
  file: TFile;
  issueKey: string;
  issueUrl: string;
}

export interface FailedNote {
  file: TFile;
  error: string;
}

export interface BulkCreateResult {
  created: CreatedTicket[];
  skipped: SkippedNote[];
  failed: FailedNote[];
}

export interface BulkCreateProgress {
  total: number;
  processed: number;
  currentFile: string;
  status: string;
  created: number;
  skipped: number;
  failed: number;
}

export type ProgressCallback = (progress: BulkCreateProgress) => void;

export interface BulkCreateCacheData {
  issueTypes: Map<string, JiraIssueType[]>;
  priorities: Map<string, JiraPriority[]>;
  fieldsMeta: Map<string, JiraFieldMeta[]>;
  existingSummaries: Map<string, Map<string, string>>;
  instances: Map<string, JiraInstance>;
}
