import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFile, TFolder, App } from 'obsidian';
import type { PluginSettings, JiraInstance } from '../../../../src/types';
import type { BulkCreateProgress } from '../../../../src/features/ticket-creation';

vi.mock('obsidian', () => ({
  requestUrl: vi.fn(),
}));

vi.mock('../../../../src/features/ticket-creation/services/BulkCreateCache', () => ({
  BulkCreateCache: vi.fn().mockImplementation(() => ({
    getClient: vi.fn().mockReturnValue({
      getIssueUrl: vi.fn().mockReturnValue('https://jira.test/browse/TEST-1'),
      searchIssuesBySummary: vi.fn().mockResolvedValue([]),
      createIssue: vi.fn().mockResolvedValue({ key: 'TEST-1', id: '1', self: '' }),
    }),
    getIssueTypes: vi.fn().mockResolvedValue([{ id: '10001', name: 'Story' }]),
    getPriorities: vi.fn().mockResolvedValue([{ id: '3', name: 'Medium' }]),
    getAssignableUsers: vi.fn().mockResolvedValue([]),
    checkDuplicates: vi.fn().mockResolvedValue(new Map()),
    addCreatedIssue: vi.fn(),
    findCreatedIssue: vi.fn().mockReturnValue(null),
  })),
}));

import { BulkCreateService } from '../../../../src/features/ticket-creation/services/BulkCreateService';

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
      type: 'instance',
      instanceId: 'instance-1',
      enabled: true,
      createdAt: Date.now(),
    },
    {
      id: 'mapping-2',
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

describe('BulkCreateService', () => {
  let mockApp: App;
  let mockSettings: PluginSettings;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApp = {
      vault: {
        read: vi.fn().mockResolvedValue('## Summary\n\n```\nTest Summary\n```\n\n## Description\n\nTest description'),
        adapter: { constructor: class {} },
      },
      metadataCache: {
        getFileCache: vi.fn().mockReturnValue({
          frontmatter: {
            issue_type: 'Story',
            priority: 'High',
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

      const service = new BulkCreateService(mockApp, mockSettings);
      const progressCallback = vi.fn();

      const result = await service.execute(folder, progressCallback);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('no project mapping');
      expect(result.created).toHaveLength(0);
    });

    it('should skip files without summary', async () => {
      const file = createMockFile('note.md', 'projects/test/note.md');
      const folder = createMockFolder('projects/test', [file]);

      (mockApp.vault.read as ReturnType<typeof vi.fn>).mockResolvedValue('No summary here');

      const service = new BulkCreateService(mockApp, mockSettings);
      const progressCallback = vi.fn();

      const result = await service.execute(folder, progressCallback);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('no summary');
    });

    it('should call progress callback during execution', async () => {
      const file = createMockFile('note.md', 'projects/test/note.md');
      const folder = createMockFolder('projects/test', [file]);

      const service = new BulkCreateService(mockApp, mockSettings);
      const progressCallback = vi.fn();

      await service.execute(folder, progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1][0] as BulkCreateProgress;
      expect(lastCall.status).toBe('Complete');
    });

    it('should process nested folders', async () => {
      const file1 = createMockFile('note1.md', 'projects/test/note1.md');
      const file2 = createMockFile('note2.md', 'projects/test/subfolder/note2.md');
      const subfolder = createMockFolder('projects/test/subfolder', [file2]);
      const folder = createMockFolder('projects/test', [file1, subfolder]);

      const service = new BulkCreateService(mockApp, mockSettings);
      const progressCallback = vi.fn();

      const result = await service.execute(folder, progressCallback);

      expect(result.created.length + result.skipped.length + result.failed.length).toBe(2);
    });

    it('should stop processing when cancelled', async () => {
      const files = Array.from({ length: 10 }, (_, i) => createMockFile(`note${i}.md`, `projects/test/note${i}.md`));
      const folder = createMockFolder('projects/test', files);

      const service = new BulkCreateService(mockApp, mockSettings);

      let callCount = 0;
      const progressCallback = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 3) {
          service.cancel();
        }
      });

      const result = await service.execute(folder, progressCallback);

      expect(result.created.length + result.skipped.length).toBeLessThan(10);
    });
  });
});
