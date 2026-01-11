import type { TFile } from 'obsidian';
import type { SyncFieldConfig } from '../../../types/settings.types';

export interface SyncOptions {
  force?: boolean;
  silent?: boolean;
}

export interface SyncCache {
  issueKey: string;
  lastSyncAt: number;
  data: Record<string, unknown>;
}

export type SyncTrigger = 'auto' | 'manual' | 'file-open' | 'command';

export interface SyncContext {
  file: TFile;
  issueKey: string;
  instanceId: string;
  syncFields: SyncFieldConfig[];
  trigger: SyncTrigger;
}
