import { App } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import type { CreateTicketModalOptions, CreateTicketResult } from './types';

export class CreateTicketModal extends BaseModal<CreateTicketResult> {
  private options: CreateTicketModalOptions;

  constructor(app: App, options: CreateTicketModalOptions) {
    super(app);
    this.options = options;
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'jira-bridge-create-ticket');
    contentEl.createEl('h2', { text: 'Create Jira Issue', cls: 'modal-title' });

    const instanceName = this.options.context.instance?.name || 'No instance';
    const projectKey = this.options.context.projectKey || 'No project';

    const infoEl = contentEl.createEl('div', { cls: 'modal-info' });
    infoEl.createEl('span', { text: `${instanceName} → ${projectKey}` });

    const form = contentEl.createEl('div', { cls: 'modal-form' });
    form.createEl('p', { text: 'Form fields coming in US-3.2...' });

    if (this.options.initialTitle) {
      form.createEl('p', { text: `Initial title: "${this.options.initialTitle}"` });
    }

    const buttonContainer = contentEl.createEl('div', { cls: 'modal-buttons' });

    buttonContainer.createEl('button', { text: 'Cancel', cls: 'modal-button' }).addEventListener('click', () => {
      this.cancel();
    });

    buttonContainer.createEl('button', { text: 'Create', cls: 'modal-button mod-cta' }).addEventListener('click', () => {
      this.cancel();
    });
  }
}
