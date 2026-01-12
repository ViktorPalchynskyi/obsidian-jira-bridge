import { App } from 'obsidian';
import { BaseModal } from '../../../../ui/modals/BaseModal/BaseModal';
import type { SyncSettingsModalOptions, SyncSettingsModalResult } from './types';
import type { SyncFieldConfig } from '../../../../types';

interface ModalState {
  enableSync: boolean;
  isCustom: boolean;
  customSyncFields: SyncFieldConfig[];
}

export class SyncSettingsModal extends BaseModal<SyncSettingsModalResult> {
  private options: SyncSettingsModalOptions;
  private state: ModalState;
  private fieldsContainer: HTMLElement | null = null;
  private modeButtonContainer: HTMLElement | null = null;

  constructor(app: App, options: SyncSettingsModalOptions) {
    super(app);
    this.options = options;

    const projectSyncConfig = options.mapping.projectConfig?.syncConfig;
    const hasCustomFields = projectSyncConfig?.syncFields !== undefined;

    this.state = {
      enableSync: projectSyncConfig?.enableSync ?? true,
      isCustom: hasCustomFields,
      customSyncFields: hasCustomFields
        ? JSON.parse(JSON.stringify(projectSyncConfig.syncFields))
        : JSON.parse(JSON.stringify(options.globalSyncFields)),
    };
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'jira-bridge-sync-settings-modal');

    contentEl.createEl('h2', { text: 'Sync Settings', cls: 'modal-title' });
    contentEl.createEl('p', {
      text: `Project: ${this.options.mapping.projectKey} (${this.options.instance.name})`,
      cls: 'modal-subtitle',
    });

    this.renderEnableSyncToggle(contentEl);
    this.renderSyncFieldsSection(contentEl);
    this.renderButtons(contentEl);
  }

  private renderEnableSyncToggle(container: HTMLElement): void {
    const section = container.createEl('div', { cls: 'sync-toggle-section' });

    const toggleContainer = section.createEl('div', { cls: 'sync-toggle-container' });

    const checkbox = toggleContainer.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.state.enableSync;
    checkbox.addEventListener('change', () => {
      this.state.enableSync = checkbox.checked;
      this.updateFieldsDisplay();
    });

    toggleContainer.createEl('label', { text: 'Enable sync for this project' });
  }

  private renderSyncFieldsSection(container: HTMLElement): void {
    const section = container.createEl('div', { cls: 'sync-fields-section' });

    section.createEl('h3', { text: 'Sync Fields' });

    const statusEl = section.createEl('p', { cls: 'sync-status' });
    this.updateStatusText(statusEl);

    this.fieldsContainer = section.createEl('div', { cls: 'sync-fields-list' });
    this.modeButtonContainer = section.createEl('div', { cls: 'mode-button-container' });

    this.updateFieldsDisplay();
  }

  private updateStatusText(statusEl: HTMLElement): void {
    if (this.state.isCustom) {
      statusEl.setText('Using custom sync fields for this project');
      statusEl.addClass('custom-status');
    } else {
      statusEl.setText('Currently inheriting from global settings');
      statusEl.addClass('inheriting-status');
    }
  }

  private updateFieldsDisplay(): void {
    if (!this.fieldsContainer || !this.modeButtonContainer) return;

    this.fieldsContainer.empty();
    this.modeButtonContainer.empty();

    const statusEl = this.contentEl.querySelector('.sync-status');
    if (statusEl) {
      this.updateStatusText(statusEl as HTMLElement);
    }

    if (!this.state.enableSync) {
      this.fieldsContainer.createEl('p', {
        text: 'Sync is disabled for this project',
        cls: 'disabled-text',
      });
      return;
    }

    const fieldsToDisplay = this.state.isCustom ? this.state.customSyncFields : this.options.globalSyncFields;

    for (const field of fieldsToDisplay) {
      const item = this.fieldsContainer.createEl('div', { cls: 'sync-field-item' });

      const checkbox = item.createEl('input', { type: 'checkbox' });
      checkbox.checked = field.enabled;
      checkbox.disabled = !this.state.isCustom;

      if (this.state.isCustom) {
        checkbox.addEventListener('change', () => {
          field.enabled = checkbox.checked;
        });
      }

      const label = item.createEl('label');
      label.createSpan({ text: field.jiraField, cls: 'field-jira' });
      label.createSpan({ text: ' → ', cls: 'field-arrow' });
      label.createSpan({ text: field.frontmatterKey, cls: 'field-frontmatter' });
    }

    if (this.state.isCustom) {
      const resetBtn = this.modeButtonContainer.createEl('button', {
        text: 'Reset to global settings',
        cls: 'mode-button',
      });
      resetBtn.addEventListener('click', () => {
        this.state.isCustom = false;
        this.state.customSyncFields = JSON.parse(JSON.stringify(this.options.globalSyncFields));
        this.updateFieldsDisplay();
      });
    } else {
      const customizeBtn = this.modeButtonContainer.createEl('button', {
        text: 'Customize for this project',
        cls: 'mode-button mod-cta',
      });
      customizeBtn.addEventListener('click', () => {
        this.state.isCustom = true;
        this.state.customSyncFields = JSON.parse(JSON.stringify(this.options.globalSyncFields));
        this.updateFieldsDisplay();
      });
    }
  }

  private renderButtons(container: HTMLElement): void {
    const buttonContainer = container.createEl('div', { cls: 'modal-buttons' });

    buttonContainer.createEl('button', { text: 'Cancel', cls: 'modal-button' }).addEventListener('click', () => {
      this.cancel();
    });

    buttonContainer.createEl('button', { text: 'Save', cls: 'modal-button mod-cta' }).addEventListener('click', () => {
      this.handleSubmit();
    });
  }

  private handleSubmit(): void {
    const syncConfig = {
      enableSync: this.state.enableSync,
      syncFields: this.state.isCustom ? this.state.customSyncFields : undefined,
    };

    this.submit({ syncConfig });
  }
}
