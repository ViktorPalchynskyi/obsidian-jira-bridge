import { describe, it, expect } from 'vitest';
import { OpenNotesScope, FolderScope } from '../../../../../../src/features/sync/services/strategies/syncScope';
import type { SyncStats } from '../../../../../../src/types';
import type { TFolder } from 'obsidian';

describe('OpenNotesScope', () => {
  const scope = new OpenNotesScope();

  describe('getNotificationMessage', () => {
    it('should return formatted message with sync stats', () => {
      const stats: SyncStats = {
        total: 10,
        synced: 5,
        skipped: 3,
        failed: 2,
        changes: 8,
      };

      const message = scope.getNotificationMessage(stats);

      expect(message).toBe('Synced 5 note(s) with 8 change(s)');
    });

    it('should handle zero values', () => {
      const stats: SyncStats = {
        total: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        changes: 0,
      };

      const message = scope.getNotificationMessage(stats);

      expect(message).toBe('Synced 0 note(s) with 0 change(s)');
    });
  });
});

describe('FolderScope', () => {
  const createMockFolder = (): TFolder =>
    ({
      children: [],
    }) as TFolder;

  describe('getNotificationMessage', () => {
    it('should return formatted message with total and synced counts', () => {
      const folder = createMockFolder();
      const scope = new FolderScope(folder);

      const stats: SyncStats = {
        total: 10,
        synced: 7,
        skipped: 2,
        failed: 1,
        changes: 15,
      };

      const message = scope.getNotificationMessage(stats);

      expect(message).toBe('Synced 7/10 notes with 15 change(s)');
    });

    it('should handle all files synced', () => {
      const folder = createMockFolder();
      const scope = new FolderScope(folder);

      const stats: SyncStats = {
        total: 5,
        synced: 5,
        skipped: 0,
        failed: 0,
        changes: 10,
      };

      const message = scope.getNotificationMessage(stats);

      expect(message).toBe('Synced 5/5 notes with 10 change(s)');
    });

    it('should handle empty folder', () => {
      const folder = createMockFolder();
      const scope = new FolderScope(folder);

      const stats: SyncStats = {
        total: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        changes: 0,
      };

      const message = scope.getNotificationMessage(stats);

      expect(message).toBe('Synced 0/0 notes with 0 change(s)');
    });
  });
});
