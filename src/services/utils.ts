import type { App, TAbstractFile, TFile, TFolder } from 'obsidian';
import type { BulkOperationTarget } from './types';

function isTFile(item: TAbstractFile): item is TFile {
  return 'extension' in item;
}

function isTFolder(item: TAbstractFile): item is TFolder {
  return 'children' in item;
}

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
    if (isTFile(child) && child.extension === 'md') {
      files.push(child);
    } else if (isTFolder(child)) {
      files.push(...collectMarkdownFilesFromFolder(app, child));
    }
  }
  return files;
}
