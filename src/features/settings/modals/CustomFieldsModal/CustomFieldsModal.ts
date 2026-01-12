import { App } from 'obsidian';
import { BaseModal } from '../../../../ui/modals/BaseModal/BaseModal';
import { JiraClient } from '../../../../api';
import type { JiraIssueType, JiraFieldMeta, CustomFieldConfig } from '../../../../types';
import type { CustomFieldsModalOptions, CustomFieldsModalResult } from './types';

export class CustomFieldsModal extends BaseModal<CustomFieldsModalResult> {
  private options: CustomFieldsModalOptions;
  private client: JiraClient;
  private issueTypes: JiraIssueType[] = [];
  private availableFields: JiraFieldMeta[] = [];
  private selectedIssueTypeId = '';
  private localCustomFields: CustomFieldConfig[];
  private toastContainer: HTMLElement | null = null;
  private fieldsContainer: HTMLElement | null = null;
  private configuredContainer: HTMLElement | null = null;

  constructor(app: App, options: CustomFieldsModalOptions) {
    super(app);
    this.options = options;
    this.client = new JiraClient(options.instance);
    this.localCustomFields = [...options.customFields];
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'jira-bridge-custom-fields-modal');

    contentEl.createEl('h2', { text: 'Configure Custom Fields', cls: 'modal-title' });
    contentEl.createEl('p', {
      text: `Project: ${this.options.projectKey} (${this.options.instance.name})`,
      cls: 'modal-subtitle',
    });

    this.toastContainer = contentEl.createEl('div', { cls: 'modal-toast-container' });

    const configSection = contentEl.createEl('div', { cls: 'config-section' });

    const issueTypeGroup = configSection.createEl('div', { cls: 'field-group' });
    issueTypeGroup.createEl('label', { text: 'Issue Type' });

    const issueTypeSelect = issueTypeGroup.createEl('select', { cls: 'field-select' });
    issueTypeSelect.createEl('option', { text: 'Loading...', attr: { value: '', disabled: 'true' } });

    const loadButton = configSection.createEl('button', { text: 'Load Fields', cls: 'mod-cta' });
    loadButton.disabled = true;

    issueTypeSelect.addEventListener('change', () => {
      this.selectedIssueTypeId = issueTypeSelect.value;
      loadButton.disabled = !this.selectedIssueTypeId;
    });

    loadButton.addEventListener('click', async () => {
      loadButton.disabled = true;
      loadButton.textContent = 'Loading...';
      await this.loadFields();
      loadButton.disabled = false;
      loadButton.textContent = 'Load Fields';
    });

    this.fieldsContainer = contentEl.createEl('div', { cls: 'available-fields-section' });
    this.configuredContainer = contentEl.createEl('div', { cls: 'configured-fields-section' });

    this.renderConfiguredFields();

    const buttonContainer = contentEl.createEl('div', { cls: 'modal-buttons' });

    buttonContainer.createEl('button', { text: 'Cancel', cls: 'modal-button' }).addEventListener('click', () => {
      this.cancel();
    });

    buttonContainer.createEl('button', { text: 'Save', cls: 'modal-button mod-cta' }).addEventListener('click', () => {
      this.submit({ customFields: this.localCustomFields });
    });

