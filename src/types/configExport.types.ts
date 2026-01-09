export type ProjectType = 'software';

export interface ExportMeta {
  version: string;
  exportedAt: string;
  pluginVersion: string;
  projectKey: string;
  projectName: string;
  projectId: string;
  projectType: ProjectType;
  instanceName: string;
  instanceId: string;
  selectedIssueTypes: string[];
}

export interface FieldSchema {
  type: string;
  system?: string;
  custom?: string;
  customId?: number;
  items?: string;
}

export interface FieldContext {
  id: string;
  name: string;
  isGlobalContext: boolean;
  isAnyIssueType: boolean;
  issueTypeIds: string[];
}

export interface FieldOption {
  id: string;
  value: string;
  disabled: boolean;
}

export interface FieldConfig {
  id: string;
  key: string;
  name: string;
  type: string;
  custom: boolean;
  required: boolean;
  schema: FieldSchema;
  contexts: FieldContext[];
  options: FieldOption[];
}

export interface UserConfig {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active: boolean;
}

export interface PriorityConfig {
  id: string;
  name: string;
  iconUrl?: string;
}

export interface WorkflowStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string;
    name: string;
  };
}

export interface WorkflowTransition {
  id: string;
  name: string;
  from: string | null;
  to: string;
}

export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  issueTypes: string[];
}

export interface WorkflowSchemeConfig {
  id: string;
  name: string;
  defaultWorkflow: string;
  issueTypeMappings: Record<string, string>;
}

export interface IssueTypeConfig {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  subtask: boolean;
  hierarchyLevel: number;
}

export interface BoardColumnStatus {
  id: string;
  name: string;
}

export interface BoardColumn {
  name: string;
  statuses: BoardColumnStatus[];
  min?: number;
  max?: number;
}

export interface BoardColumnConfig {
  columns: BoardColumn[];
  constraintType?: 'none' | 'issueCount' | 'issueCountExclSubs';
}

export interface BoardFilter {
  id: string;
  name: string;
  query: string;
}

export interface BoardQuickFilter {
  id: string;
  name: string;
  query: string;
  description?: string;
}

export interface BoardEstimation {
  type: 'none' | 'field';
  field?: {
    fieldId: string;
    displayName: string;
  };
}

export interface BoardSubQuery {
  query: string;
}

export interface BoardRanking {
  rankCustomFieldId: number;
}

export interface BoardDetailedConfig {
  id: string;
  name: string;
  type: 'scrum' | 'kanban' | 'simple';
  filter: BoardFilter;
  subQuery?: BoardSubQuery;
  columnConfig: BoardColumnConfig;
  estimation?: BoardEstimation;
  ranking?: BoardRanking;
  quickFilters: BoardQuickFilter[];
}

export interface BoardConfig {
  id: string;
  name: string;
  type: 'scrum' | 'kanban' | 'simple';
}

export interface ExportedFieldConfig {
  meta: ExportMeta;
  fields: FieldConfig[];
  assignableUsers: UserConfig[];
  priorities: PriorityConfig[];
}

export interface ExportedProjectConfig {
  meta: ExportMeta;
  fields: FieldConfig[];
  assignableUsers: UserConfig[];
  priorities: PriorityConfig[];
  issueTypes: IssueTypeConfig[];
  workflows: WorkflowConfig[];
  workflowScheme: WorkflowSchemeConfig | null;
  boards: BoardConfig[];
  boardConfigs: BoardDetailedConfig[];
}

export interface ConfigurationReference {
  id: string;
  projectKey: string;
  projectName: string;
  projectType: ProjectType;
  instanceName: string;
  instanceId: string;
  exportedAt: string;
  folderPath: string;
  version: string;
  fieldsCount: number;
  issueTypesCount: number;
  workflowsCount: number;
  boardsCount: number;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationCheckStatus = 'pass' | 'fail' | 'warning';
export type DiffStatus = 'new' | 'modified' | 'skipped' | 'unchanged';

export interface ValidationCheck {
  name: string;
  status: ValidationCheckStatus;
  message: string;
  details: string[] | null;
}

export interface ValidationResult {
  compatible: boolean;
  severity: ValidationSeverity;
  checks: ValidationCheck[];
  diff: ConfigurationDiff | null;
}

export interface DiffItem<T> {
  item: T;
  status: DiffStatus;
  reason?: string;
  currentValue?: unknown;
  newValue?: unknown;
}

export interface DiffCategory<T> {
  new: DiffItem<T>[];
  modified: DiffItem<T>[];
  skipped: DiffItem<T>[];
  unchanged: DiffItem<T>[];
}

export interface ConfigurationDiff {
  fields: DiffCategory<FieldConfig>;
  issueTypes: DiffCategory<IssueTypeConfig>;
  workflows: DiffCategory<WorkflowConfig>;
  boards: DiffCategory<BoardDetailedConfig>;
}

export type ApplyStepStatus = 'success' | 'partial' | 'error' | 'skipped';

export interface ApplyOptions {
  updateFieldContexts: boolean;
  updateFieldOptions: boolean;
  dryRun: boolean;
}

export interface ApplyItemResult {
  name: string;
  status: ApplyStepStatus;
  reason?: string;
  error?: string;
}

export interface ApplyStepResult {
  step: string;
  status: ApplyStepStatus;
  results: ApplyItemResult[];
  path?: string;
}

export interface ApplyResult {
  success: boolean;
  backupPath: string;
  results: ApplyStepResult[];
  manualSteps: string[];
}

export type ImportWizardStep = 1 | 2 | 3 | 4 | 5;

export interface ImportWizardState {
  currentStep: ImportWizardStep;
  selectedConfig: ConfigurationReference | null;
  targetInstanceId: string | null;
  targetProjectKey: string | null;
  validationResult: ValidationResult | null;
  diffPreview: ConfigurationDiff | null;
  confirmationChecked: boolean;
  applyOptions: ApplyOptions;
}

export interface ExportModalResult {
  folderPath: string;
  projectKey: string;
}

export interface ImportModalResult {
  success: boolean;
  backupPath: string;
  appliedCount: number;
  skippedCount: number;
  manualSteps: string[];
}

export interface ExportProgress {
  step: string;
  current: number;
  total: number;
  detail?: string;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

export interface JiraProjectDetail {
  id: string;
  key: string;
  name: string;
  projectTypeKey: ProjectType;
  description?: string;
}

export interface JiraFieldInfo {
  id: string;
  key: string;
  name: string;
  custom: boolean;
  schema: FieldSchema;
}

export interface JiraFieldContext {
  id: string;
  name: string;
  isGlobalContext: boolean;
  isAnyIssueType: boolean;
}

export interface JiraFieldContextDetail extends JiraFieldContext {
  issueTypeIds: string[];
}

export interface JiraFieldOptionResponse {
  id: string;
  value: string;
  disabled: boolean;
}
