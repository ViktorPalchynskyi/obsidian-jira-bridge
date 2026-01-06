import type { JiraInstance, PluginSettings } from '../../types';
import type { BulkOperationTarget } from '../../services/types';

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
