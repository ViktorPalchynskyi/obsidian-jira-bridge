import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurationApplyService } from '../../../../src/services/configImport/ConfigurationApplyService';
import type { JiraClient } from '../../../../src/api/JiraClient';
import type { App, Vault, DataAdapter } from 'obsidian';
import type {
  ExportedProjectConfig,
  ConfigurationDiff,
  ApplyOptions,
  FieldConfig,
  IssueTypeConfig,
  WorkflowConfig,
} from '../../../../src/types';

describe('ConfigurationApplyService', () => {
  let mockApp: App;
  let mockClient: JiraClient;
  let service: ConfigurationApplyService;

  const createMockField = (overrides: Partial<FieldConfig> = {}): FieldConfig => ({
    id: 'customfield_10001',
    key: 'customfield_10001',
    name: 'Test Field',
    type: 'string',
    custom: true,
    required: false,
    schema: { type: 'string', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:textfield' },
    contexts: [],
    options: [],
    ...overrides,
  });

  const createMockIssueType = (overrides: Partial<IssueTypeConfig> = {}): IssueTypeConfig => ({
    id: '10001',
    name: 'Test Issue Type',
    description: 'Test description',
    subtask: false,
    hierarchyLevel: 0,
    ...overrides,
  });

  const createMockWorkflow = (overrides: Partial<WorkflowConfig> = {}): WorkflowConfig => ({
    id: 'workflow-1',
    name: 'Test Workflow',
    description: 'Test workflow',
    statuses: [
      { id: 'status-1', name: 'To Do', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
      { id: 'status-2', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
    ],
    transitions: [],
    issueTypes: ['10001'],
    ...overrides,
  });

  const createMockConfig = (overrides: Partial<ExportedProjectConfig> = {}): ExportedProjectConfig => ({
    meta: {
      version: '1.0',
      exportedAt: '2026-01-09T12:00:00.000Z',
      pluginVersion: '1.0.0',
      projectKey: 'SOURCE',
      projectName: 'Source Project',
      projectId: '10000',
      projectType: 'software',
      instanceName: 'Test Instance',
      instanceId: 'instance-1',
      selectedIssueTypes: ['10001'],
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

  const createMockDiff = (overrides: Partial<ConfigurationDiff> = {}): ConfigurationDiff => ({
    fields: { new: [], modified: [], skipped: [], unchanged: [] },
    issueTypes: { new: [], modified: [], skipped: [], unchanged: [] },
    workflows: { new: [], modified: [], skipped: [], unchanged: [] },
    boards: { new: [], modified: [], skipped: [], unchanged: [] },
    ...overrides,
  });

  const createDefaultApplyOptions = (): ApplyOptions => ({
    updateFieldContexts: true,
    updateFieldOptions: true,
    dryRun: false,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    const mockAdapter: Partial<DataAdapter> = {
      write: vi.fn().mockResolvedValue(undefined),
    };

    const mockVault: Partial<Vault> = {
      getAbstractFileByPath: vi.fn().mockReturnValue(null),
      createFolder: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
      adapter: mockAdapter as DataAdapter,
    };

    mockApp = {
      vault: mockVault as Vault,
    } as App;

    mockClient = {
      getProject: vi.fn().mockResolvedValue({
        id: '20000',
        key: 'TARGET',
        name: 'Target Project',
        projectTypeKey: 'software',
      }),
      getIssueTypeSchemeForProject: vi.fn().mockResolvedValue({ id: 'scheme-1', name: 'Default Scheme' }),
      getIssueTypesForProject: vi.fn().mockResolvedValue([]),
      createCustomField: vi.fn().mockResolvedValue({ id: 'customfield_new', key: 'customfield_new', name: 'New Field' }),
      createFieldContext: vi.fn().mockResolvedValue({ id: 'context-1' }),
      getFieldContexts: vi.fn().mockResolvedValue([{ id: 'context-1', name: 'Default', isGlobalContext: true, isAnyIssueType: true }]),
      getFieldOptions: vi.fn().mockResolvedValue([]),
      addFieldOptions: vi.fn().mockResolvedValue([]),
      createIssueType: vi.fn().mockResolvedValue({ id: '10100', name: 'New Type' }),
      addIssueTypeToScheme: vi.fn().mockResolvedValue(undefined),
      createStatuses: vi.fn().mockResolvedValue([{ id: 'status-new', name: 'New Status' }]),
      getAllIssueTypes: vi.fn().mockResolvedValue([
        { id: '10001', name: 'Bug', subtask: false },
        { id: '10002', name: 'Story', subtask: false },
        { id: '10003', name: 'Task', subtask: false },
      ]),
      createFilter: vi.fn().mockResolvedValue({ id: 'filter-1', name: 'Test Filter' }),
      createBoard: vi.fn().mockResolvedValue({ id: 'board-1', name: 'Test Board' }),
    } as unknown as JiraClient;

    service = new ConfigurationApplyService(mockApp, mockClient);
  });

  describe('apply', () => {
    describe('dry run mode', () => {
      it('should return skipped results in dry run mode', async () => {
        const config = createMockConfig({
          fields: [createMockField()],
          issueTypes: [createMockIssueType()],
        });
        const diff = createMockDiff({
          fields: { new: [{ item: createMockField(), status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
          issueTypes: { new: [{ item: createMockIssueType(), status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options: ApplyOptions = { ...createDefaultApplyOptions(), dryRun: true };

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(result.success).toBe(true);
        expect(result.manualSteps).toContain('This was a dry run. No changes were made.');

        for (const stepResult of result.results) {
          expect(stepResult.status).toBe('skipped');
          for (const itemResult of stepResult.results) {
            expect(itemResult.status).toBe('skipped');
            expect(itemResult.reason).toContain('Dry run');
          }
        }

        expect(mockClient.createCustomField).not.toHaveBeenCalled();
        expect(mockClient.createIssueType).not.toHaveBeenCalled();
        expect(mockClient.createStatuses).not.toHaveBeenCalled();
      });
    });

    describe('backup creation', () => {
      it('should create backup before applying', async () => {
        const config = createMockConfig();
        const diff = createMockDiff();
        const options = createDefaultApplyOptions();

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(result.backupPath).toContain('Jira/Configs/_backups/TARGET-');
        expect(mockApp.vault.create).toHaveBeenCalled();
      });
    });

    describe('custom fields application', () => {
      it('should create new custom fields', async () => {
        const newField = createMockField({ name: 'New Custom Field' });
        const config = createMockConfig({ fields: [newField] });
        const diff = createMockDiff({
          fields: { new: [{ item: newField, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.createCustomField).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Custom Field',
          }),
        );
        expect(result.results[0].step).toBe('Custom Fields');
        expect(result.results[0].status).toBe('success');
      });

      it('should create field context when updateFieldContexts is true', async () => {
        const newField = createMockField();
        const config = createMockConfig({ fields: [newField] });
        const diff = createMockDiff({
          fields: { new: [{ item: newField, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options: ApplyOptions = { ...createDefaultApplyOptions(), updateFieldContexts: true };

        await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.createFieldContext).toHaveBeenCalledWith('customfield_new', ['20000']);
      });

      it('should add field options when updateFieldOptions is true', async () => {
        const newField = createMockField({
          options: [
            { id: 'opt-1', value: 'Option 1', disabled: false },
            { id: 'opt-2', value: 'Option 2', disabled: false },
          ],
        });
        const config = createMockConfig({ fields: [newField] });
        const diff = createMockDiff({
          fields: { new: [{ item: newField, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options: ApplyOptions = { ...createDefaultApplyOptions(), updateFieldOptions: true };

        await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.addFieldOptions).toHaveBeenCalledWith('customfield_new', 'context-1', ['Option 1', 'Option 2']);
      });

      it('should add existing field to project when creation fails', async () => {
        const newField = createMockField({ name: 'Existing Field' });
        const config = createMockConfig({ fields: [newField] });
        const diff = createMockDiff({
          fields: { new: [{ item: newField, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        (mockClient.createCustomField as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Field already exists'));

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.createFieldContext).toHaveBeenCalledWith(newField.id, ['20000']);
        const fieldResult = result.results.find(r => r.step === 'Custom Fields');
        expect(fieldResult?.status).toBe('success');
        expect(fieldResult?.results[0].status).toBe('success');
        expect(fieldResult?.results[0].reason).toBe('Added existing field to project');
      });

      it('should skip field when context already exists', async () => {
        const newField = createMockField({ name: 'Failing Field' });
        const config = createMockConfig({ fields: [newField] });
        const diff = createMockDiff({
          fields: { new: [{ item: newField, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        (mockClient.createCustomField as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Request failed, status 400'));
        (mockClient.createFieldContext as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Request failed, status 400'));

        const result = await service.apply(config, 'TARGET', diff, options);

        const fieldResult = result.results.find(r => r.step === 'Custom Fields');
        expect(fieldResult?.status).toBe('skipped');
        expect(fieldResult?.results[0].status).toBe('skipped');
        expect(fieldResult?.results[0].reason).toBe('Field context already exists for project');
      });

      it('should report error for non-http errors', async () => {
        const newField = createMockField({ name: 'Failing Field' });
        const config = createMockConfig({ fields: [newField] });
        const diff = createMockDiff({
          fields: { new: [{ item: newField, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        (mockClient.createCustomField as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

        const result = await service.apply(config, 'TARGET', diff, options);

        const fieldResult = result.results.find(r => r.step === 'Custom Fields');
        expect(fieldResult?.status).toBe('error');
        expect(fieldResult?.results[0].status).toBe('error');
        expect(fieldResult?.results[0].error).toBe('Network error');
      });

      it('should update options on modified fields', async () => {
        const modifiedField = createMockField({
          options: [{ id: 'opt-1', value: 'New Option', disabled: false }],
        });
        const config = createMockConfig({ fields: [modifiedField] });
        const diff = createMockDiff({
          fields: { new: [], modified: [{ item: modifiedField, status: 'modified', reason: 'Options will be updated' }], skipped: [], unchanged: [] },
        });
        const options: ApplyOptions = { ...createDefaultApplyOptions(), updateFieldOptions: true };

        await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.getFieldContexts).toHaveBeenCalledWith(modifiedField.id);
        expect(mockClient.getFieldOptions).toHaveBeenCalled();
        expect(mockClient.addFieldOptions).toHaveBeenCalledWith(modifiedField.id, 'context-1', ['New Option']);
      });
    });

    describe('issue types application', () => {
      it('should create new issue types', async () => {
        const newIssueType = createMockIssueType({ name: 'New Issue Type' });
        const config = createMockConfig({ issueTypes: [newIssueType] });
        const diff = createMockDiff({
          issueTypes: { new: [{ item: newIssueType, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.createIssueType).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Issue Type',
            type: 'standard',
          }),
        );
        expect(result.results[1].step).toBe('Issue Types');
        expect(result.results[1].status).toBe('success');
      });

      it('should add issue type to scheme after creation', async () => {
        const newIssueType = createMockIssueType();
        const config = createMockConfig({ issueTypes: [newIssueType] });
        const diff = createMockDiff({
          issueTypes: { new: [{ item: newIssueType, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.addIssueTypeToScheme).toHaveBeenCalledWith('scheme-1', '10100');
      });

      it('should create subtask issue types correctly', async () => {
        const subtaskType = createMockIssueType({ name: 'Subtask', subtask: true, hierarchyLevel: -1 });
        const config = createMockConfig({ issueTypes: [subtaskType] });
        const diff = createMockDiff({
          issueTypes: { new: [{ item: subtaskType, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.createIssueType).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'subtask',
            hierarchyLevel: -1,
          }),
        );
      });

      it('should add existing issue type to scheme when creation fails', async () => {
        const newIssueType = createMockIssueType({ name: 'Bug' });
        const config = createMockConfig({ issueTypes: [newIssueType] });
        const diff = createMockDiff({
          issueTypes: { new: [{ item: newIssueType, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        (mockClient.createIssueType as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Issue type already exists'));

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.getAllIssueTypes).toHaveBeenCalled();
        expect(mockClient.addIssueTypeToScheme).toHaveBeenCalledWith('scheme-1', '10001');
        const issueTypeResult = result.results.find(r => r.step === 'Issue Types');
        expect(issueTypeResult?.status).toBe('success');
        expect(issueTypeResult?.results[0].status).toBe('success');
        expect(issueTypeResult?.results[0].reason).toContain('Added existing issue type');
      });

      it('should skip issue type when already in scheme', async () => {
        const newIssueType = createMockIssueType({ name: 'Bug' });
        const config = createMockConfig({ issueTypes: [newIssueType] });
        const diff = createMockDiff({
          issueTypes: { new: [{ item: newIssueType, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        (mockClient.createIssueType as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Issue type already exists'));
        (mockClient.addIssueTypeToScheme as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Request failed, status 400'));

        const result = await service.apply(config, 'TARGET', diff, options);

        const issueTypeResult = result.results.find(r => r.step === 'Issue Types');
        expect(issueTypeResult?.status).toBe('skipped');
        expect(issueTypeResult?.results[0].status).toBe('skipped');
        expect(issueTypeResult?.results[0].reason).toBe('Issue type already exists in project or name conflicts with global type');
      });

      it('should report error for non-duplicate issue type errors', async () => {
        const newIssueType = createMockIssueType({ name: 'Failing Type' });
        const config = createMockConfig({ issueTypes: [newIssueType] });
        const diff = createMockDiff({
          issueTypes: { new: [{ item: newIssueType, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        (mockClient.createIssueType as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Permission denied'));

        const result = await service.apply(config, 'TARGET', diff, options);

        const issueTypeResult = result.results.find(r => r.step === 'Issue Types');
        expect(issueTypeResult?.status).toBe('error');
        expect(issueTypeResult?.results[0].status).toBe('error');
        expect(issueTypeResult?.results[0].error).toBe('Permission denied');
      });
    });

    describe('workflow statuses application', () => {
      it('should create missing statuses for modified workflows', async () => {
        const workflow = createMockWorkflow({
          id: 'workflow-1',
          statuses: [
            { id: 'status-missing', name: 'Missing Status', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
          ],
        });
        const config = createMockConfig({ workflows: [workflow] });
        const diff = createMockDiff({
          workflows: {
            new: [],
            modified: [{ item: workflow, status: 'modified', reason: '1 statuses will be created' }],
            skipped: [],
            unchanged: [],
          },
        });
        const options = createDefaultApplyOptions();

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.createStatuses).toHaveBeenCalledWith('20000', [
          expect.objectContaining({
            name: 'Missing Status',
            statusCategory: 'IN_PROGRESS',
          }),
        ]);
        expect(result.results[2].step).toBe('Workflow Statuses');
        expect(result.results[2].status).toBe('success');
      });

      it('should map status categories correctly', async () => {
        const workflow = createMockWorkflow({
          statuses: [
            { id: 's1', name: 'New', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
            { id: 's2', name: 'In Progress', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
            { id: 's3', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
          ],
        });
        const config = createMockConfig({ workflows: [workflow] });
        const diff = createMockDiff({
          workflows: {
            new: [],
            modified: [{ item: workflow, status: 'modified', reason: '3 statuses will be created' }],
            skipped: [],
            unchanged: [],
          },
        });
        const options = createDefaultApplyOptions();

        await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.createStatuses).toHaveBeenCalledWith('20000', [
          expect.objectContaining({ statusCategory: 'TODO' }),
          expect.objectContaining({ statusCategory: 'IN_PROGRESS' }),
          expect.objectContaining({ statusCategory: 'DONE' }),
        ]);
      });

      it('should skip when no modified workflows', async () => {
        const config = createMockConfig();
        const diff = createMockDiff();
        const options = createDefaultApplyOptions();

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(mockClient.createStatuses).not.toHaveBeenCalled();
        expect(result.results[2].step).toBe('Workflow Statuses');
        expect(result.results[2].status).toBe('skipped');
      });

      it('should handle status creation errors gracefully', async () => {
        const workflow = createMockWorkflow();
        const config = createMockConfig({ workflows: [workflow] });
        const diff = createMockDiff({
          workflows: {
            new: [],
            modified: [{ item: workflow, status: 'modified', reason: '2 statuses will be created' }],
            skipped: [],
            unchanged: [],
          },
        });
        const options = createDefaultApplyOptions();

        (mockClient.createStatuses as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Cannot create statuses'));

        const result = await service.apply(config, 'TARGET', diff, options);

        const statusResult = result.results.find(r => r.step === 'Workflow Statuses');
        expect(statusResult?.status).toBe('error');
      });
    });

    describe('manual steps', () => {
      it('should include manual step for modified workflows', async () => {
        const workflow = createMockWorkflow();
        const config = createMockConfig({ workflows: [workflow] });
        const diff = createMockDiff({
          workflows: {
            new: [],
            modified: [{ item: workflow, status: 'modified', reason: 'Statuses will be created' }],
            skipped: [],
            unchanged: [],
          },
        });
        const options = createDefaultApplyOptions();

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(result.manualSteps).toContain('Review and update workflow transitions in Jira admin');
      });
    });

    describe('overall result', () => {
      it('should return success when all steps succeed', async () => {
        const config = createMockConfig();
        const diff = createMockDiff();
        const options = createDefaultApplyOptions();

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(result.success).toBe(true);
      });

      it('should return failure when any step has error', async () => {
        const newField = createMockField();
        const config = createMockConfig({ fields: [newField] });
        const diff = createMockDiff({
          fields: { new: [{ item: newField, status: 'new', reason: 'Will be created' }], modified: [], skipped: [], unchanged: [] },
        });
        const options = createDefaultApplyOptions();

        (mockClient.createCustomField as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed'));

        const result = await service.apply(config, 'TARGET', diff, options);

        expect(result.success).toBe(false);
      });
    });
  });
});
