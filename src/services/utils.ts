import type { App, TFile, TFolder } from 'obsidian';
import type { BulkOperationTarget } from './types';

export function isFolder(target: BulkOperationTarget): target is TFolder {
  return !Array.isArray(target) && 'children' in target;
}

export function isFileArray(target: BulkOperationTarget): target is TFile[] {
  return Array.isArray(target);
}

export function collectMarkdownFiles(app: App, target: BulkOperationTarget): TFile[] {
  if (isFileArray(target)) {
    return target.filter(f => f.extension === 'md');
  }
  return collectMarkdownFilesFromFolder(app, target);
}

function collectMarkdownFilesFromFolder(app: App, folder: TFolder): TFile[] {
  const files: TFile[] = [];
  for (const child of folder.children) {
    if (child instanceof app.vault.adapter.constructor) continue;
    if ('extension' in child && (child as TFile).extension === 'md') {
      files.push(child as TFile);
    } else if ('children' in child) {
      files.push(...collectMarkdownFilesFromFolder(app, child as TFolder));
    }
  }
  return files;
}
