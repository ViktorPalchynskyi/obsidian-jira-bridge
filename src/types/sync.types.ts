export interface NoteTicketLink {
  noteId: string;
  ticketKey: string;
  instanceId: string;
  linkedAt: number;
  lastSyncAt?: number;
  syncStatus: SyncStatus;
}

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error' | 'unlinked';

export interface SyncResult {
  success: boolean;
  ticketKey: string;
  changes: SyncChange[];
  error?: Error;
  skipped?: boolean;
  skipReason?: string;
}

export interface SyncChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  direction: 'toJira' | 'fromJira';
  frontmatterKey: string;
}

export interface SyncStats {
  total: number;
  synced: number;
  skipped: number;
  failed: number;
  changes: number;
}

export interface FrontmatterData {
  jira_ticket?: string;
  jira_status?: string;
  jira_instance?: string;
  jira_synced_at?: string;
  [key: string]: unknown;
}
