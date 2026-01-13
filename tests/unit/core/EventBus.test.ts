import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../../src/core/EventBus';
import type { PluginSettings, SyncResult } from '../../../src/types';

const mockSettings: PluginSettings = {
  instances: [],
  folderMappings: [],
  showRibbonIcon: true,
  showStatusBar: true,
  defaultView: 'tab',
  syncSettings: {
    autoSync: false,
    syncInterval: 5,
    syncOnOpen: false,
    defaultSyncFields: [],
  },
  globalCustomFields: [],
  frontmatterMappings: [],
};

const mockSyncResult: SyncResult = {
  success: true,
  ticketKey: 'TEST-123',
  changes: [],
};

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('on/emit', () => {
    it('should call handler when event is emitted', async () => {
      const handler = vi.fn();
      eventBus.on('settings:changed', handler);

      await eventBus.emit('settings:changed', mockSettings);

      expect(handler).toHaveBeenCalledWith(mockSettings);
    });

    it('should call multiple handlers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      eventBus.on('sync:complete', handler1);
      eventBus.on('sync:complete', handler2);

      await eventBus.emit('sync:complete', mockSyncResult);

      expect(handler1).toHaveBeenCalledWith(mockSyncResult);
      expect(handler2).toHaveBeenCalledWith(mockSyncResult);
    });
  });

  describe('off', () => {
    it('should remove handler', async () => {
      const handler = vi.fn();
      eventBus.on('settings:changed', handler);
      eventBus.off('settings:changed', handler);

      await eventBus.emit('settings:changed', mockSettings);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('on return value', () => {
    it('should return unsubscribe function', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on('settings:changed', handler);

      unsubscribe();
      await eventBus.emit('settings:changed', mockSettings);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should call handler only once', async () => {
      const handler = vi.fn();
      eventBus.once('sync:complete', handler);

      await eventBus.emit('sync:complete', mockSyncResult);
      await eventBus.emit('sync:complete', { ...mockSyncResult, ticketKey: 'TEST-456' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(mockSyncResult);
    });
  });

  describe('clear', () => {
    it('should remove all handlers', async () => {
      const handler = vi.fn();
      eventBus.on('settings:changed', handler);

      eventBus.clear();
      await eventBus.emit('settings:changed', mockSettings);

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
