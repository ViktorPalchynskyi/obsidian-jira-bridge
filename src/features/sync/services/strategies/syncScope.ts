import { App, TFile, TFolder, FileView } from 'obsidian';
import type { SyncScopeStrategy } from '../types';
import type { SyncStats } from '../../../../types';

export class OpenNotesScope implements SyncScopeStrategy {
  collectFiles(app: App): TFile[] {
    const files: TFile[] = [];

    app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view instanceof FileView && leaf.view.file instanceof TFile && leaf.view.file.extension === 'md') {
        files.push(leaf.view.file);
      }
    });

    return files;
  }

  getNotificationMessage(stats: SyncStats): string {
    return `Synced ${stats.synced} note(s) with ${stats.changes} change(s)`;
  }
}

export class FolderScope implements SyncScopeStrategy {
  private folder: TFolder;

  constructor(folder: TFolder) {
    this.folder = folder;
  }

  collectFiles(_app: App): TFile[] {
    const files: TFile[] = [];
    this.collectFilesRecursive(this.folder, files);
    return files;
  }

  private collectFilesRecursive(folder: TFolder, files: TFile[]): void {
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === 'md') {
        files.push(child);
      } else if (child instanceof TFolder) {
        this.collectFilesRecursive(child, files);
      }
    }
  }

  getNotificationMessage(stats: SyncStats): string {
    return `Synced ${stats.synced}/${stats.total} notes with ${stats.changes} change(s)`;
  }
}
