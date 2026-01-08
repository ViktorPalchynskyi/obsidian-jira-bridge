import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JiraInstance } from '../../../../src/types';

vi.mock('obsidian', () => ({
  requestUrl: vi.fn(),
}));

const mockGetWorkflowScheme = vi.fn();
const mockGetWorkflows = vi.fn();
const mockGetProjectStatuses = vi.fn();

vi.mock('../../../../src/api/JiraClient', () => ({
  JiraClient: vi.fn().mockImplementation(() => ({
    getWorkflowScheme: mockGetWorkflowScheme,
    getWorkflows: mockGetWorkflows,
    getProjectStatuses: mockGetProjectStatuses,
  })),
}));

import { WorkflowExportService } from '../../../../src/services/configExport/WorkflowExportService';

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

describe('WorkflowExportService', () => {
  let service: WorkflowExportService;
  const mockInstance = createMockInstance();

  beforeEach(() => {
    vi.clearAllMocks();

    service = new WorkflowExportService(mockInstance);

    mockGetWorkflowScheme.mockResolvedValue({
      id: 'scheme-1',
      name: 'Software Workflow Scheme',
      defaultWorkflow: 'Software Simplified Workflow',
      issueTypeMappings: {
        '10001': 'Story Workflow',
        '10002': 'Bug Workflow',
      },
    });

    mockGetWorkflows.mockResolvedValue([
      {
        id: 'wf-1',
        name: 'Software Simplified Workflow',
        description: 'Default workflow',
        statuses: [
          { id: 'status-1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
          { id: 'status-2', name: 'In Progress', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
          { id: 'status-3', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
        ],
        transitions: [
          { id: 't-1', name: 'Start Progress', from: 'status-1', to: 'status-2' },
          { id: 't-2', name: 'Complete', from: 'status-2', to: 'status-3' },
        ],
      },
      {
        id: 'wf-2',
        name: 'Story Workflow',
        statuses: [
          { id: 'status-1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
          { id: 'status-4', name: 'Review', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
          { id: 'status-3', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
        ],
        transitions: [
          { id: 't-3', name: 'Send to Review', from: 'status-1', to: 'status-4' },
          { id: 't-4', name: 'Approve', from: 'status-4', to: 'status-3' },
        ],
      },
      {
        id: 'wf-3',
        name: 'Bug Workflow',
        statuses: [],
        transitions: [],
      },
    ]);

    mockGetProjectStatuses.mockResolvedValue([
      { issueTypeId: '10001', issueTypeName: 'Story', statuses: [] },
      { issueTypeId: '10002', issueTypeName: 'Bug', statuses: [] },
    ]);
  });

  describe('exportWorkflows', () => {
    it('should export workflow scheme', async () => {
      const result = await service.exportWorkflows('TEST', '10000', ['10001', '10002']);

      expect(result.workflowScheme).not.toBeNull();
      expect(result.workflowScheme?.name).toBe('Software Workflow Scheme');
      expect(result.workflowScheme?.defaultWorkflow).toBe('Software Simplified Workflow');
    });

    it('should filter workflows by scheme mappings', async () => {
      const result = await service.exportWorkflows('TEST', '10000', ['10001', '10002']);

      expect(result.workflows).toHaveLength(3);
      expect(result.workflows.map(w => w.name)).toContain('Software Simplified Workflow');
      expect(result.workflows.map(w => w.name)).toContain('Story Workflow');
      expect(result.workflows.map(w => w.name)).toContain('Bug Workflow');
    });

    it('should include workflow statuses', async () => {
      const result = await service.exportWorkflows('TEST', '10000', ['10001']);

      const defaultWorkflow = result.workflows.find(w => w.name === 'Software Simplified Workflow');
      expect(defaultWorkflow?.statuses).toHaveLength(3);
      expect(defaultWorkflow?.statuses.map(s => s.name)).toContain('To Do');
      expect(defaultWorkflow?.statuses.map(s => s.name)).toContain('In Progress');
      expect(defaultWorkflow?.statuses.map(s => s.name)).toContain('Done');
    });

    it('should include workflow transitions', async () => {
      const result = await service.exportWorkflows('TEST', '10000', ['10001']);

      const defaultWorkflow = result.workflows.find(w => w.name === 'Software Simplified Workflow');
      expect(defaultWorkflow?.transitions).toHaveLength(2);
      expect(defaultWorkflow?.transitions.map(t => t.name)).toContain('Start Progress');
    });

    it('should build workflows from project statuses when workflow scheme is null (team-managed projects)', async () => {
      mockGetWorkflowScheme.mockResolvedValue(null);
      mockGetProjectStatuses.mockResolvedValue([
        {
          issueTypeId: '10001',
          issueTypeName: 'Story',
          statuses: [
            { id: 'status-1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
            { id: 'status-2', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
          ],
        },
        {
          issueTypeId: '10002',
          issueTypeName: 'Bug',
          statuses: [
            { id: 'status-1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
            { id: 'status-2', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
          ],
        },
      ]);

      const result = await service.exportWorkflows('TEST', '10000', ['10001', '10002']);

      expect(result.workflowScheme).toBeNull();
      expect(result.workflows.length).toBeGreaterThan(0);
      expect(result.workflows[0].statuses).toHaveLength(2);
      expect(result.workflows[0].issueTypes).toContain('Story');
    });

    it('should group issue types with same statuses into one workflow', async () => {
      mockGetWorkflowScheme.mockResolvedValue(null);
      mockGetProjectStatuses.mockResolvedValue([
        {
          issueTypeId: '10001',
          issueTypeName: 'Story',
          statuses: [
            { id: 'status-1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
            { id: 'status-2', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
          ],
        },
        {
          issueTypeId: '10002',
          issueTypeName: 'Bug',
          statuses: [
            { id: 'status-1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
            { id: 'status-2', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
          ],
        },
      ]);

      const result = await service.exportWorkflows('TEST', '10000', ['10001', '10002']);

      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0].issueTypes).toContain('Story');
      expect(result.workflows[0].issueTypes).toContain('Bug');
    });
  });
});
