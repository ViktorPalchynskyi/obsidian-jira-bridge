import type { ConfigurationDiff, FieldConfig, IssueTypeConfig, WorkflowConfig, BoardDetailedConfig } from '../../../types';

export interface ProjectConfig {
  key: string;
  name: string;
  fields: FieldConfig[];
  issueTypes: IssueTypeConfig[];
  workflows: WorkflowConfig[];
  boards: BoardDetailedConfig[];
}

export interface ComparisonProjectInfo {
  key: string;
  name: string;
  fieldsCount: number;
  issueTypesCount: number;
  workflowsCount: number;
  boardsCount: number;
}

export interface ProjectComparisonResult {
  diff: ConfigurationDiff;
  projectAInfo: ComparisonProjectInfo;
  projectBInfo: ComparisonProjectInfo;
}
