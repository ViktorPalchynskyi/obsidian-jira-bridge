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
}

export interface SyncChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  direction: 'toJira' | 'fromJira';
}

export interface FrontmatterData {
  jira_ticket?: string;
  jira_status?: string;
  jira_instance?: string;
  jira_synced_at?: string;
  [key: string]: unknown;
}
