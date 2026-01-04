import { App, Notice } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import { JiraClient } from '../../api';
import type { JiraProject, JiraIssueType, JiraPriority } from '../../types';
import type { CreateTicketModalOptions, CreateTicketResult } from './types';

interface FormState {
  summary: string;
  description: string;
  projectKey: string;
  issueTypeId: string;
  priorityId: string;
  projects: JiraProject[];
  issueTypes: JiraIssueType[];
  priorities: JiraPriority[];
  isLoadingProjects: boolean;
  isLoadingIssueTypes: boolean;
  isLoadingPriorities: boolean;
  isSubmitting: boolean;
  error: string | null;
}

export class CreateTicketModal extends BaseModal<CreateTicketResult> {
  private options: CreateTicketModalOptions;
  private state: FormState;
  private summaryInput: HTMLInputElement | null = null;
  private projectSelect: HTMLSelectElement | null = null;
  private issueTypeSelect: HTMLSelectElement | null = null;
  private prioritySelect: HTMLSelectElement | null = null;
  private descriptionInput: HTMLTextAreaElement | null = null;
  private submitButton: HTMLButtonElement | null = null;
  private client: JiraClient | null = null;

  constructor(app: App, options: CreateTicketModalOptions) {
    super(app);
    this.options = options;
    this.state = {
      summary: options.initialSummary || '',
      description: options.initialDescription || '',
      projectKey: options.context.projectKey || '',
      issueTypeId: '',
      priorityId: '',
      projects: [],
      issueTypes: [],
      priorities: [],
      isLoadingProjects: false,
      isLoadingIssueTypes: false,
      isLoadingPriorities: false,
      isSubmitting: false,
      error: null,
    };

    if (options.context.instance) {
      this.client = new JiraClient(options.context.instance);
    }
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'jira-bridge-create-ticket');

    contentEl.createEl('h2', { text: 'Create Jira Issue', cls: 'modal-title' });

    if (!this.options.context.instance) {
      this.renderNoInstanceError(contentEl);
      return;
    }

    const form = contentEl.createEl('div', { cls: 'modal-form' });

    this.createSummaryField(form);
    this.createProjectField(form);
    this.createIssueTypeField(form);
    this.createPriorityField(form);
    this.createDescriptionField(form);

    const buttonContainer = contentEl.createEl('div', { cls: 'modal-buttons' });

    buttonContainer.createEl('button', { text: 'Cancel', cls: 'modal-button' }).addEventListener('click', () => {
      this.cancel();
    });

    this.submitButton = buttonContainer.createEl('button', {
      text: 'Create',
      cls: 'modal-button mod-cta',
    });
    this.submitButton.addEventListener('click', () => this.handleSubmit());

