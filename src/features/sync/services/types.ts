import type { App, TFile } from 'obsidian';
import type { SyncFieldConfig, SyncStats } from '../../../types';

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

export interface FieldExtractionStrategy {
  canHandle(value: unknown): boolean;
  extract(value: unknown): string | null;
}

export interface CacheConfig {
  maxSize: number;
  ttlMs: number;
}

export interface SyncCacheStrategy {
  has(issueKey: string): boolean;
  get(issueKey: string): SyncCache | null;
  set(issueKey: string, data: Record<string, unknown>): void;
  clear(): void;
  updateConfig(config: CacheConfig): void;
}

export interface SyncScopeStrategy {
  collectFiles(app: App): TFile[];
  getNotificationMessage(stats: SyncStats): string;
}
