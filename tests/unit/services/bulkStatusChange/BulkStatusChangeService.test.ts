import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFile, TFolder, App } from 'obsidian';
import type { PluginSettings, JiraInstance } from '../../../../src/types';
import type { BulkStatusChangeProgress } from '../../../../src/services/bulkStatusChange';
import { BulkStatusChangeService } from '../../../../src/services/bulkStatusChange/BulkStatusChangeService';

vi.mock('obsidian', () => ({
  requestUrl: vi.fn(),
}));

const createMockInstance = (): JiraInstance => ({
  id: 'instance-1',
  name: 'Test Instance',
  baseUrl: 'https://jira.test',
  email: 'test@test.com',
  apiToken: 'token',
  isDefault: true,
  enabled: true,
  createdAt: Date.now(),
});

const createMockSettings = (): PluginSettings => ({
  instances: [createMockInstance()],
  mappings: [
    {
      id: 'mapping-1',
      folderPath: 'projects/test',
      type: 'project',
      instanceId: 'instance-1',
      projectKey: 'TEST',
      enabled: true,
      createdAt: Date.now(),
    },
  ],
  ui: {
    showStatusBar: true,
    showRibbonIcon: true,
    enableCustomFields: false,
  },
  sync: {
    autoSync: false,
    syncInterval: 30,
    syncOnOpen: false,
  },
  createTicket: {
    customFields: [],
  },
});

const createMockFile = (name: string, path: string): TFile =>
  ({
    name,
    path,
    basename: name.replace('.md', ''),
    extension: 'md',
    parent: { path: path.substring(0, path.lastIndexOf('/')) },
  }) as unknown as TFile;

const createMockFolder = (path: string, children: (TFile | TFolder)[]): TFolder =>
  ({
    path,
    name: path.split('/').pop() || '',
    children,
  }) as unknown as TFolder;

describe('BulkStatusChangeService', () => {
  let mockApp: App;
  let mockSettings: PluginSettings;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApp = {
      vault: {
        read: vi.fn().mockResolvedValue('## Summary\n\n```\nTest Summary\n```'),
        modify: vi.fn(),
        adapter: { constructor: class {} },
      },
      metadataCache: {
        getFileCache: vi.fn().mockReturnValue({
          frontmatter: {
            issue_id: 'TEST-123',
            issue_link: 'https://jira.test/browse/TEST-123',
            status: 'To Do',
          },
        }),
      },
    } as unknown as App;

    mockSettings = createMockSettings();
  });

  describe('execute', () => {
    it('should skip files without project mapping', async () => {
      const file = createMockFile('note.md', 'unmapped/note.md');
      const folder = createMockFolder('unmapped', [file]);

      const service = new BulkStatusChangeService(mockApp, mockSettings, 'instance-1');
      const progressCallback = vi.fn();

      const result = await service.execute(
        folder,
        {
          transitionId: '31',
          transitionName: 'In Progress',
        },
        progressCallback,
      );

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('no project mapping');
      expect(result.changed).toHaveLength(0);
    });

    it('should skip files without issue_id and summary', async () => {
      const file = createMockFile('note.md', 'projects/test/note.md');
      const folder = createMockFolder('projects/test', [file]);

      (mockApp.metadataCache.getFileCache as ReturnType<typeof vi.fn>).mockReturnValue({
        frontmatter: {},
      });
      (mockApp.vault.read as ReturnType<typeof vi.fn>).mockResolvedValue('No summary here');

      const service = new BulkStatusChangeService(mockApp, mockSettings, 'instance-1');
      const progressCallback = vi.fn();

      const result = await service.execute(
        folder,
        {
          transitionId: '31',
          transitionName: 'In Progress',
        },
        progressCallback,
      );

      expect(result.skipped.length).toBeGreaterThan(0);
      const skipReason = result.skipped[0].reason;
      expect(skipReason === 'no issue_id and no summary' || skipReason === 'no project mapping').toBe(true);
    });

    it('should call progress callback during execution', async () => {
      const file = createMockFile('note.md', 'projects/test/note.md');
      const folder = createMockFolder('projects/test', [file]);

      const service = new BulkStatusChangeService(mockApp, mockSettings, 'instance-1');
      const progressCallback = vi.fn();

      await service.execute(
        folder,
        {
          transitionId: '31',
          transitionName: 'In Progress',
        },
        progressCallback,
      );

      expect(progressCallback).toHaveBeenCalled();
      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1][0] as BulkStatusChangeProgress;
      expect(['Complete', 'No notes to process'].includes(lastCall.status)).toBe(true);
    });

    it('should process nested folders', async () => {
      const file1 = createMockFile('note1.md', 'projects/test/note1.md');
      const file2 = createMockFile('note2.md', 'projects/test/subfolder/note2.md');
      const subfolder = createMockFolder('projects/test/subfolder', [file2]);
      const folder = createMockFolder('projects/test', [file1, subfolder]);

      const service = new BulkStatusChangeService(mockApp, mockSettings, 'instance-1');
      const progressCallback = vi.fn();

      const result = await service.execute(
        folder,
        {
          transitionId: '31',
          transitionName: 'In Progress',
        },
        progressCallback,
      );

      expect(result.changed.length + result.skipped.length + result.failed.length).toBeGreaterThan(0);
    });

    it('should stop processing when cancelled', async () => {
      const files = Array.from({ length: 10 }, (_, i) => createMockFile(`note${i}.md`, `projects/test/note${i}.md`));
      const folder = createMockFolder('projects/test', files);

      const service = new BulkStatusChangeService(mockApp, mockSettings, 'instance-1');

      let callCount = 0;
      const progressCallback = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 3) {
          service.cancel();
        }
      });

      const result = await service.execute(
        folder,
        {
          transitionId: '31',
          transitionName: 'In Progress',
        },
        progressCallback,
      );

      expect(result.changed.length + result.skipped.length).toBeLessThan(10);
    });
  });
});
