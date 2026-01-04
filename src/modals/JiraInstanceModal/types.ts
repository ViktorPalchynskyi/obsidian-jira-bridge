import type { JiraInstance } from '../../types';

export type ModalMode = 'add' | 'edit';

export interface JiraInstanceModalOptions {
  mode: ModalMode;
  instance?: JiraInstance;
}

export interface FormElements {
  name: HTMLInputElement;
  baseUrl: HTMLInputElement;
  email: HTMLInputElement;
  apiToken: HTMLInputElement;
}

export interface ErrorElements {
  name: HTMLSpanElement;
  baseUrl: HTMLSpanElement;
  email: HTMLSpanElement;
  apiToken: HTMLSpanElement;
}
