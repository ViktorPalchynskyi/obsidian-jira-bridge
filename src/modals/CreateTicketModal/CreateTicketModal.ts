import { App, Notice } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import { JiraClient } from '../../api';
import type { JiraProject, JiraIssueType, JiraPriority, JiraFieldMeta } from '../../types';
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
  customFieldValues: Record<string, unknown>;
  customFieldsMeta: JiraFieldMeta[];
  isLoadingCustomFields: boolean;
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
  private customFieldsContainer: HTMLElement | null = null;

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
      customFieldValues: {},
      customFieldsMeta: [],
      isLoadingCustomFields: false,
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

    this.customFieldsContainer = form.createEl('div', { cls: 'custom-fields-container' });

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
      this.state.customFieldValues = {};
      this.updateSubmitButtonState();
      if (this.state.issueTypeId && this.hasCustomFields()) {
        this.loadCustomFieldsMeta();
      }
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
      const customFields = Object.keys(this.state.customFieldValues).length > 0 ? this.state.customFieldValues : undefined;

      const result = await this.client.createIssue(
        this.state.projectKey,
        this.state.issueTypeId,
        this.state.summary.trim(),
        this.state.description.trim() || undefined,
        this.state.priorityId || undefined,
        customFields,
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

  private hasCustomFields(): boolean {
    return !!(this.options.customFields && this.options.customFields.length > 0);
  }

  private async loadCustomFieldsMeta(): Promise<void> {
    if (!this.client || !this.customFieldsContainer || !this.state.projectKey || !this.state.issueTypeId) return;
    if (!this.hasCustomFields()) return;

    this.state.isLoadingCustomFields = true;
    this.customFieldsContainer.innerHTML = '';
    this.customFieldsContainer.createEl('p', { text: 'Loading custom fields...', cls: 'loading-text' });

    try {
      const allFields = await this.client.getFieldsForIssueType(this.state.projectKey, this.state.issueTypeId);
      const configuredFieldIds = this.options.customFields!.map(cf => cf.fieldId);
      this.state.customFieldsMeta = allFields.filter(f => configuredFieldIds.includes(f.fieldId));
      this.renderCustomFields();
    } catch {
      this.customFieldsContainer.innerHTML = '';
      this.customFieldsContainer.createEl('p', { text: 'Failed to load custom fields', cls: 'error-text' });
    } finally {
      this.state.isLoadingCustomFields = false;
    }
  }

  private async renderCustomFields(): Promise<void> {
    if (!this.customFieldsContainer) return;

    this.customFieldsContainer.innerHTML = '';

    if (this.state.customFieldsMeta.length === 0) {
      this.customFieldsContainer.createEl('p', {
        text: 'No custom fields available for this issue type.',
        cls: 'setting-item-description',
      });
      return;
    }

    for (const field of this.state.customFieldsMeta) {
      await this.createCustomField(this.customFieldsContainer, field);
    }
  }

  private async createCustomField(container: HTMLElement, field: JiraFieldMeta): Promise<void> {
    const fieldGroup = container.createEl('div', { cls: 'field-group' });
    const labelText = field.required ? `${field.name} *` : field.name;
    fieldGroup.createEl('label', { text: labelText });

    const schemaType = field.schema?.type || 'string';
    const systemField = field.schema?.system;

    if (field.allowedValues && field.allowedValues.length > 0) {
      this.createSelectField(fieldGroup, field);
    } else if (schemaType === 'user' || systemField === 'assignee') {
      await this.createUserField(fieldGroup, field);
    } else if (schemaType === 'issuelink' || systemField === 'parent') {
      await this.createParentField(fieldGroup, field, this.state.issueTypeId);
    } else if (schemaType === 'array' && field.schema?.items === 'string') {
      await this.createLabelsField(fieldGroup, field);
    } else if (schemaType === 'number') {
      this.createNumberField(fieldGroup, field);
    } else {
      this.createTextField(fieldGroup, field);
    }
  }

  private createSelectField(fieldGroup: HTMLElement, field: JiraFieldMeta): void {
    const select = fieldGroup.createEl('select', { cls: 'field-select' });
    select.createEl('option', { text: `Select ${field.name}...`, attr: { value: '' } });

    for (const option of field.allowedValues!) {
      select.createEl('option', {
        text: option.name || option.value || option.id,
        attr: { value: option.id },
      });
    }

    select.addEventListener('change', () => {
      if (select.value) {
        this.state.customFieldValues[field.fieldId] = { id: select.value };
      } else {
        delete this.state.customFieldValues[field.fieldId];
      }
    });
  }

  private async createUserField(fieldGroup: HTMLElement, field: JiraFieldMeta): Promise<void> {
    const select = fieldGroup.createEl('select', { cls: 'field-select' });
    select.createEl('option', { text: 'Loading users...', attr: { value: '', disabled: 'true' } });

    try {
      const users = await this.client!.getAssignableUsers(this.state.projectKey);
      select.innerHTML = '';
      select.createEl('option', { text: `Select ${field.name}...`, attr: { value: '' } });

      for (const user of users) {
        select.createEl('option', {
          text: user.displayName,
          attr: { value: user.accountId },
        });
      }
    } catch {
      select.innerHTML = '';
      select.createEl('option', { text: 'Failed to load users', attr: { value: '', disabled: 'true' } });
    }

    select.addEventListener('change', () => {
      if (select.value) {
        this.state.customFieldValues[field.fieldId] = { accountId: select.value };
      } else {
        delete this.state.customFieldValues[field.fieldId];
      }
    });
  }

  private async createParentField(fieldGroup: HTMLElement, field: JiraFieldMeta, currentIssueTypeId: string): Promise<void> {
    const select = fieldGroup.createEl('select', { cls: 'field-select' });
    select.createEl('option', { text: 'Loading issues...', attr: { value: '', disabled: 'true' } });

    const currentIssueType = this.state.issueTypes.find(t => t.id === currentIssueTypeId);
    const currentTypeName = currentIssueType?.name.toLowerCase() || '';

    const allowedParentTypes: string[] = [];
    if (currentTypeName === 'story' || currentTypeName === 'task' || currentTypeName === 'bug') {
      allowedParentTypes.push('epic');
    }
    if (currentTypeName === 'sub-task' || currentTypeName === 'subtask') {
      allowedParentTypes.push('epic', 'story', 'task', 'bug');
    }
    if (allowedParentTypes.length === 0) {
      allowedParentTypes.push('epic', 'story');
    }

    try {
      const allIssues = await this.client!.getParentableIssues(this.state.projectKey);
      const filteredIssues = allIssues.filter(issue => allowedParentTypes.includes(issue.issueType.toLowerCase()));

      select.innerHTML = '';
      select.createEl('option', { text: `Select ${field.name}...`, attr: { value: '' } });

      if (filteredIssues.length === 0) {
        select.createEl('option', { text: 'No parent issues found', attr: { value: '', disabled: 'true' } });
      } else {
        for (const issue of filteredIssues) {
          select.createEl('option', {
            text: `[${issue.issueType}] ${issue.key} - ${issue.summary}`,
            attr: { value: issue.key },
          });
        }
      }
    } catch {
      select.innerHTML = '';
      select.createEl('option', { text: 'Failed to load issues', attr: { value: '', disabled: 'true' } });
    }

    select.addEventListener('change', () => {
      if (select.value) {
        this.state.customFieldValues[field.fieldId] = { key: select.value };
      } else {
        delete this.state.customFieldValues[field.fieldId];
      }
    });
  }

  private async createLabelsField(fieldGroup: HTMLElement, field: JiraFieldMeta): Promise<void> {
    const selectedLabels: string[] = [];
    let allLabels: string[] = [];

    const chipsContainer = fieldGroup.createEl('div', { cls: 'chips-container' });
    chipsContainer.style.display = 'flex';
    chipsContainer.style.flexWrap = 'wrap';
    chipsContainer.style.gap = '4px';
    chipsContainer.style.marginBottom = '8px';
    chipsContainer.style.minHeight = '24px';

    const select = fieldGroup.createEl('select', { cls: 'field-select' });
    select.createEl('option', { text: 'Loading labels...', attr: { value: '', disabled: 'true' } });

    const updateSelect = () => {
      select.innerHTML = '';
      select.createEl('option', { text: 'Add label...', attr: { value: '' } });
      for (const label of allLabels) {
        if (!selectedLabels.includes(label)) {
          select.createEl('option', { text: label, attr: { value: label } });
        }
      }
    };

    const updateChips = () => {
      chipsContainer.innerHTML = '';
      for (const label of selectedLabels) {
        const chip = chipsContainer.createEl('span', { cls: 'label-chip' });
        chip.style.background = 'var(--interactive-accent)';
        chip.style.color = 'var(--text-on-accent)';
        chip.style.padding = '2px 8px';
        chip.style.borderRadius = '12px';
        chip.style.fontSize = '0.8rem';
        chip.style.display = 'inline-flex';
        chip.style.alignItems = 'center';
        chip.style.gap = '4px';

        chip.createEl('span', { text: label });
        const removeBtn = chip.createEl('span', { text: '×', cls: 'chip-remove' });
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.fontWeight = 'bold';
        removeBtn.addEventListener('click', () => {
          const idx = selectedLabels.indexOf(label);
          if (idx > -1) {
            selectedLabels.splice(idx, 1);
            updateChips();
            updateSelect();
            updateState();
          }
        });
      }
    };

    const updateState = () => {
      if (selectedLabels.length > 0) {
        this.state.customFieldValues[field.fieldId] = [...selectedLabels];
      } else {
        delete this.state.customFieldValues[field.fieldId];
      }
    };

    try {
      allLabels = await this.client!.getLabels();
      updateSelect();
    } catch {
      select.innerHTML = '';
      select.createEl('option', { text: 'Failed to load labels', attr: { value: '', disabled: 'true' } });
    }

    select.addEventListener('change', () => {
      if (select.value && !selectedLabels.includes(select.value)) {
        selectedLabels.push(select.value);
        updateChips();
        updateSelect();
        updateState();
      }
      select.value = '';
    });
  }

  private createNumberField(fieldGroup: HTMLElement, field: JiraFieldMeta): void {
    const input = fieldGroup.createEl('input', {
      type: 'number',
      cls: 'field-input',
      attr: { placeholder: `Enter ${field.name}...`, step: 'any' },
    });

    input.addEventListener('input', () => {
      if (input.value) {
        this.state.customFieldValues[field.fieldId] = parseFloat(input.value);
      } else {
        delete this.state.customFieldValues[field.fieldId];
      }
    });
  }

  private createTextField(fieldGroup: HTMLElement, field: JiraFieldMeta): void {
    const input = fieldGroup.createEl('input', {
      type: 'text',
      cls: 'field-input',
      attr: { placeholder: `Enter ${field.name}...` },
    });

    input.addEventListener('input', () => {
      if (input.value.trim()) {
        this.state.customFieldValues[field.fieldId] = input.value.trim();
      } else {
        delete this.state.customFieldValues[field.fieldId];
      }
    });
  }
}
