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

export type ConstraintType = 'none' | 'issueCount' | 'issueCountExclSubs';

export interface BoardColumnConfig {
  columns: BoardColumn[];
  constraintType?: ConstraintType;
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

export type DiffStatus = 'new' | 'modified' | 'skipped' | 'unchanged';

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
