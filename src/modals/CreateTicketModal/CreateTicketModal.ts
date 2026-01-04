import { App } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import type { CreateTicketResult } from './types';

export class CreateTicketModal extends BaseModal<CreateTicketResult> {
  constructor(app: App) {
    super(app);
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal');
    contentEl.addClass('jira-bridge-create-ticket');
    contentEl.createEl('h2', { text: 'Create Jira Ticket' });
  }
}
