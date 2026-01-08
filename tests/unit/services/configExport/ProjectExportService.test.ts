import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App } from 'obsidian';
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
const mockGetWorkflowScheme = vi.fn();
const mockGetWorkflows = vi.fn();
const mockGetProjectStatuses = vi.fn();
const mockGetIssueTypesForProject = vi.fn();
const mockGetBoardsForProject = vi.fn();

vi.mock('../../../../src/api/JiraClient', () => ({
  JiraClient: vi.fn().mockImplementation(() => ({
    getProject: mockGetProject,
    getProjectFields: mockGetProjectFields,
    getFieldContexts: mockGetFieldContexts,
    getFieldContextIssueTypes: mockGetFieldContextIssueTypes,
    getFieldOptions: mockGetFieldOptions,
    getAssignableUsers: mockGetAssignableUsers,
    getPriorities: mockGetPriorities,
    getWorkflowScheme: mockGetWorkflowScheme,
    getWorkflows: mockGetWorkflows,
    getProjectStatuses: mockGetProjectStatuses,
    getIssueTypesForProject: mockGetIssueTypesForProject,
    getBoardsForProject: mockGetBoardsForProject,
  })),
}));

import { ProjectExportService } from '../../../../src/services/configExport/ProjectExportService';

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

describe('ProjectExportService', () => {
  let mockApp: App;
  let service: ProjectExportService;
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

    service = new ProjectExportService(mockApp, mockInstance, '1.0.0');

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
    ]);

    mockGetFieldContexts.mockResolvedValue([
      { id: 'ctx-1', name: 'Default Context', isGlobalContext: true, isAnyIssueType: true },
    ]);

    mockGetFieldContextIssueTypes.mockResolvedValue([]);
    mockGetFieldOptions.mockResolvedValue([]);

    mockGetAssignableUsers.mockResolvedValue([
      { accountId: 'user-1', displayName: 'John Doe' },
    ]);

    mockGetPriorities.mockResolvedValue([
      { id: '1', name: 'High', iconUrl: 'https://jira.test/icon/1' },
    ]);

    mockGetWorkflowScheme.mockResolvedValue({
      id: 'scheme-1',
      name: 'Software Workflow Scheme',
      defaultWorkflow: 'Software Simplified Workflow',
      issueTypeMappings: {},
    });

    mockGetWorkflows.mockResolvedValue([
      {
        id: 'wf-1',
        name: 'Software Simplified Workflow',
        statuses: [
          { id: 'status-1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
        ],
        transitions: [],
      },
    ]);

    mockGetProjectStatuses.mockResolvedValue([
      { issueTypeId: '10001', issueTypeName: 'Story', statuses: [] },
    ]);

    mockGetIssueTypesForProject.mockResolvedValue([
      { id: '10001', name: 'Story', subtask: false, hierarchyLevel: 0 },
      { id: '10002', name: 'Bug', subtask: false, hierarchyLevel: 0 },
    ]);

    mockGetBoardsForProject.mockResolvedValue([
      { id: '1', name: 'TEST Board', type: 'scrum' },
    ]);
  });

  describe('exportProjectConfig', () => {
    it('should export full project configuration', async () => {
      const result = await service.exportProjectConfig(
        'TEST',
        ['10001'],
        { includeFields: true, includeWorkflows: true, includeIssueTypes: true, includeBoards: true },
      );

      expect(result.meta.projectKey).toBe('TEST');
      expect(result.meta.projectType).toBe('software');
      expect(result.fields.length).toBeGreaterThan(0);
      expect(result.workflows.length).toBeGreaterThan(0);
      expect(result.issueTypes.length).toBeGreaterThan(0);
      expect(result.boards.length).toBeGreaterThan(0);
    });

    it('should export only fields when other options are disabled', async () => {
      const result = await service.exportProjectConfig(
        'TEST',
        ['10001'],
        { includeFields: true, includeWorkflows: false, includeIssueTypes: false, includeBoards: false },
      );

      expect(result.fields.length).toBeGreaterThan(0);
      expect(result.workflows).toHaveLength(0);
      expect(result.issueTypes).toHaveLength(0);
      expect(result.boards).toHaveLength(0);
    });

    it('should export only workflows when other options are disabled', async () => {
      const result = await service.exportProjectConfig(
        'TEST',
        ['10001'],
        { includeFields: false, includeWorkflows: true, includeIssueTypes: false, includeBoards: false },
      );

      expect(result.fields).toHaveLength(0);
      expect(result.workflows.length).toBeGreaterThan(0);
      expect(result.issueTypes).toHaveLength(0);
      expect(result.boards).toHaveLength(0);
    });

    it('should throw error for non-software projects', async () => {
      mockGetProject.mockResolvedValue({
        id: '10000',
        key: 'BUS',
        name: 'Business Project',
        projectTypeKey: 'business',
      });

      await expect(
        service.exportProjectConfig(
          'BUS',
          ['10001'],
          { includeFields: true, includeWorkflows: true, includeIssueTypes: true, includeBoards: true },
        ),
      ).rejects.toThrow('Only software projects are supported');
    });

    it('should call progress callback during export', async () => {
      const progressCallback = vi.fn();

      await service.exportProjectConfig(
        'TEST',
        ['10001'],
        { includeFields: true, includeWorkflows: true, includeIssueTypes: true, includeBoards: true },
        progressCallback,
      );

      expect(progressCallback).toHaveBeenCalled();
      const calls = progressCallback.mock.calls;
      expect(calls.some(c => c[0].step === 'Fetching project details')).toBe(true);
      expect(calls.some(c => c[0].step === 'Export complete')).toBe(true);
    });

    it('should filter issue types by selected ids', async () => {
      const result = await service.exportProjectConfig(
        'TEST',
        ['10001'],
        { includeFields: false, includeWorkflows: false, includeIssueTypes: true, includeBoards: false },
      );

      expect(result.issueTypes).toHaveLength(1);
      expect(result.issueTypes[0].id).toBe('10001');
    });
  });

  describe('saveToVault', () => {
    it('should create folder and files', async () => {
      const config = await service.exportProjectConfig(
        'TEST',
        ['10001'],
        { includeFields: true, includeWorkflows: true, includeIssueTypes: true, includeBoards: true },
      );

      const folderPath = await service.saveToVault(config, 'Jira/Configs');

      expect(mockApp.vault.createFolder).toHaveBeenCalled();
      expect(mockApp.vault.create).toHaveBeenCalled();

      const createCalls = (mockApp.vault.create as ReturnType<typeof vi.fn>).mock.calls;
      expect(createCalls.some(c => c[0].endsWith('config.json'))).toBe(true);
      expect(createCalls.some(c => c[0].endsWith('README.md'))).toBe(true);
      expect(createCalls.some(c => c[0].endsWith('fields.md'))).toBe(true);
      expect(createCalls.some(c => c[0].endsWith('workflows.md'))).toBe(true);
      expect(createCalls.some(c => c[0].endsWith('issue-types.md'))).toBe(true);
      expect(createCalls.some(c => c[0].endsWith('boards.md'))).toBe(true);
    });

    it('should not create markdown files for empty sections', async () => {
      const config = await service.exportProjectConfig(
        'TEST',
        ['10001'],
        { includeFields: false, includeWorkflows: false, includeIssueTypes: false, includeBoards: false },
      );

      await service.saveToVault(config, 'Jira/Configs');

      const createCalls = (mockApp.vault.create as ReturnType<typeof vi.fn>).mock.calls;
      expect(createCalls.some(c => c[0].endsWith('config.json'))).toBe(true);
      expect(createCalls.some(c => c[0].endsWith('README.md'))).toBe(true);
      expect(createCalls.some(c => c[0].endsWith('fields.md'))).toBe(false);
      expect(createCalls.some(c => c[0].endsWith('workflows.md'))).toBe(false);
    });

    it('should return folder path', async () => {
      const config = await service.exportProjectConfig(
        'TEST',
        ['10001'],
        { includeFields: true, includeWorkflows: false, includeIssueTypes: false, includeBoards: false },
      );

      const folderPath = await service.saveToVault(config, 'Jira/Configs');

      expect(folderPath).toMatch(/^Jira\/Configs\/TEST-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    });
  });
});
