import type { JiraInstance, CustomFieldConfig } from '../../../../types';

export interface CustomFieldsModalOptions {
  instance: JiraInstance;
  projectKey: string;
  customFields: CustomFieldConfig[];
}

export interface CustomFieldsModalResult {
  customFields: CustomFieldConfig[];
}
