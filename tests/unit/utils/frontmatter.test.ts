import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', () => ({
  App: vi.fn(),
  TFile: vi.fn(),
}));

import { readFrontmatterField, addFrontmatterFields } from '../../../src/utils/frontmatter';
import type { App, TFile } from 'obsidian';

describe('frontmatter utilities', () => {
  describe('readFrontmatterField', () => {
    it('should return field value from frontmatter', () => {
      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn().mockReturnValue({
            frontmatter: {
              issue_id: 'PROJ-123',
              issue_link: 'https://jira.example.com/browse/PROJ-123',
            },
          }),
        },
      } as unknown as App;

      const mockFile = {} as TFile;

      const result = readFrontmatterField(mockApp, mockFile, 'issue_id');
      expect(result).toBe('PROJ-123');
    });

    it('should return undefined for missing field', () => {
      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn().mockReturnValue({
            frontmatter: {
              other_field: 'value',
            },
          }),
        },
      } as unknown as App;

      const mockFile = {} as TFile;

      const result = readFrontmatterField(mockApp, mockFile, 'issue_id');
      expect(result).toBeUndefined();
    });

    it('should return undefined when no frontmatter exists', () => {
      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn().mockReturnValue(null),
        },
      } as unknown as App;

      const mockFile = {} as TFile;

      const result = readFrontmatterField(mockApp, mockFile, 'issue_id');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-string values', () => {
      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn().mockReturnValue({
            frontmatter: {
              number_field: 123,
              array_field: ['a', 'b'],
            },
          }),
        },
      } as unknown as App;

      const mockFile = {} as TFile;

      expect(readFrontmatterField(mockApp, mockFile, 'number_field')).toBeUndefined();
      expect(readFrontmatterField(mockApp, mockFile, 'array_field')).toBeUndefined();
    });
  });

  describe('addFrontmatterFields', () => {
    let mockApp: App;
    let mockFile: TFile;
    let savedContent: string;

    beforeEach(() => {
      savedContent = '';
      mockApp = {
        vault: {
          read: vi.fn(),
          modify: vi.fn().mockImplementation((_file, content) => {
            savedContent = content;
            return Promise.resolve();
          }),
        },
      } as unknown as App;
      mockFile = {} as TFile;
    });

    it('should add fields to existing frontmatter', async () => {
      (mockApp.vault.read as ReturnType<typeof vi.fn>).mockResolvedValue(`---
title: Test Note
---

Content here`);

      await addFrontmatterFields(mockApp, mockFile, {
        issue_id: 'PROJ-123',
        issue_link: 'https://jira.example.com/browse/PROJ-123',
      });

      expect(savedContent).toContain('issue_id: PROJ-123');
      expect(savedContent).toContain('issue_link:');
      expect(savedContent).toContain('jira.example.com/browse/PROJ-123');
      expect(savedContent).toContain('title: Test Note');
    });

    it('should create frontmatter when none exists', async () => {
      (mockApp.vault.read as ReturnType<typeof vi.fn>).mockResolvedValue('Content without frontmatter');

      await addFrontmatterFields(mockApp, mockFile, {
        issue_id: 'PROJ-123',
      });

      expect(savedContent).toMatch(/^---\nissue_id: PROJ-123\n---\nContent without frontmatter$/);
    });

    it('should update existing fields', async () => {
      (mockApp.vault.read as ReturnType<typeof vi.fn>).mockResolvedValue(`---
issue_id: OLD-999
title: Test
---

Content`);

      await addFrontmatterFields(mockApp, mockFile, {
        issue_id: 'NEW-123',
      });

      expect(savedContent).toContain('issue_id: NEW-123');
      expect(savedContent).not.toContain('OLD-999');
    });

    it('should escape special characters in values', async () => {
      (mockApp.vault.read as ReturnType<typeof vi.fn>).mockResolvedValue('Content');

      await addFrontmatterFields(mockApp, mockFile, {
        issue_link: 'https://jira.example.com/browse/PROJ-123#comment',
      });

      expect(savedContent).toContain('issue_link: "https://jira.example.com/browse/PROJ-123#comment"');
    });

    it('should not modify file if content unchanged', async () => {
      (mockApp.vault.read as ReturnType<typeof vi.fn>).mockResolvedValue(`---
issue_id: PROJ-123
---

Content`);

      await addFrontmatterFields(mockApp, mockFile, {
        issue_id: 'PROJ-123',
      });

      expect(mockApp.vault.modify).not.toHaveBeenCalled();
    });
  });
});
