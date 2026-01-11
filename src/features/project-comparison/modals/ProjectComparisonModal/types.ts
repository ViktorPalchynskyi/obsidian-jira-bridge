import type { ConfigurationDiff } from '../../../../types';

export type ComparisonStep = 1 | 2 | 3 | 4;

export interface ProjectSelection {
  instanceId: string;
  projectKey: string;
  projectName: string;
}

export interface ComparisonState {
  currentStep: ComparisonStep;
  projectA: ProjectSelection | null;
  projectB: ProjectSelection | null;
  comparisonResult: ComparisonResult | null;
}

export interface ComparisonResult {
  diff: ConfigurationDiff;
  projectAInfo: ProjectInfo;
  projectBInfo: ProjectInfo;
}

export interface ProjectInfo {
  key: string;
  name: string;
  instanceName: string;
  fieldsCount: number;
  issueTypesCount: number;
  workflowsCount: number;
  boardsCount: number;
}

export interface ProjectComparisonModalOptions {
  instances: import('../../../../types').JiraInstance[];
}
