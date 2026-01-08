import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App, TFolder } from 'obsidian';
import type { JiraInstance } from '../../../../src/types';

vi.mock('obsidian', () => ({
  requestUrl: vi.fn(),
}));

const mockGetProject = vi.fn();
const mockGetProjectFields = vi.fn();
const mockGetFieldContexts = vi.fn();
const mockGetFieldContextIssueTypes = vi.fn();
const mockGetFieldOptions = vi.fn();
const mockGetAssignableUsers = vi.fn();
const mockGetPriorities = vi.fn();

vi.mock('../../../../src/api/JiraClient', () => ({
  JiraClient: vi.fn().mockImplementation(() => ({
    getProject: mockGetProject,
    getProjectFields: mockGetProjectFields,
    getFieldContexts: mockGetFieldContexts,
    getFieldContextIssueTypes: mockGetFieldContextIssueTypes,
    getFieldOptions: mockGetFieldOptions,
    getAssignableUsers: mockGetAssignableUsers,
    getPriorities: mockGetPriorities,
  })),
}));

import { FieldExportService } from '../../../../src/services/configExport/FieldExportService';

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

describe('FieldExportService', () => {
  let mockApp: App;
  let service: FieldExportService;
  const mockInstance = createMockInstance();

  beforeEach(() => {
    vi.clearAllMocks();

    mockApp = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
        createFolder: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as App;

    service = new FieldExportService(mockApp, mockInstance, '1.0.0');

    mockGetProject.mockResolvedValue({
      id: '10000',
      key: 'TEST',
      name: 'Test Project',
      projectTypeKey: 'software',
    });

    mockGetProjectFields.mockResolvedValue([
      {
        id: 'summary',
        key: 'summary',
        name: 'Summary',
        custom: false,
        schema: { type: 'string', system: 'summary' },
      },
      {
        id: 'customfield_10001',
        key: 'customfield_10001',
        name: 'Story Points',
        custom: true,
        schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' },
      },
      {
        id: 'customfield_10002',
        key: 'customfield_10002',
        name: 'Sprint',
        custom: true,
        schema: { type: 'option', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select' },
      },
    ]);

    mockGetFieldContexts.mockResolvedValue([
      { id: 'ctx-1', name: 'Default Context', isGlobalContext: true, isAnyIssueType: true },
    ]);

    mockGetFieldContextIssueTypes.mockResolvedValue([]);

    mockGetFieldOptions.mockResolvedValue([
      { id: 'opt-1', value: 'Option 1', disabled: false },
      { id: 'opt-2', value: 'Option 2', disabled: false },
    ]);

    mockGetAssignableUsers.mockResolvedValue([
      { accountId: 'user-1', displayName: 'John Doe' },
      { accountId: 'user-2', displayName: 'Jane Smith' },
    ]);

    mockGetPriorities.mockResolvedValue([
      { id: '1', name: 'Highest', iconUrl: 'https://jira.test/icon/1' },
      { id: '2', name: 'High', iconUrl: 'https://jira.test/icon/2' },
      { id: '3', name: 'Medium', iconUrl: 'https://jira.test/icon/3' },
    ]);
  });

  describe('exportFieldConfig', () => {
    it('should export field configuration successfully', async () => {
      const issueTypeIds = ['10001', '10002'];

      const result = await service.exportFieldConfig('TEST', issueTypeIds);

      expect(result.meta.projectKey).toBe('TEST');
      expect(result.meta.projectName).toBe('Test Project');
      expect(result.meta.projectType).toBe('software');
      expect(result.meta.instanceName).toBe('Test Instance');
      expect(result.meta.selectedIssueTypes).toEqual(issueTypeIds);
      expect(result.meta.version).toBe('1.0');
      expect(result.meta.pluginVersion).toBe('1.0.0');
    });

    it('should include all fields from project', async () => {
      const result = await service.exportFieldConfig('TEST', ['10001']);

      expect(result.fields).toHaveLength(3);
      expect(result.fields.map(f => f.name)).toContain('Summary');
      expect(result.fields.map(f => f.name)).toContain('Story Points');
      expect(result.fields.map(f => f.name)).toContain('Sprint');
    });

    it('should include options for select fields', async () => {
      const result = await service.exportFieldConfig('TEST', ['10001']);

      const sprintField = result.fields.find(f => f.name === 'Sprint');
      expect(sprintField?.options).toHaveLength(2);
      expect(sprintField?.options[0].value).toBe('Option 1');
    });

    it('should include assignable users', async () => {
      const result = await service.exportFieldConfig('TEST', ['10001']);

      expect(result.assignableUsers).toHaveLength(2);
      expect(result.assignableUsers[0].displayName).toBe('John Doe');
    });

    it('should include priorities', async () => {
      const result = await service.exportFieldConfig('TEST', ['10001']);

      expect(result.priorities).toHaveLength(3);
      expect(result.priorities.map(p => p.name)).toContain('Medium');
    });

    it('should throw error for non-software projects', async () => {
      mockGetProject.mockResolvedValue({
        id: '10000',
        key: 'BUS',
        name: 'Business Project',
        projectTypeKey: 'business',
      });

      await expect(service.exportFieldConfig('BUS', ['10001'])).rejects.toThrow('Only software projects are supported');
    });

    it('should call progress callback during export', async () => {
      const progressCallback = vi.fn();

      await service.exportFieldConfig('TEST', ['10001'], progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      const calls = progressCallback.mock.calls;
      expect(calls.some(c => c[0].step === 'Fetching project details')).toBe(true);
      expect(calls.some(c => c[0].step === 'Fetching fields')).toBe(true);
      expect(calls.some(c => c[0].step === 'Export complete')).toBe(true);
    });
  });

  describe('saveToVault', () => {
    it('should create folder and files', async () => {
      const config = await service.exportFieldConfig('TEST', ['10001']);

      const folderPath = await service.saveToVault(config, 'Jira/Configs');

      expect(mockApp.vault.createFolder).toHaveBeenCalled();
      expect(mockApp.vault.create).toHaveBeenCalledTimes(2);

      const createCalls = (mockApp.vault.create as ReturnType<typeof vi.fn>).mock.calls;
      expect(createCalls.some(c => c[0].endsWith('fields.json'))).toBe(true);
      expect(createCalls.some(c => c[0].endsWith('fields.md'))).toBe(true);
    });

    it('should return folder path', async () => {
      const config = await service.exportFieldConfig('TEST', ['10001']);

      const folderPath = await service.saveToVault(config, 'Jira/Configs');

      expect(folderPath).toMatch(/^Jira\/Configs\/TEST-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    });
  });

  describe('markdown generation', () => {
    it('should generate valid markdown content', async () => {
      const config = await service.exportFieldConfig('TEST', ['10001']);

      const createCalls = (mockApp.vault.create as ReturnType<typeof vi.fn>).mock.calls;

      await service.saveToVault(config, 'Jira/Configs');

      const mdCall = createCalls.find(c => c[0].endsWith('fields.md'));
      expect(mdCall).toBeDefined();

      const mdContent = mdCall![1] as string;
      expect(mdContent).toContain('# Fields Configuration: TEST');
      expect(mdContent).toContain('## Fields Summary');
      expect(mdContent).toContain('## Field Details');
      expect(mdContent).toContain('## Assignable Users');
      expect(mdContent).toContain('## Priorities');
    });
  });

  describe('field contexts filtering', () => {
    it('should include fields with matching issue type contexts', async () => {
      mockGetFieldContexts.mockResolvedValue([
        { id: 'ctx-1', name: 'Story Context', isGlobalContext: false, isAnyIssueType: false },
      ]);
      mockGetFieldContextIssueTypes.mockResolvedValue(['10001']);

      const result = await service.exportFieldConfig('TEST', ['10001']);

      expect(result.fields.length).toBeGreaterThan(0);
    });

    it('should include global context fields', async () => {
      mockGetFieldContexts.mockResolvedValue([
        { id: 'ctx-1', name: 'Global', isGlobalContext: true, isAnyIssueType: false },
      ]);

      const result = await service.exportFieldConfig('TEST', ['10001']);

      expect(result.fields.length).toBeGreaterThan(0);
    });
  });
});
