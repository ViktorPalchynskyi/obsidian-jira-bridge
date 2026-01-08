import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App, TFile, TFolder } from 'obsidian';
import { ConfigDiscoveryService } from '../../../../src/services/configExport/ConfigDiscoveryService';

describe('ConfigDiscoveryService', () => {
  let mockApp: App;
  let service: ConfigDiscoveryService;

  const mockConfigJson = JSON.stringify({
    meta: {
      version: '1.0',
      exportedAt: '2026-01-08T12:00:00.000Z',
      pluginVersion: '1.0.0',
      projectKey: 'TEST',
      projectName: 'Test Project',
      projectId: '10000',
      projectType: 'software',
      instanceName: 'Test Instance',
      instanceId: 'instance-1',
      selectedIssueTypes: ['10001'],
    },
    fields: [{ id: 'field-1' }, { id: 'field-2' }],
    issueTypes: [{ id: '10001' }],
    workflows: [{ id: 'wf-1' }, { id: 'wf-2' }],
    assignableUsers: [],
    priorities: [],
    boards: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockApp = {
      vault: {
        getAbstractFileByPath: vi.fn(),
        read: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as App;

    service = new ConfigDiscoveryService(mockApp);
  });

  describe('discoverConfigs', () => {
    it('should return empty array if base folder does not exist', async () => {
      (mockApp.vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await service.discoverConfigs('Jira/Configs');

      expect(result).toEqual([]);
    });

    it('should return empty array if base folder has no children', async () => {
      const mockFolder = { children: [] };
      (mockApp.vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mockReturnValue(mockFolder);

      const result = await service.discoverConfigs('Jira/Configs');

      expect(result).toEqual([]);
    });

    it('should discover configurations from folders', async () => {
      const mockConfigFolder: Partial<TFolder> = {
        path: 'Jira/Configs/TEST-2026-01-08T12-00-00',
        children: [],
      };

      const mockConfigFile: Partial<TFile> = {
        path: 'Jira/Configs/TEST-2026-01-08T12-00-00/config.json',
        extension: 'json',
      };

      const mockBaseFolder: Partial<TFolder> = {
        children: [mockConfigFolder as TFolder],
      };

      (mockApp.vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
        if (path === 'Jira/Configs') return mockBaseFolder;
        if (path === 'Jira/Configs/TEST-2026-01-08T12-00-00/config.json') return mockConfigFile;
        return null;
      });

      (mockApp.vault.read as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfigJson);

      const result = await service.discoverConfigs('Jira/Configs');

      expect(result).toHaveLength(1);
      expect(result[0].projectKey).toBe('TEST');
      expect(result[0].projectName).toBe('Test Project');
      expect(result[0].instanceName).toBe('Test Instance');
      expect(result[0].fieldsCount).toBe(2);
      expect(result[0].issueTypesCount).toBe(1);
      expect(result[0].workflowsCount).toBe(2);
    });

    it('should skip folders without config.json', async () => {
      const mockConfigFolder: Partial<TFolder> = {
        path: 'Jira/Configs/TEST-folder',
        children: [],
      };

      const mockBaseFolder: Partial<TFolder> = {
        children: [mockConfigFolder as TFolder],
      };

      (mockApp.vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
        if (path === 'Jira/Configs') return mockBaseFolder;
        return null;
      });

      const result = await service.discoverConfigs('Jira/Configs');

      expect(result).toEqual([]);
    });

    it('should sort configurations by export date (newest first)', async () => {
      const mockConfig1 = JSON.parse(mockConfigJson);
      mockConfig1.meta.exportedAt = '2026-01-07T12:00:00.000Z';
      mockConfig1.meta.projectKey = 'OLD';

      const mockConfig2 = JSON.parse(mockConfigJson);
      mockConfig2.meta.exportedAt = '2026-01-09T12:00:00.000Z';
      mockConfig2.meta.projectKey = 'NEW';

      const mockFolder1: Partial<TFolder> = { path: 'Jira/Configs/OLD-folder', children: [] };
      const mockFolder2: Partial<TFolder> = { path: 'Jira/Configs/NEW-folder', children: [] };

      const mockFile1: Partial<TFile> = { path: 'Jira/Configs/OLD-folder/config.json', extension: 'json' };
      const mockFile2: Partial<TFile> = { path: 'Jira/Configs/NEW-folder/config.json', extension: 'json' };

      const mockBaseFolder: Partial<TFolder> = {
        children: [mockFolder1 as TFolder, mockFolder2 as TFolder],
      };

      (mockApp.vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
        if (path === 'Jira/Configs') return mockBaseFolder;
        if (path === 'Jira/Configs/OLD-folder/config.json') return mockFile1;
        if (path === 'Jira/Configs/NEW-folder/config.json') return mockFile2;
        return null;
      });

      (mockApp.vault.read as ReturnType<typeof vi.fn>).mockImplementation((file: TFile) => {
        if (file.path.includes('OLD')) return JSON.stringify(mockConfig1);
        if (file.path.includes('NEW')) return JSON.stringify(mockConfig2);
        return '';
      });

      const result = await service.discoverConfigs('Jira/Configs');

      expect(result).toHaveLength(2);
      expect(result[0].projectKey).toBe('NEW');
      expect(result[1].projectKey).toBe('OLD');
    });
  });

  describe('getConfigByPath', () => {
    it('should return null if config file does not exist', async () => {
      (mockApp.vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await service.getConfigByPath('Jira/Configs/TEST');

      expect(result).toBeNull();
    });

    it('should return parsed config', async () => {
      const mockFile: Partial<TFile> = {
        path: 'Jira/Configs/TEST/config.json',
        extension: 'json',
      };

      (mockApp.vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mockReturnValue(mockFile);
      (mockApp.vault.read as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfigJson);

      const result = await service.getConfigByPath('Jira/Configs/TEST');

      expect(result).not.toBeNull();
      expect(result?.meta.projectKey).toBe('TEST');
    });
  });

  describe('deleteConfig', () => {
    it('should return false if folder does not exist', async () => {
      (mockApp.vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await service.deleteConfig('Jira/Configs/TEST');

      expect(result).toBe(false);
    });

    it('should delete folder and return true', async () => {
      const mockFolder: Partial<TFolder> = {
        path: 'Jira/Configs/TEST',
        children: [],
      };

      (mockApp.vault.getAbstractFileByPath as ReturnType<typeof vi.fn>).mockReturnValue(mockFolder);
      (mockApp.vault.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await service.deleteConfig('Jira/Configs/TEST');

      expect(result).toBe(true);
      expect(mockApp.vault.delete).toHaveBeenCalledWith(mockFolder, true);
    });
  });
});
