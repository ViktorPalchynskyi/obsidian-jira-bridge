import { App, Modal } from 'obsidian';
import type { BulkStatusChangeResult } from '../../services/types';

export class BulkStatusChangeReportModal extends Modal {
  constructor(
    app: App,
    private result: BulkStatusChangeResult,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('bulk-status-change-report-modal');

    contentEl.createEl('h2', { text: 'Bulk Status Change Complete' });

    this.renderChangedSection(contentEl);
    this.renderResolvedSection(contentEl);
    this.renderSkippedSection(contentEl);
    this.renderFailedSection(contentEl);

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    const closeButton = buttonContainer.createEl('button', { text: 'Close', cls: 'mod-cta' });
    closeButton.addEventListener('click', () => this.close());
  }

  private renderChangedSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'report-section' });
    section.createEl('h3', {
      text: `✓ Changed: ${this.result.changed.length} tickets`,
      cls: 'section-header created',
    });

    if (this.result.changed.length > 0) {
      const list = section.createEl('ul', { cls: 'report-list' });
      for (const item of this.result.changed) {
        const li = list.createEl('li');
        li.createSpan({ text: item.issueKey, cls: 'file-name' });
        li.createSpan({ text: `: ${item.file.basename}` });
        li.createSpan({ text: ` (${item.oldStatus} → ${item.newStatus})`, cls: 'status-transition' });
      }
    }
  }

  private renderResolvedSection(container: HTMLElement): void {
    if (this.result.resolved.length === 0) return;

    const section = container.createDiv({ cls: 'report-section' });
    section.createEl('h3', {
      text: `⚙ Auto-resolved: ${this.result.resolved.length} notes`,
      cls: 'section-header resolved',
    });

    const list = section.createEl('ul', { cls: 'report-list' });
    for (const item of this.result.resolved) {
      const li = list.createEl('li');
      li.createSpan({ text: item.issueKey, cls: 'file-name' });
      li.createSpan({ text: `: ${item.file.basename}` });
      li.createSpan({ text: ' (found by summary and added to frontmatter)', cls: 'reason' });
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
      li.createSpan({ text: ` — ${item.error}`, cls: 'error' });
    }
  }
}
