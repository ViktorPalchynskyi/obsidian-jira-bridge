import type { TFolder } from 'obsidian';
import type { JiraInstance, PluginSettings } from '../../types';

export interface BulkStatusChangeModalOptions {
  instances: JiraInstance[];
  defaultInstanceId: string;
  folder: TFolder;
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
