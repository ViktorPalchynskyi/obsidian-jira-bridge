import { App, Modal } from 'obsidian';
import type { BulkCreateProgress } from '../../services/bulkCreate';

export class BulkCreateProgressModal extends Modal {
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
    contentEl.addClass('bulk-create-progress-modal');

    contentEl.createEl('h2', { text: 'Creating Jira Tickets' });

    this.progressText = contentEl.createDiv({ cls: 'progress-text' });
    this.progressText.setText('Processing: 0 / 0 notes');

    const progressContainer = contentEl.createDiv({ cls: 'progress-container' });
    this.progressBar = progressContainer.createDiv({ cls: 'progress-bar' });
    this.progressBar.style.width = '0%';

    this.statusText = contentEl.createDiv({ cls: 'status-text' });
    this.statusText.setText('Initializing...');

    this.statsContainer = contentEl.createDiv({ cls: 'stats-container' });
    this.updateStats({ created: 0, skipped: 0, failed: 0 });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    this.cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    this.cancelButton.addEventListener('click', () => {
      if (this.onCancel) this.onCancel();
    });
  }

  updateProgress(progress: BulkCreateProgress): void {
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
      created: progress.created,
      skipped: progress.skipped,
      failed: progress.failed,
    });
  }

  private updateStats(stats: { created: number; skipped: number; failed: number }): void {
    if (!this.statsContainer) return;

    this.statsContainer.empty();
    this.statsContainer.createDiv({ cls: 'stat stat-created', text: `✓ Created: ${stats.created}` });
    this.statsContainer.createDiv({ cls: 'stat stat-skipped', text: `⊘ Skipped: ${stats.skipped}` });
    this.statsContainer.createDiv({ cls: 'stat stat-failed', text: `✗ Failed: ${stats.failed}` });
  }

  disableCancel(): void {
    if (this.cancelButton) {
      this.cancelButton.disabled = true;
      this.cancelButton.setText('Finishing...');
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
