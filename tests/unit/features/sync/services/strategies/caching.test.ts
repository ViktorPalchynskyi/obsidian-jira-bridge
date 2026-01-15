import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTLCacheStrategy, NoCacheStrategy, createCacheStrategy } from '../../../../../../src/features/sync/services/strategies/caching';
import type { PluginSettings } from '../../../../../../src/types/settings.types';

describe('TTLCacheStrategy', () => {
  let strategy: TTLCacheStrategy;

  beforeEach(() => {
    vi.useFakeTimers();
    strategy = new TTLCacheStrategy({ maxSize: 5, ttlMs: 60000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('has', () => {
    it('should return false for uncached key', () => {
      expect(strategy.has('TEST-1')).toBe(false);
    });

    it('should return true for cached key within TTL', () => {
      strategy.set('TEST-1', { status: { name: 'Open' } });
      expect(strategy.has('TEST-1')).toBe(true);
    });

    it('should return false for cached key after TTL expires', () => {
      strategy.set('TEST-1', { status: { name: 'Open' } });
      expect(strategy.has('TEST-1')).toBe(true);

      vi.advanceTimersByTime(60001);
      expect(strategy.has('TEST-1')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return null for uncached key', () => {
      expect(strategy.get('TEST-1')).toBe(null);
    });

    it('should return cache entry for valid cached key', () => {
      const data = { status: { name: 'Open' } };
      strategy.set('TEST-1', data);

      const cached = strategy.get('TEST-1');
      expect(cached).not.toBe(null);
      expect(cached?.issueKey).toBe('TEST-1');
      expect(cached?.data).toEqual(data);
    });

    it('should return null after TTL expires', () => {
      strategy.set('TEST-1', { status: { name: 'Open' } });
      vi.advanceTimersByTime(60001);
      expect(strategy.get('TEST-1')).toBe(null);
    });
  });

  describe('set', () => {
    it('should store cache entry', () => {
      strategy.set('TEST-1', { status: { name: 'Open' } });
      expect(strategy.has('TEST-1')).toBe(true);
    });

    it('should evict oldest entry when max size reached', () => {
      strategy.set('TEST-1', {});
      vi.advanceTimersByTime(1000);
      strategy.set('TEST-2', {});
      vi.advanceTimersByTime(1000);
      strategy.set('TEST-3', {});
      vi.advanceTimersByTime(1000);
      strategy.set('TEST-4', {});
      vi.advanceTimersByTime(1000);
      strategy.set('TEST-5', {});
      vi.advanceTimersByTime(1000);

      expect(strategy.has('TEST-1')).toBe(true);

      strategy.set('TEST-6', {});

      expect(strategy.has('TEST-1')).toBe(false);
      expect(strategy.has('TEST-2')).toBe(true);
      expect(strategy.has('TEST-6')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      strategy.set('TEST-1', {});
      strategy.set('TEST-2', {});
      expect(strategy.has('TEST-1')).toBe(true);
      expect(strategy.has('TEST-2')).toBe(true);

      strategy.clear();

      expect(strategy.has('TEST-1')).toBe(false);
      expect(strategy.has('TEST-2')).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update TTL', () => {
      strategy.set('TEST-1', {});
      expect(strategy.has('TEST-1')).toBe(true);

      strategy.updateConfig({ maxSize: 5, ttlMs: 1000 });
      vi.advanceTimersByTime(1001);

      expect(strategy.has('TEST-1')).toBe(false);
    });
  });
});

describe('NoCacheStrategy', () => {
  const strategy = new NoCacheStrategy();

  it('should always return false for has', () => {
    expect(strategy.has('TEST-1')).toBe(false);
  });

  it('should always return null for get', () => {
    expect(strategy.get('TEST-1')).toBe(null);
  });

  it('should not throw on set', () => {
    expect(() => strategy.set('TEST-1', {})).not.toThrow();
  });

  it('should not throw on clear', () => {
    expect(() => strategy.clear()).not.toThrow();
  });

  it('should not throw on updateConfig', () => {
    expect(() => strategy.updateConfig({ maxSize: 100, ttlMs: 60000 })).not.toThrow();
  });
});

describe('createCacheStrategy', () => {
  const baseSettings: PluginSettings = {
    instances: [],
    mappings: [],
    sync: {
      autoSync: false,
      syncInterval: 5,
      syncOnFileOpen: false,
      updateFrontmatter: true,
      frontmatterFields: [],
      syncFields: [],
    },
    ui: {
      showRibbonIcon: true,
      showStatusBarInstance: true,
      showStatusBarProject: true,
      showStatusBarStatus: true,
      defaultModalSize: 'medium',
      enableCustomFields: false,
    },
    createTicket: {
      customFields: [],
    },
    advanced: {
      requestTimeout: 30000,
      maxRetries: 3,
      logLevel: 'info',
      cacheEnabled: true,
      cacheTTL: 300,
    },
    recentIssues: [],
  };

  it('should create TTLCacheStrategy when cache is enabled', () => {
    const strategy = createCacheStrategy(baseSettings);
    expect(strategy).toBeInstanceOf(TTLCacheStrategy);
  });

  it('should create NoCacheStrategy when cache is disabled', () => {
    const settings = {
      ...baseSettings,
      advanced: { ...baseSettings.advanced, cacheEnabled: false },
    };
    const strategy = createCacheStrategy(settings);
    expect(strategy).toBeInstanceOf(NoCacheStrategy);
  });
});
