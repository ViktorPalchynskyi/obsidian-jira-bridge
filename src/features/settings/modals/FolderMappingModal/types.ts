import type { FolderMapping, MappingType } from '../../../../types';
import type { JiraInstance, JiraProject } from '../../../../types';

export interface FolderMappingModalOptions {
  mode: 'add' | 'edit';
  mappingType: MappingType;
  instances: JiraInstance[];
  existingMappings: FolderMapping[];
  mapping?: FolderMapping;
  parentInstanceId?: string;
  baseFolderPath?: string;
}

export interface FolderMappingFormData {
  folderPath: string;
  instanceId?: string;
  projectKey?: string;
}

export interface FormState {
  folderPath: string;
  instanceId: string;
  projectKey: string;
  projects: JiraProject[];
  isLoadingProjects: boolean;
  projectsError: string | null;
}
