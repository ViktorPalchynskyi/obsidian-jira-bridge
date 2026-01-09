import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurationValidationService } from '../../../../src/services/configImport/ConfigurationValidationService';
import type { JiraClient } from '../../../../src/api/JiraClient';
import type { ExportedProjectConfig } from '../../../../src/types';

describe('ConfigurationValidationService', () => {
  let mockClient: JiraClient;
  let service: ConfigurationValidationService;

  const createMockConfig = (overrides: Partial<ExportedProjectConfig> = {}): ExportedProjectConfig => ({
    meta: {
      version: '1.0',
      exportedAt: '2026-01-08T12:00:00.000Z',
      pluginVersion: '1.0.0',
      projectKey: 'SOURCE',
      projectName: 'Source Project',
      projectId: '10000',
      projectType: 'software',
      instanceName: 'Test Instance',
      instanceId: 'instance-1',
      selectedIssueTypes: ['10001', '10002'],
    },
    fields: [],
    assignableUsers: [],
    priorities: [],
    issueTypes: [],
    workflows: [],
    workflowScheme: null,
    boards: [],
    boardConfigs: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      getProject: vi.fn().mockResolvedValue({
        id: '20000',
        key: 'TARGET',
        name: 'Target Project',
        projectTypeKey: 'software',
      }),
      getProjectFields: vi.fn().mockResolvedValue([]),
      getIssueTypesForProject: vi.fn().mockResolvedValue([]),
      getProjectStatuses: vi.fn().mockResolvedValue([]),
      getBoardsForProject: vi.fn().mockResolvedValue([]),
    } as unknown as JiraClient;

    service = new ConfigurationValidationService(mockClient);
  });

  describe('validate', () => {
    describe('project type validation', () => {
      it('should pass when project types match', async () => {
        const config = createMockConfig({ meta: { ...createMockConfig().meta, projectType: 'software' } });
        (mockClient.getProject as ReturnType<typeof vi.fn>).mockResolvedValue({
          id: '20000',
          key: 'TARGET',
          name: 'Target Project',
          projectTypeKey: 'software',
        });

        const result = await service.validate(config, 'TARGET');

        expect(result.compatible).toBe(true);
        const projectTypeCheck = result.checks.find(c => c.name === 'Project Type');
        expect(projectTypeCheck?.status).toBe('pass');
      });

      it('should fail when project types do not match', async () => {
        const config = createMockConfig({ meta: { ...createMockConfig().meta, projectType: 'software' } });
        (mockClient.getProject as ReturnType<typeof vi.fn>).mockResolvedValue({
          id: '20000',
          key: 'TARGET',
          name: 'Target Project',
          projectTypeKey: 'business',
        });

        const result = await service.validate(config, 'TARGET');

        expect(result.compatible).toBe(false);
        expect(result.severity).toBe('error');
        const projectTypeCheck = result.checks.find(c => c.name === 'Project Type');
        expect(projectTypeCheck?.status).toBe('fail');
        expect(projectTypeCheck?.details).toContain('Configuration import requires matching project types');
      });
    });

    describe('custom fields validation', () => {
      it('should pass when no custom fields', async () => {
        const config = createMockConfig({ fields: [] });

        const result = await service.validate(config, 'TARGET');

        const fieldCheck = result.checks.find(c => c.name === 'Custom Fields');
        expect(fieldCheck?.status).toBe('pass');
        expect(fieldCheck?.message).toContain('No custom fields');
      });

      it('should pass when all custom fields exist', async () => {
        const config = createMockConfig({
          fields: [
            {
              id: 'customfield_10001',
              key: 'customfield_10001',
              name: 'Story Points',
              type: 'number',
              custom: true,
              required: false,
              schema: { type: 'number' },
              contexts: [],
              options: [],
            },
          ],
        });

        (mockClient.getProjectFields as ReturnType<typeof vi.fn>).mockResolvedValue([
          { id: 'customfield_10001', name: 'Story Points', custom: true },
        ]);

        const result = await service.validate(config, 'TARGET');

        const fieldCheck = result.checks.find(c => c.name === 'Custom Fields');
        expect(fieldCheck?.status).toBe('pass');
        expect(fieldCheck?.message).toContain('All 1 custom fields exist');
      });

      it('should pass when some custom fields are missing (will be created)', async () => {
        const config = createMockConfig({
          fields: [
            {
              id: 'customfield_10001',
              key: 'customfield_10001',
              name: 'Story Points',
              type: 'number',
              custom: true,
              required: false,
              schema: { type: 'number' },
              contexts: [],
              options: [],
            },
            {
              id: 'customfield_10002',
              key: 'customfield_10002',
              name: 'Sprint',
              type: 'string',
              custom: true,
              required: false,
              schema: { type: 'string' },
              contexts: [],
              options: [],
            },
          ],
        });

        (mockClient.getProjectFields as ReturnType<typeof vi.fn>).mockResolvedValue([
          { id: 'customfield_10001', name: 'Story Points', custom: true },
        ]);

        const result = await service.validate(config, 'TARGET');

        expect(result.compatible).toBe(true);
        const fieldCheck = result.checks.find(c => c.name === 'Custom Fields');
        expect(fieldCheck?.status).toBe('pass');
        expect(fieldCheck?.message).toContain('1 of 2 custom fields will be created');
        expect(fieldCheck?.details).toContain('Sprint (customfield_10002)');
      });

      it('should pass when all custom fields are missing (will be created)', async () => {
        const config = createMockConfig({
          fields: [
            {
              id: 'customfield_10001',
              key: 'customfield_10001',
              name: 'Story Points',
              type: 'number',
              custom: true,
              required: false,
              schema: { type: 'number' },
              contexts: [],
              options: [],
            },
          ],
        });

        (mockClient.getProjectFields as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const result = await service.validate(config, 'TARGET');

        const fieldCheck = result.checks.find(c => c.name === 'Custom Fields');
        expect(fieldCheck?.status).toBe('pass');
        expect(fieldCheck?.message).toContain('1 of 1 custom fields will be created');
      });
    });

    describe('issue types validation', () => {
      it('should pass when no issue types', async () => {
        const config = createMockConfig({ issueTypes: [] });

        const result = await service.validate(config, 'TARGET');

        const check = result.checks.find(c => c.name === 'Issue Types');
        expect(check?.status).toBe('pass');
      });

      it('should pass when all issue types exist by ID', async () => {
        const config = createMockConfig({
          issueTypes: [
            { id: '10001', name: 'Story', subtask: false, hierarchyLevel: 0 },
            { id: '10002', name: 'Bug', subtask: false, hierarchyLevel: 0 },
          ],
        });

        (mockClient.getIssueTypesForProject as ReturnType<typeof vi.fn>).mockResolvedValue([
          { id: '10001', name: 'Story', subtask: false, hierarchyLevel: 0 },
          { id: '10002', name: 'Bug', subtask: false, hierarchyLevel: 0 },
        ]);

        const result = await service.validate(config, 'TARGET');

        const check = result.checks.find(c => c.name === 'Issue Types');
        expect(check?.status).toBe('pass');
        expect(check?.message).toContain('All 2 issue types exist');
      });

      it('should pass when issue types exist by name (different ID)', async () => {
        const config = createMockConfig({
          issueTypes: [{ id: '10001', name: 'Story', subtask: false, hierarchyLevel: 0 }],
        });

        (mockClient.getIssueTypesForProject as ReturnType<typeof vi.fn>).mockResolvedValue([
          { id: '20001', name: 'Story', subtask: false, hierarchyLevel: 0 },
        ]);

        const result = await service.validate(config, 'TARGET');

        const check = result.checks.find(c => c.name === 'Issue Types');
        expect(check?.status).toBe('pass');
      });

      it('should pass when no issue types exist (will be created)', async () => {
        const config = createMockConfig({
          issueTypes: [
            { id: '10001', name: 'Story', subtask: false, hierarchyLevel: 0 },
            { id: '10002', name: 'Bug', subtask: false, hierarchyLevel: 0 },
          ],
        });

        (mockClient.getIssueTypesForProject as ReturnType<typeof vi.fn>).mockResolvedValue([
          { id: '30001', name: 'Task', subtask: false, hierarchyLevel: 0 },
        ]);

        const result = await service.validate(config, 'TARGET');

        expect(result.compatible).toBe(true);
        const check = result.checks.find(c => c.name === 'Issue Types');
        expect(check?.status).toBe('pass');
        expect(check?.message).toContain('2 of 2 issue types will be created');
      });

      it('should pass when some issue types are missing (will be created)', async () => {
        const config = createMockConfig({
          issueTypes: [
            { id: '10001', name: 'Story', subtask: false, hierarchyLevel: 0 },
            { id: '10002', name: 'Bug', subtask: false, hierarchyLevel: 0 },
          ],
        });

        (mockClient.getIssueTypesForProject as ReturnType<typeof vi.fn>).mockResolvedValue([
          { id: '10001', name: 'Story', subtask: false, hierarchyLevel: 0 },
        ]);

        const result = await service.validate(config, 'TARGET');

        const check = result.checks.find(c => c.name === 'Issue Types');
        expect(check?.status).toBe('pass');
        expect(check?.message).toContain('1 of 2 issue types will be created');
      });
    });

    describe('workflows validation', () => {
      it('should pass when no workflows', async () => {
        const config = createMockConfig({ workflows: [] });

        const result = await service.validate(config, 'TARGET');

        const check = result.checks.find(c => c.name === 'Workflows');
        expect(check?.status).toBe('pass');
      });

      it('should pass when all statuses exist', async () => {
        const config = createMockConfig({
          workflows: [
            {
              id: 'wf-1',
              name: 'Software Workflow',
              statuses: [
                { id: '1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
                { id: '3', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
              ],
              transitions: [],
              issueTypes: ['10001'],
            },
          ],
        });

        (mockClient.getProjectStatuses as ReturnType<typeof vi.fn>).mockResolvedValue([
          {
            issueTypeId: '10001',
            issueTypeName: 'Story',
            statuses: [
              { id: '1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
              { id: '3', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
            ],
          },
        ]);

        const result = await service.validate(config, 'TARGET');

        const check = result.checks.find(c => c.name === 'Workflows');
        expect(check?.status).toBe('pass');
        expect(check?.message).toContain('All 2 workflow statuses exist');
      });

      it('should pass when statuses exist by name', async () => {
        const config = createMockConfig({
          workflows: [
            {
              id: 'wf-1',
              name: 'Software Workflow',
              statuses: [
                { id: '100', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
              ],
              transitions: [],
              issueTypes: ['10001'],
            },
          ],
        });

        (mockClient.getProjectStatuses as ReturnType<typeof vi.fn>).mockResolvedValue([
          {
            issueTypeId: '10001',
            issueTypeName: 'Story',
            statuses: [{ id: '1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } }],
          },
        ]);

        const result = await service.validate(config, 'TARGET');

        const check = result.checks.find(c => c.name === 'Workflows');
        expect(check?.status).toBe('pass');
      });

      it('should pass when some statuses are missing (will be created)', async () => {
        const config = createMockConfig({
          workflows: [
            {
              id: 'wf-1',
              name: 'Software Workflow',
              statuses: [
                { id: '1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
                { id: '2', name: 'In Progress', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
                { id: '3', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
              ],
              transitions: [],
              issueTypes: ['10001'],
            },
          ],
        });

        (mockClient.getProjectStatuses as ReturnType<typeof vi.fn>).mockResolvedValue([
          {
            issueTypeId: '10001',
            issueTypeName: 'Story',
            statuses: [
              { id: '1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
              { id: '3', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
            ],
          },
        ]);

        const result = await service.validate(config, 'TARGET');

        const check = result.checks.find(c => c.name === 'Workflows');
        expect(check?.status).toBe('pass');
        expect(check?.message).toContain('1 of 3 workflow statuses will be created');
        expect(check?.details).toContain('In Progress (2)');
      });
    });
  });

  describe('diff generation', () => {
    it('should generate diff when validation passes', async () => {
      const config = createMockConfig({
        fields: [
          {
            id: 'customfield_10001',
            key: 'customfield_10001',
            name: 'Story Points',
            type: 'number',
            custom: true,
            required: false,
            schema: { type: 'number' },
            contexts: [],
            options: [{ id: '1', value: '1', disabled: false }],
          },
          {
            id: 'summary',
            key: 'summary',
            name: 'Summary',
            type: 'string',
            custom: false,
            required: true,
            schema: { type: 'string', system: 'summary' },
            contexts: [],
            options: [],
          },
        ],
        issueTypes: [
          { id: '10001', name: 'Story', subtask: false, hierarchyLevel: 0 },
          { id: '10002', name: 'Bug', subtask: false, hierarchyLevel: 0 },
        ],
        workflows: [
          {
            id: 'wf-1',
            name: 'Workflow 1',
            statuses: [{ id: '1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } }],
            transitions: [],
            issueTypes: ['10001'],
          },
        ],
      });

      (mockClient.getProjectFields as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'customfield_10001', name: 'Story Points', custom: true },
      ]);
      (mockClient.getIssueTypesForProject as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '10001', name: 'Story', subtask: false, hierarchyLevel: 0 },
        { id: '20002', name: 'Bug', subtask: false, hierarchyLevel: 0 },
      ]);
      (mockClient.getProjectStatuses as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          issueTypeId: '10001',
          issueTypeName: 'Story',
          statuses: [{ id: '1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } }],
        },
      ]);

      const result = await service.validate(config, 'TARGET');

      expect(result.compatible).toBe(true);
      expect(result.diff).not.toBeNull();

      expect(result.diff!.fields.modified).toHaveLength(1);
      expect(result.diff!.fields.modified[0].item.name).toBe('Story Points');

      expect(result.diff!.fields.unchanged).toHaveLength(1);
      expect(result.diff!.fields.unchanged[0].item.name).toBe('Summary');

      expect(result.diff!.issueTypes.unchanged).toHaveLength(1);
      expect(result.diff!.issueTypes.unchanged[0].item.name).toBe('Story');

      expect(result.diff!.issueTypes.modified).toHaveLength(1);
      expect(result.diff!.issueTypes.modified[0].item.name).toBe('Bug');

      expect(result.diff!.workflows.unchanged).toHaveLength(1);
    });

    it('should not generate diff when validation fails', async () => {
      const config = createMockConfig({
        meta: { ...createMockConfig().meta, projectType: 'software' },
      });
      (mockClient.getProject as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '20000',
        key: 'TARGET',
        name: 'Target Project',
        projectTypeKey: 'business',
      });

      const result = await service.validate(config, 'TARGET');

      expect(result.compatible).toBe(false);
      expect(result.diff).toBeNull();
    });

    it('should mark fields as new when not in target', async () => {
      const config = createMockConfig({
        fields: [
          {
            id: 'customfield_99999',
            key: 'customfield_99999',
            name: 'Missing Field',
            type: 'string',
            custom: true,
            required: false,
            schema: { type: 'string' },
            contexts: [],
            options: [],
          },
        ],
      });

      (mockClient.getProjectFields as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.validate(config, 'TARGET');

      expect(result.diff!.fields.new).toHaveLength(1);
      expect(result.diff!.fields.new[0].reason).toContain('Will be created');
    });
  });
});
