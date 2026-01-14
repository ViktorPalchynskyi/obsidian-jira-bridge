import type { JiraInstance, PluginSettings, JiraTransition, JiraBoard, JiraSprint } from '../../../../types';
import type { BulkOperationTarget } from '../../../../services/types';

export interface BulkStatusChangeModalOptions {
  instances: JiraInstance[];
  defaultInstanceId: string;
  target: BulkOperationTarget;
  settings: PluginSettings;
}

export interface BulkStatusChangeModalResult {
  instanceId: string;
  transitionId?: string;
  transitionName?: string;
  agileAction?: 'backlog' | 'board' | 'sprint';
  sprintId?: number;
  boardId?: string;
}

export interface BulkStatusChangeModalState {
  instanceId: string;
  isLoading: boolean;
  sampleIssueKey: string | null;
  currentStatus: string | null;
  transitions: JiraTransition[];
  selectedTransitionId: string | null;
  error: string | null;
  board: JiraBoard | null;
  availableSprints: JiraSprint[];
  locationAction: 'none' | 'backlog' | 'board' | 'sprint';
  selectedSprintId: number | null;
}
