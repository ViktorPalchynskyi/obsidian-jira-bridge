import { App, Modal } from 'obsidian';
import type { BulkCreateResult } from '../../services/types';

export class BulkCreateReportModal extends Modal {
  constructor(
    app: App,
    private result: BulkCreateResult,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('bulk-create-report-modal');

    contentEl.createEl('h2', { text: 'Bulk Create Complete' });

    this.renderCreatedSection(contentEl);
    this.renderSkippedSection(contentEl);
    this.renderFailedSection(contentEl);

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    const closeButton = buttonContainer.createEl('button', { text: 'Close', cls: 'mod-cta' });
    closeButton.addEventListener('click', () => this.close());
  }

  private renderCreatedSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'report-section' });
    section.createEl('h3', {
      text: `✓ Created: ${this.result.created.length} tickets`,
      cls: 'section-header created',
    });

    if (this.result.created.length > 0) {
      const list = section.createEl('ul', { cls: 'report-list' });
      for (const item of this.result.created) {
        const li = list.createEl('li');
        const link = li.createEl('a', {
          text: item.issueKey,
          href: item.issueUrl,
          cls: 'jira-issue-link',
        });
        link.addEventListener('click', e => {
          e.preventDefault();
          open(item.issueUrl);
        });
        li.createSpan({ text: `: ${item.file.basename}` });
      }
    }
  }

  private renderSkippedSection(container: HTMLElement): void {
    if (this.result.skipped.length === 0) return;

    const section = container.createDiv({ cls: 'report-section' });
    section.createEl('h3', {
      text: `⊘ Skipped: ${this.result.skipped.length} notes`,
      cls: 'section-header skipped',
    });

    const list = section.createEl('ul', { cls: 'report-list' });
    for (const item of this.result.skipped) {
      const li = list.createEl('li');
      li.createSpan({ text: item.file.basename, cls: 'file-name' });
      li.createSpan({ text: ` — ${item.reason}`, cls: 'reason' });

      if (item.existingIssueKey) {
        const link = li.createEl('a', {
          text: ` (${item.existingIssueKey})`,
          cls: 'jira-issue-link',
        });
        link.addEventListener('click', e => {
          e.preventDefault();
        });
      }
    }
  }

  private renderFailedSection(container: HTMLElement): void {
    if (this.result.failed.length === 0) return;

    const section = container.createDiv({ cls: 'report-section' });
    section.createEl('h3', {
      text: `✗ Failed: ${this.result.failed.length} notes`,
      cls: 'section-header failed',
    });

    const list = section.createEl('ul', { cls: 'report-list' });
    for (const item of this.result.failed) {
      const li = list.createEl('li');
      li.createSpan({ text: item.file.basename, cls: 'file-name' });
      li.createSpan({ text: ` — ${item.error}`, cls: 'error-message' });
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