    this.loadIssueTypes(issueTypeSelect);
  }

  private async loadIssueTypes(select: HTMLSelectElement): Promise<void> {
    try {
      this.issueTypes = await this.client.getIssueTypes(this.options.projectKey);
      select.innerHTML = '';
      select.createEl('option', { text: 'Select issue type...', attr: { value: '' } });

      for (const type of this.issueTypes.filter(t => !t.subtask)) {
        select.createEl('option', { text: type.name, attr: { value: type.id } });
      }
    } catch {
      select.innerHTML = '';
      select.createEl('option', { text: 'Failed to load', attr: { value: '', disabled: 'true' } });
      this.showToast('Failed to load issue types', 'error');
    }
  }

  private async loadFields(): Promise<void> {
    if (!this.fieldsContainer || !this.selectedIssueTypeId) return;

    this.fieldsContainer.innerHTML = '';
    this.fieldsContainer.createEl('p', { text: 'Loading fields...', cls: 'loading-text' });

    try {
      this.availableFields = await this.client.getFieldsForIssueType(this.options.projectKey, this.selectedIssueTypeId);
      this.renderAvailableFields();
      this.showToast(`Loaded ${this.availableFields.length} fields`, 'success');
    } catch {
      this.fieldsContainer.innerHTML = '';
      this.fieldsContainer.createEl('p', { text: 'Failed to load fields', cls: 'error-text' });
      this.showToast('Failed to load fields', 'error');
    }
  }

  private renderAvailableFields(): void {
    if (!this.fieldsContainer) return;

    this.fieldsContainer.innerHTML = '';

    if (this.availableFields.length === 0) {
      this.fieldsContainer.createEl('p', { text: 'No custom fields available.', cls: 'empty-text' });
      return;
    }

    this.fieldsContainer.createEl('h4', { text: 'Available Fields' });

    for (const field of this.availableFields) {
      const isAdded = this.localCustomFields.some(cf => cf.fieldId === field.fieldId && cf.instanceId === this.options.instance.id);

      const item = this.fieldsContainer.createEl('div', { cls: 'field-item' });

      const info = item.createEl('div', { cls: 'field-info' });
      info.createEl('span', { text: field.name, cls: 'field-name' });
      info.createEl('span', { text: field.fieldId, cls: 'field-id' });
      if (field.required) {
        info.createEl('span', { text: 'Required', cls: 'field-badge' });
      }

      const addBtn = item.createEl('button', {
        text: isAdded ? 'Added' : 'Add',
        cls: isAdded ? 'field-btn mod-muted' : 'field-btn',
      });
      addBtn.disabled = isAdded;

      addBtn.addEventListener('click', () => {
        this.addField(field);
        addBtn.textContent = 'Added';
        addBtn.disabled = true;
        addBtn.addClass('mod-muted');
      });
    }
  }

  private addField(field: JiraFieldMeta): void {
    const newField: CustomFieldConfig = {
      fieldId: field.fieldId,
      fieldName: field.name,
      enabled: true,
      instanceId: this.options.instance.id,
      projectKey: this.options.projectKey,
    };

    this.localCustomFields.push(newField);
    this.renderConfiguredFields();
    this.showToast(`Added "${field.name}"`, 'success');
  }

  private renderConfiguredFields(): void {
    if (!this.configuredContainer) return;

    const relevantFields = this.localCustomFields.filter(
      cf => cf.instanceId === this.options.instance.id && cf.projectKey === this.options.projectKey,
    );

    this.configuredContainer.innerHTML = '';

    if (relevantFields.length === 0) {
      return;
    }

    this.configuredContainer.createEl('h4', { text: 'Configured Fields' });

    for (const field of relevantFields) {
      const item = this.configuredContainer.createEl('div', { cls: 'field-item' });

      const info = item.createEl('div', { cls: 'field-info' });
      info.createEl('span', { text: field.fieldName, cls: 'field-name' });
      info.createEl('span', { text: field.fieldId, cls: 'field-id' });

      const actions = item.createEl('div', { cls: 'field-actions' });

      const toggle = actions.createEl('input', { type: 'checkbox' });
      toggle.checked = field.enabled;
      toggle.addEventListener('change', () => {
        field.enabled = toggle.checked;
      });

      const removeBtn = actions.createEl('button', { text: 'Remove', cls: 'field-btn mod-warning' });
      removeBtn.addEventListener('click', () => {
        this.localCustomFields = this.localCustomFields.filter(
          f => !(f.fieldId === field.fieldId && f.instanceId === field.instanceId && f.projectKey === field.projectKey),
        );
        this.renderConfiguredFields();
        this.renderAvailableFields();
        this.showToast(`Removed "${field.fieldName}"`, 'success');
      });
    }
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    if (!this.toastContainer) return;

    const toast = this.toastContainer.createEl('div', {
      cls: `modal-toast ${type}`,
      text: message,
    });

    setTimeout(() => {
      toast.addClass('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}
