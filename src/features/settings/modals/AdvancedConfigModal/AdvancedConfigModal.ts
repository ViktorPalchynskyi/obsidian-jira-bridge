import { App } from 'obsidian';
import { BaseModal } from '../../../../modals/base/BaseModal';
import { FrontmatterMappingModal } from '../FrontmatterMappingModal/FrontmatterMappingModal';
import { CustomFieldsModal } from '../CustomFieldsModal/CustomFieldsModal';
import { SyncSettingsModal } from '../../../sync/modals/SyncSettingsModal/SyncSettingsModal';
import type { AdvancedConfigModalOptions } from './types';

export class AdvancedConfigModal extends BaseModal<null> {
  private options: AdvancedConfigModalOptions;

  constructor(app: App, options: AdvancedConfigModalOptions) {
    super(app);
    this.options = options;
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'jira-bridge-advanced-config-modal');

    contentEl.createEl('h2', { text: 'Advanced Configuration', cls: 'modal-title' });
    contentEl.createEl('p', {
      text: `Project: ${this.options.mapping.projectKey} (${this.options.instance.name})`,
      cls: 'modal-subtitle',
    });

    this.renderSection(contentEl, '📋 Frontmatter Mapping', 'Configure how frontmatter fields are mapped to Jira fields', () =>
      this.openMappingModal(),
    );

    this.renderSection(contentEl, '🏷️  Custom Fields', 'Add and manage custom Jira fields for this project', () => this.openFieldsModal());

    this.renderSection(contentEl, '🔄 Sync Settings', 'Configure automatic synchronization from Jira', () => this.openSyncModal());

    this.renderButtons(contentEl);
  }

  private renderSection(container: HTMLElement, title: string, description: string, onClick: () => void): void {
    const section = container.createEl('div', { cls: 'advanced-config-section' });

    const header = section.createEl('div', { cls: 'section-header' });
    header.createEl('h3', { text: title, cls: 'section-title' });
    header.createEl('p', { text: description, cls: 'section-description' });

    const configureBtn = section.createEl('button', { text: 'Configure', cls: 'section-button' });
    configureBtn.addEventListener('click', onClick);
  }

  private renderButtons(container: HTMLElement): void {
    const buttonContainer = container.createEl('div', { cls: 'modal-buttons' });

    buttonContainer.createEl('button', { text: 'Close', cls: 'modal-button mod-cta' }).addEventListener('click', () => {
      this.cancel();
    });
  }

  private async openMappingModal(): Promise<void> {
    const modal = new FrontmatterMappingModal(this.app, {
      mapping: this.options.mapping,
      instance: this.options.instance,
      customFields: this.options.customFields,
    });

    const result = await modal.open();

    if (result) {
      await this.options.onUpdate(result.projectConfig);
      this.options.mapping.projectConfig = result.projectConfig;
    }
  }

  private async openFieldsModal(): Promise<void> {
    if (!this.options.mapping.projectKey) return;

    const modal = new CustomFieldsModal(this.app, {
      instance: this.options.instance,
      projectKey: this.options.mapping.projectKey,
      customFields: this.options.customFields,
    });

    const result = await modal.open();

    if (result) {
      await this.options.onUpdateCustomFields(result.customFields);
      this.options.customFields = result.customFields;
    }
  }

  private async openSyncModal(): Promise<void> {
    const modal = new SyncSettingsModal(this.app, {
      mapping: this.options.mapping,
      instance: this.options.instance,
      globalSyncFields: this.options.globalSyncFields,
    });

    const result = await modal.open();

    if (result) {
      const currentConfig = this.options.mapping.projectConfig || {
        frontmatterMappings: [],
        contentParsing: { summaryPattern: '', summaryFlags: '', descriptionPattern: '', descriptionFlags: '' },
      };

      const updatedConfig = {
        ...currentConfig,
        syncConfig: result.syncConfig,
      };

      await this.options.onUpdate(updatedConfig);
      this.options.mapping.projectConfig = updatedConfig;
    }
  }
}
