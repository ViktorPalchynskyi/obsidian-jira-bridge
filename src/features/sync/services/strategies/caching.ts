import type { SyncCache, SyncCacheStrategy, CacheConfig } from '../types';
import type { PluginSettings } from '../../../../types/settings.types';

export class TTLCacheStrategy implements SyncCacheStrategy {
  private cache: Map<string, SyncCache> = new Map();
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  has(issueKey: string): boolean {
    const cached = this.cache.get(issueKey);
    if (!cached) return false;

    const age = Date.now() - cached.lastSyncAt;
    if (age >= this.config.ttlMs) {
      this.cache.delete(issueKey);
      return false;
    }

    return true;
  }

  get(issueKey: string): SyncCache | null {
    if (!this.has(issueKey)) {
      return null;
    }
    return this.cache.get(issueKey) ?? null;
  }

  set(issueKey: string, data: Record<string, unknown>): void {
    if (this.cache.size >= this.config.maxSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].lastSyncAt - b[1].lastSyncAt);
      if (entries.length > 0) {
        this.cache.delete(entries[0][0]);
      }
    }

    this.cache.set(issueKey, {
      issueKey,
      lastSyncAt: Date.now(),
      data,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  updateConfig(config: CacheConfig): void {
    this.config = config;
  }
}

export class NoCacheStrategy implements SyncCacheStrategy {
  has(_issueKey: string): boolean {
    return false;
  }

  get(_issueKey: string): SyncCache | null {
    return null;
  }

  set(_issueKey: string, _data: Record<string, unknown>): void {
    // No-op
  }

  clear(): void {
    // No-op
  }

  updateConfig(_config: CacheConfig): void {
    // No-op
  }
}

const DEFAULT_MAX_SIZE = 100;

export function createCacheStrategy(settings: PluginSettings): SyncCacheStrategy {
  if (!settings.advanced.cacheEnabled) {
    return new NoCacheStrategy();
  }

  const ttlMs = (settings.sync.syncInterval ?? 1) * 60 * 1000;
  return new TTLCacheStrategy({
    maxSize: DEFAULT_MAX_SIZE,
    ttlMs,
  });
}
