import type { TFile } from 'obsidian';

export interface SkippedNote {
  file: TFile;
  reason: string;
  existingIssueKey?: string;
}

export interface FailedNote {
  file: TFile;
  error: string;
}

export interface NoteToChangeStatus {
  file: TFile;
  issueKey: string;
  issueUrl: string;
  currentStatus?: string;
}

export interface StatusChangedTicket {
  file: TFile;
  issueKey: string;
  oldStatus: string;
  newStatus: string;
}

export interface BulkStatusChangeResult {
  changed: StatusChangedTicket[];
  resolved: { file: TFile; issueKey: string }[];
  skipped: SkippedNote[];
  failed: FailedNote[];
}

export interface BulkStatusChangeProgress {
  total: number;
  processed: number;
  currentFile: string;
  status: string;
  changed: number;
  resolved: number;
  skipped: number;
  failed: number;
}

export type StatusChangeProgressCallback = (progress: BulkStatusChangeProgress) => void;

export interface BulkStatusChangeOptions {
  transitionId?: string;
  transitionName?: string;
  agileAction?: 'backlog' | 'board' | 'sprint';
  sprintId?: number;
  boardId?: string;
}