    this.loadInitialData();
    this.setupKeyboardShortcuts();
  }

  private renderNoInstanceError(container: HTMLElement): void {
    const errorEl = container.createEl('div', { cls: 'modal-error' });
    errorEl.createEl('p', { text: 'No Jira instance found for this folder.' });
    errorEl.createEl('p', { text: 'Please configure a folder mapping in settings.' });

    const buttonContainer = container.createEl('div', { cls: 'modal-buttons' });
    buttonContainer.createEl('button', { text: 'Close', cls: 'modal-button' }).addEventListener('click', () => {
      this.cancel();
    });
  }

  private createSummaryField(container: HTMLElement): void {
    const fieldGroup = container.createEl('div', { cls: 'field-group' });
    fieldGroup.createEl('label', { text: 'Summary *' });

    this.summaryInput = fieldGroup.createEl('input', {
      type: 'text',
      cls: 'field-input',
      attr: { placeholder: 'Issue summary...', tabindex: '1' },
    });
    this.summaryInput.value = this.state.summary;
    this.summaryInput.addEventListener('input', () => {
      this.state.summary = this.summaryInput!.value;
      this.updateSubmitButtonState();
    });
  }

  private createProjectField(container: HTMLElement): void {
    const fieldGroup = container.createEl('div', { cls: 'field-group' });
    fieldGroup.createEl('label', { text: 'Project *' });

    this.projectSelect = fieldGroup.createEl('select', {
      cls: 'field-select',
      attr: { tabindex: '2' },
    });

    this.projectSelect.createEl('option', {
      text: 'Loading projects...',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });

    this.projectSelect.addEventListener('change', () => {
      this.state.projectKey = this.projectSelect!.value;
      this.loadIssueTypes();
      this.updateSubmitButtonState();
    });
  }

  private createIssueTypeField(container: HTMLElement): void {
    const fieldGroup = container.createEl('div', { cls: 'field-group' });
    fieldGroup.createEl('label', { text: 'Issue Type *' });

    this.issueTypeSelect = fieldGroup.createEl('select', {
      cls: 'field-select',
      attr: { tabindex: '3' },
    });

    this.issueTypeSelect.createEl('option', {
      text: 'Select project first...',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });

    this.issueTypeSelect.addEventListener('change', () => {
      this.state.issueTypeId = this.issueTypeSelect!.value;
      this.updateSubmitButtonState();
    });
  }

  private createPriorityField(container: HTMLElement): void {
    const fieldGroup = container.createEl('div', { cls: 'field-group' });
    fieldGroup.createEl('label', { text: 'Priority' });

    this.prioritySelect = fieldGroup.createEl('select', {
      cls: 'field-select',
      attr: { tabindex: '4' },
    });

    this.prioritySelect.createEl('option', {
      text: 'Loading priorities...',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });

    this.prioritySelect.addEventListener('change', () => {
      this.state.priorityId = this.prioritySelect!.value;
    });
  }

  private createDescriptionField(container: HTMLElement): void {
    const fieldGroup = container.createEl('div', { cls: 'field-group' });
    fieldGroup.createEl('label', { text: 'Description' });

    this.descriptionInput = fieldGroup.createEl('textarea', {
      cls: 'field-textarea',
      attr: { placeholder: 'Issue description...', rows: '4', tabindex: '5' },
    });
    this.descriptionInput.value = this.state.description;

    this.descriptionInput.addEventListener('input', () => {
      this.state.description = this.descriptionInput!.value;
    });
  }

  private async loadInitialData(): Promise<void> {
    await Promise.all([this.loadProjects(), this.loadPriorities()]);
  }

  private async loadProjects(): Promise<void> {
    if (!this.client || !this.projectSelect) return;

    this.state.isLoadingProjects = true;

    try {
      const projects = await this.client.getProjects();
      this.state.projects = projects;
      this.updateProjectSelect(projects);

      if (this.state.projectKey) {
        this.loadIssueTypes();
      }
    } catch {
      this.showError('Failed to load projects');
    } finally {
      this.state.isLoadingProjects = false;
    }
  }

  private updateProjectSelect(projects: JiraProject[]): void {
    if (!this.projectSelect) return;

    this.projectSelect.innerHTML = '';

    if (projects.length === 0) {
      this.projectSelect.createEl('option', {
        text: 'No projects found',
        attr: { value: '', disabled: 'true', selected: 'true' },
      });
      return;
    }

    const defaultOption = this.projectSelect.createEl('option', {
      text: 'Select a project...',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });

    for (const project of projects) {
      const option = this.projectSelect.createEl('option', {
        text: `${project.key} - ${project.name}`,
        attr: { value: project.key },
      });
      if (this.state.projectKey === project.key) {
        option.selected = true;
        defaultOption.selected = false;
      }
    }

    this.updateSubmitButtonState();
  }

  private async loadIssueTypes(): Promise<void> {
    if (!this.client || !this.issueTypeSelect || !this.state.projectKey) return;

    this.state.isLoadingIssueTypes = true;
    this.issueTypeSelect.innerHTML = '';
    this.issueTypeSelect.createEl('option', {
      text: 'Loading issue types...',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });

    try {
      const issueTypes = await this.client.getIssueTypes(this.state.projectKey);
      this.state.issueTypes = issueTypes.filter(t => !t.subtask);
      this.updateIssueTypeSelect();
    } catch {
      this.issueTypeSelect.innerHTML = '';
      this.issueTypeSelect.createEl('option', {
        text: 'Failed to load issue types',
        attr: { value: '', disabled: 'true', selected: 'true' },
      });
    } finally {
      this.state.isLoadingIssueTypes = false;
    }
  }

  private updateIssueTypeSelect(): void {
    if (!this.issueTypeSelect) return;

    this.issueTypeSelect.innerHTML = '';

    if (this.state.issueTypes.length === 0) {
      this.issueTypeSelect.createEl('option', {
        text: 'No issue types found',
        attr: { value: '', disabled: 'true', selected: 'true' },
      });
      return;
    }

    this.issueTypeSelect.createEl('option', {
      text: 'Select issue type...',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });

    for (const type of this.state.issueTypes) {
      this.issueTypeSelect.createEl('option', {
        text: type.name,
        attr: { value: type.id },
      });
    }

    this.updateSubmitButtonState();
  }

  private async loadPriorities(): Promise<void> {
    if (!this.client || !this.prioritySelect) return;

    this.state.isLoadingPriorities = true;

    try {
      const priorities = await this.client.getPriorities();
      this.state.priorities = priorities;
      this.updatePrioritySelect(priorities);
    } catch {
      this.prioritySelect.innerHTML = '';
      this.prioritySelect.createEl('option', {
        text: 'Default priority',
        attr: { value: '' },
      });
    } finally {
      this.state.isLoadingPriorities = false;
    }
  }

  private updatePrioritySelect(priorities: JiraPriority[]): void {
    if (!this.prioritySelect) return;

    this.prioritySelect.innerHTML = '';

    this.prioritySelect.createEl('option', {
      text: 'Default priority',
      attr: { value: '' },
    });

    for (const priority of priorities) {
      this.prioritySelect.createEl('option', {
        text: priority.name,
        attr: { value: priority.id },
      });
    }
  }

  private updateSubmitButtonState(): void {
    if (!this.submitButton) return;

    const isValid = this.state.summary.trim().length > 0 && this.state.projectKey.length > 0 && this.state.issueTypeId.length > 0;

    this.submitButton.disabled = !isValid || this.state.isSubmitting;
  }

  private setupKeyboardShortcuts(): void {
    this.contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        this.handleSubmit();
      }
    });
  }

  private async handleSubmit(): Promise<void> {
    if (!this.client || this.state.isSubmitting) return;

    const isValid = this.state.summary.trim().length > 0 && this.state.projectKey.length > 0 && this.state.issueTypeId.length > 0;

    if (!isValid) return;

    this.state.isSubmitting = true;
    this.updateSubmitButton('Creating...', true);

    try {
      const result = await this.client.createIssue(
        this.state.projectKey,
        this.state.issueTypeId,
        this.state.summary.trim(),
        this.state.description.trim() || undefined,
        this.state.priorityId || undefined,
      );

      const issueUrl = this.client.getIssueUrl(result.key);

      new Notice(`Created ${result.key}`, 5000);

      this.submit({
        issueKey: result.key,
        issueUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create issue';
      this.showError(message);
      this.state.isSubmitting = false;
      this.updateSubmitButton('Create', false);
    }
  }

  private updateSubmitButton(text: string, disabled: boolean): void {
    if (!this.submitButton) return;
    this.submitButton.textContent = text;
    this.submitButton.disabled = disabled;
  }

  private showError(message: string): void {
    new Notice(`Error: ${message}`, 5000);
  }
}
