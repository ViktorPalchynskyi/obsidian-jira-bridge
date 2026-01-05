import { App, Modal } from 'obsidian';
import type { BulkStatusChangeProgress } from '../../services/bulkStatusChange';

export class BulkStatusChangeProgressModal extends Modal {
  private progressBar: HTMLDivElement | null = null;
  private progressText: HTMLDivElement | null = null;
  private statusText: HTMLDivElement | null = null;
  private statsContainer: HTMLDivElement | null = null;
  private cancelButton: HTMLButtonElement | null = null;
  private onCancel: (() => void) | null = null;

  constructor(app: App) {
    super(app);
  }

  setOnCancel(callback: () => void): void {
    this.onCancel = callback;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('bulk-status-change-progress-modal');

    contentEl.createEl('h2', { text: 'Changing Status for Jira Tickets' });

    this.progressText = contentEl.createDiv({ cls: 'progress-text' });
    this.progressText.setText('Processing: 0 / 0 notes');

    const progressContainer = contentEl.createDiv({ cls: 'progress-container' });
    this.progressBar = progressContainer.createDiv({ cls: 'progress-bar' });
    this.progressBar.style.width = '0%';

    this.statusText = contentEl.createDiv({ cls: 'status-text' });
    this.statusText.setText('Initializing...');

    this.statsContainer = contentEl.createDiv({ cls: 'stats-container' });
    this.updateStats({ changed: 0, resolved: 0, skipped: 0, failed: 0 });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    this.cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    this.cancelButton.addEventListener('click', () => {
      if (this.onCancel) this.onCancel();
    });
  }

  updateProgress(progress: BulkStatusChangeProgress): void {
    if (this.progressText) {
      this.progressText.setText(`Processing: ${progress.processed} / ${progress.total} notes`);
    }

    if (this.progressBar && progress.total > 0) {
      const percent = Math.round((progress.processed / progress.total) * 100);
      this.progressBar.style.width = `${percent}%`;
    }

    if (this.statusText) {
      this.statusText.setText(progress.status);
    }

    this.updateStats({
      changed: progress.changed,
      resolved: progress.resolved,
      skipped: progress.skipped,
      failed: progress.failed,
    });
  }

  disableCancel(): void {
    if (this.cancelButton) {
      this.cancelButton.disabled = true;
      this.cancelButton.setText('Cancelling...');
    }
  }

  private updateStats(stats: { changed: number; resolved: number; skipped: number; failed: number }): void {
    if (!this.statsContainer) return;

    this.statsContainer.empty();
    this.statsContainer.createDiv({
      cls: 'stat-item',
      text: `Changed: ${stats.changed}`,
    });
    this.statsContainer.createDiv({
      cls: 'stat-item',
      text: `Resolved: ${stats.resolved}`,
    });
    this.statsContainer.createDiv({
      cls: 'stat-item',
      text: `Skipped: ${stats.skipped}`,
    });
    this.statsContainer.createDiv({
      cls: 'stat-item stat-failed',
      text: `Failed: ${stats.failed}`,
    });
  }
}
