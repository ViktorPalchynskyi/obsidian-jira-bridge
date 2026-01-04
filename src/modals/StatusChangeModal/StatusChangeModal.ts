import { App } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import type { StatusChangeResult } from './types';

export class StatusChangeModal extends BaseModal<StatusChangeResult> {
  constructor(
    app: App,
    private readonly ticketKey: string,
    private readonly currentStatus: string,
  ) {
    super(app);
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal');
    contentEl.addClass('jira-bridge-status-change');
    contentEl.createEl('h2', { text: `Change Status: ${this.ticketKey}` });
    contentEl.createEl('p', {
      text: `Current status: ${this.currentStatus}`,
      cls: 'current-status',
    });
  }
}
