import { Plugin, MarkdownView, TFile, TFolder, Menu, Notice } from 'obsidian';
import type { PluginSettings, ServiceToken, ProjectMappingConfig, FrontmatterFieldMapping } from '../types';
import type { FrontmatterValues } from '../modals/CreateTicketModal/types';
import { ServiceContainer } from './ServiceContainer';
import { EventBus } from './EventBus';
import { JiraBridgeSettingsTab } from '../settings';
import { DEFAULT_SETTINGS, DEFAULT_CONTENT_PARSING } from '../constants/defaults';
import { MappingResolver } from '../mapping';
import { StatusBarManager } from '../ui';
import {
  CreateTicketModal,
  BulkCreateProgressModal,
  BulkCreateReportModal,
  BulkStatusChangeModal,
  BulkStatusChangeProgressModal,
  BulkStatusChangeReportModal,
  StatusChangeModal,
  LinkTicketModal,
} from '../modals';
import type { RecentIssue } from '../modals';
import { parseSummaryFromContent, parseDescriptionFromContent, addFrontmatterFields, readFrontmatterField } from '../utils';
import { BulkCreateService } from '../services/bulkCreate';
import { BulkStatusChangeService } from '../services/bulkStatusChange';
import { SyncService } from '../services/sync';

export class JiraBridgePlugin extends Plugin {
  private container!: ServiceContainer;
  private eventBus!: EventBus;
  private mappingResolver!: MappingResolver;
  private statusBar!: StatusBarManager;
  settings!: PluginSettings;
  private selectedFiles = new Set<TFile>();
  private lastClickedFile: TFile | null = null;

  async onload(): Promise<void> {
    this.container = new ServiceContainer();
    this.eventBus = new EventBus();

    await this.loadSettings();
    this.registerServices();
    this.initializeUI();
    this.registerCommands();
    this.setupEventListeners();

    const syncService = this.container.get<SyncService>({ name: 'SyncService' });
    if (this.settings.sync.autoSync) {
      syncService.startAutoSync();
    }
  }

  async onunload(): Promise<void> {
    try {
      const syncService = this.container.get<SyncService>({ name: 'SyncService' });
      syncService.stopAutoSync();
    } catch {
      // Service might not be registered
    }

    this.eventBus.clear();
    this.container.dispose();
  }

  getService<T>(token: ServiceToken<T>): T {
    return this.container.get(token);
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    await this.eventBus.emit('settings:changed', this.settings);
  }

  private registerServices(): void {
    this.container.register({ name: 'EventBus' }, this.eventBus);

    const syncService = new SyncService(this.app, this.settings, this.eventBus);
    this.container.register({ name: 'SyncService' }, syncService);
  }

  private initializeUI(): void {
    this.addSettingTab(new JiraBridgeSettingsTab(this.app, this));

    this.addRibbonIcon('ticket', 'Jira Bridge', () => {
      this.openSettings();
    });

    this.mappingResolver = new MappingResolver(this.settings);
    this.statusBar = new StatusBarManager(this, this.mappingResolver, this.settings.ui, () => this.openSettings());

    const activeFile = this.app.workspace.getActiveFile();
    this.statusBar.update(activeFile?.path || null);
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'open-settings',
      name: 'Open settings',
      callback: () => this.openSettings(),
    });

    this.addCommand({
      id: 'create-issue',
      name: 'Create Jira issue',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'j' }],
      callback: () => this.openCreateTicketModal(),
    });

    this.addCommand({
      id: 'change-status',
      name: 'Change Issue Status',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 's' }],
      callback: () => this.openStatusChangeModal(),
    });

    this.addCommand({
      id: 'link-existing-ticket',
      name: 'Link existing Jira ticket',
      callback: () => this.openLinkTicketModal(),
    });
  }

  private async openCreateTicketModal(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    const filePath = activeFile?.path || null;
    const context = this.mappingResolver.resolve(filePath || '');

    const projectConfig = context.projectMapping?.projectConfig;
    const contentParsing = projectConfig?.contentParsing || DEFAULT_CONTENT_PARSING;

    let initialSummary = activeFile?.basename || '';
    let initialDescription = '';
    let selectedText = '';

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const editor = activeView.editor;
      const content = editor.getValue();
      selectedText = editor.getSelection();

      const parsedSummary = parseSummaryFromContent(content, contentParsing.summaryPattern, contentParsing.summaryFlags);
      if (parsedSummary) {
        initialSummary = parsedSummary;
      }

      const parsedDescription = parseDescriptionFromContent(content, contentParsing.descriptionPattern, contentParsing.descriptionFlags);

      if (selectedText) {
        initialDescription = selectedText;
      } else if (parsedDescription) {
        initialDescription = parsedDescription;
      }
    }

    const frontmatterValues = this.extractFrontmatterValues(activeFile, projectConfig);

    const instanceId = context.instance?.id;
    const projectKey = context.projectKey;
    const customFields = this.settings.ui.enableCustomFields
      ? this.settings.createTicket.customFields.filter(
          cf => cf.enabled && (!cf.instanceId || cf.instanceId === instanceId) && (!cf.projectKey || cf.projectKey === projectKey),
        )
      : [];

    const modal = new CreateTicketModal(this.app, {
      instances: this.settings.instances,
      context,
      initialSummary,
      initialDescription,
      filePath: filePath || undefined,
      customFields,
      frontmatterValues,
      projectConfig,
    });

    const result = await modal.open();

    if (result && activeFile) {
      await addFrontmatterFields(this.app, activeFile, {
        issue_id: result.issueKey,
        issue_link: result.issueUrl,
      });
    }
  }

  private extractFrontmatterValues(file: TFile | null, projectConfig?: ProjectMappingConfig): FrontmatterValues {
    const values: FrontmatterValues = {};

    if (!file || !projectConfig || projectConfig.frontmatterMappings.length === 0) {
      return values;
    }

    const metadata = this.app.metadataCache.getFileCache(file);
    const frontmatter = metadata?.frontmatter;

    if (!frontmatter) {
      return values;
    }

    for (const mapping of projectConfig.frontmatterMappings) {
      const fmValue = frontmatter[mapping.frontmatterKey];
      if (fmValue === undefined || fmValue === null) continue;

      this.applyFrontmatterMapping(values, mapping, fmValue);
    }

    return values;
  }

  private applyFrontmatterMapping(values: FrontmatterValues, mapping: FrontmatterFieldMapping, fmValue: unknown): void {
    switch (mapping.jiraFieldType) {
      case 'issue_type':
        if (typeof fmValue === 'string') {
          values.issueType = fmValue;
        }
        break;
      case 'labels':
        if (Array.isArray(fmValue)) {
          values.labels = fmValue.map(String);
        } else if (typeof fmValue === 'string') {
          values.labels = [fmValue];
        }
        break;
      case 'parent':
        if (typeof fmValue === 'string') {
          values.parentSummary = fmValue;
        }
        break;
      case 'priority':
        if (typeof fmValue === 'string') {
          values.priority = fmValue;
        }
        break;
      case 'custom':
        if (mapping.customFieldId) {
          if (!values.customFields) {
            values.customFields = {};
          }
          values.customFields[mapping.customFieldId] = fmValue;
        }
        break;
    }
  }

  private setupEventListeners(): void {
    this.registerEvent(
      this.app.workspace.on('file-open', async file => {
        this.statusBar.update(file?.path || null);

        if (this.selectedFiles.size > 0) {
          const firstSelected = Array.from(this.selectedFiles)[0];
          if (!file || file.parent?.path !== firstSelected.parent?.path) {
            this.clearSelection();
          }
        }

        if (file && this.settings.sync.syncOnFileOpen) {
          const syncService = this.container.get<SyncService>({ name: 'SyncService' });
          await syncService.syncNote(file, { silent: true });
        }

        if (file) {
          this.eventBus.emit('file:opened', file);
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem(item =>
            item
              .setTitle('Create Jira tickets from notes')
              .setIcon('ticket')
              .onClick(() => this.handleBulkCreateFromFolder(file)),
          );

          menu.addItem(item =>
            item
              .setTitle('Change status for Jira tickets')
              .setIcon('refresh-cw')
              .onClick(() => this.handleBulkStatusChangeFromFolder(file)),
          );
        }
      }),
    );

    this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
      const target = evt.target as HTMLElement;

      if (!evt.altKey && !evt.shiftKey) {
        if (this.selectedFiles.size > 0 && !target.closest('.jira-bridge-selection-counter')) {
          this.clearSelection();
        }
        return;
      }

      if (evt.shiftKey && !evt.altKey) {
        setTimeout(() => {
          this.syncWithObsidianSelection();
        }, 50);
        return;
      }

      const fileItem = target.closest('.tree-item.nav-file');
      if (!fileItem) return;

      const selfEl = fileItem.querySelector('.tree-item-self');
      if (!selfEl) return;

      const titleEl = selfEl.querySelector('.tree-item-inner');
      if (!titleEl) return;

      const fileName = titleEl.textContent?.trim();
      if (!fileName) return;

      let foundFile: TFile | null = null;

      this.app.vault.getMarkdownFiles().forEach(file => {
        if (file.basename === fileName || file.name === fileName) {
          foundFile = file;
        }
      });

      if (!foundFile) {
        new Notice(`File not found: ${fileName}`);
        return;
      }

      evt.preventDefault();
      evt.stopPropagation();

      if (evt.shiftKey) {
        this.selectFileRange(foundFile);
      } else {
        this.toggleFileSelection(foundFile);
      }
    });

    this.eventBus.on('sync:complete', () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        this.statusBar.update(activeFile.path);
      }
    });

    this.eventBus.on('settings:changed', () => {
      this.mappingResolver.updateSettings(this.settings);
      this.statusBar.updateSettings(this.settings.ui);

      const syncService = this.container.get<SyncService>({ name: 'SyncService' });
      syncService.updateSettings(this.settings);

      const activeFile = this.app.workspace.getActiveFile();
      this.statusBar.update(activeFile?.path || null);
    });
  }

  private async handleBulkCreateFromFolder(folder: TFolder): Promise<void> {
    const service = new BulkCreateService(this.app, this.settings);
    const progressModal = new BulkCreateProgressModal(this.app);

    progressModal.setOnCancel(() => {
      service.cancel();
      progressModal.disableCancel();
    });

    progressModal.open();

    const result = await service.execute(folder, progress => {
      progressModal.updateProgress(progress);
    });

    for (const created of result.created) {
      try {
        await addFrontmatterFields(this.app, created.file, {
          issue_id: created.issueKey,
          issue_link: created.issueUrl,
        });
      } catch (error) {
        console.error(`Failed to update frontmatter for ${created.file.name}:`, error);
      }
    }

    progressModal.close();

    const reportModal = new BulkCreateReportModal(this.app, result);
    reportModal.open();
  }

  private async handleBulkStatusChangeFromFolder(folder: TFolder): Promise<void> {
    const enabledInstances = this.settings.instances.filter(i => i.enabled);
    if (enabledInstances.length === 0) {
      new Notice('No Jira instances configured');
      return;
    }

    const modal = new BulkStatusChangeModal(this.app, {
      instances: enabledInstances,
      defaultInstanceId: enabledInstances.find(i => i.isDefault)?.id || enabledInstances[0].id,
      target: folder,
      settings: this.settings,
    });

    const selection = await modal.open();
    if (!selection) return;

    const service = new BulkStatusChangeService(this.app, this.settings, selection.instanceId);
    const progressModal = new BulkStatusChangeProgressModal(this.app);

    progressModal.setOnCancel(() => {
      service.cancel();
      progressModal.disableCancel();
    });

    progressModal.open();

    const result = await service.execute(folder, selection, progress => {
      progressModal.updateProgress(progress);
    });

    progressModal.close();

    const reportModal = new BulkStatusChangeReportModal(this.app, result);
    reportModal.open();
  }

  private async openStatusChangeModal(): Promise<void> {
    const enabledInstances = this.settings.instances.filter(i => i.enabled);
    if (enabledInstances.length === 0) {
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    const initialIssueKey = activeFile ? readFrontmatterField(this.app, activeFile, 'issue_id') : undefined;

    const defaultInstance = enabledInstances.find(i => i.isDefault) || enabledInstances[0];

    const recentIssues: RecentIssue[] = (this.settings.recentIssues || []).sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);

    const modal = new StatusChangeModal(this.app, {
      instances: enabledInstances,
      recentIssues,
      defaultInstanceId: defaultInstance?.id,
      initialIssueKey,
    });

    const result = await modal.open();

    if (result) {
      await this.addRecentIssue(result.issueKey, modal.getInstanceId());

      if (activeFile && !initialIssueKey) {
        const instance = enabledInstances.find(i => i.id === modal.getInstanceId());
        if (instance) {
          const issueUrl = `${instance.baseUrl.replace(/\/+$/, '')}/browse/${result.issueKey}`;
          await addFrontmatterFields(this.app, activeFile, {
            issue_id: result.issueKey,
            issue_link: issueUrl,
          });
        }
      }
    }
  }

  private async openLinkTicketModal(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file');
      return;
    }

    const enabledInstances = this.settings.instances.filter(i => i.enabled);
    if (enabledInstances.length === 0) {
      new Notice('No Jira instances configured');
      return;
    }

    const context = this.mappingResolver.resolve(activeFile.path);
    const currentIssueKey = readFrontmatterField(this.app, activeFile, 'issue_id');

    const modal = new LinkTicketModal(this.app, {
      instances: enabledInstances,
      defaultInstanceId: context.instance?.id,
      currentIssueKey,
    });

    const result = await modal.open();

    if (result) {
      const instance = enabledInstances.find(i => i.id === result.instanceId);
      if (!instance) return;

      const issueUrl = instance.baseUrl.replace(/\/+$/, '') + '/browse/' + result.issueKey;

      await addFrontmatterFields(this.app, activeFile, {
        issue_id: result.issueKey,
        issue_link: issueUrl,
      });

      new Notice(`Linked to ${result.issueKey}`);
    }
  }

  private async addRecentIssue(issueKey: string, instanceId: string): Promise<void> {
    const instance = this.settings.instances.find(i => i.id === instanceId);
    if (!instance) return;

    const { JiraClient } = await import('../api/JiraClient');
    const client = new JiraClient(instance);

    try {
      const issue = await client.getIssue(issueKey, ['summary']);

      const existing = this.settings.recentIssues.findIndex(r => r.key === issueKey && r.instanceId === instanceId);
      if (existing !== -1) {
        this.settings.recentIssues.splice(existing, 1);
      }

      this.settings.recentIssues.unshift({
        key: issue.key,
        summary: String(issue.fields.summary || ''),
        instanceId,
        timestamp: Date.now(),
      });

      if (this.settings.recentIssues.length > 10) {
        this.settings.recentIssues = this.settings.recentIssues.slice(0, 10);
      }

      await this.saveSettings();
    } catch {
      // Ignore errors when saving recent issue
    }
  }

  private async handleBulkCreateFromSelection(files: TFile[]): Promise<void> {
    const validFiles = files.filter(f => this.app.vault.getAbstractFileByPath(f.path));

    if (validFiles.length < files.length) {
      new Notice(`${files.length - validFiles.length} file(s) no longer exist`);
    }

    if (validFiles.length === 0) {
      new Notice('No valid files to process');
      return;
    }

    const service = new BulkCreateService(this.app, this.settings);
    const progressModal = new BulkCreateProgressModal(this.app);

    progressModal.setOnCancel(() => {
      service.cancel();
      progressModal.disableCancel();
    });

    progressModal.open();
    this.clearSelection();

    const result = await service.execute(validFiles, progress => {
      progressModal.updateProgress(progress);
    });

    for (const created of result.created) {
      try {
        await addFrontmatterFields(this.app, created.file, {
          issue_id: created.issueKey,
          issue_link: created.issueUrl,
        });
      } catch (error) {
        console.error(`Failed to update frontmatter for ${created.file.name}:`, error);
      }
    }

    progressModal.close();

    const reportModal = new BulkCreateReportModal(this.app, result);
    reportModal.open();
  }

  private async handleBulkStatusChangeFromSelection(files: TFile[]): Promise<void> {
    const validFiles = files.filter(f => this.app.vault.getAbstractFileByPath(f.path));

    if (validFiles.length < files.length) {
      new Notice(`${files.length - validFiles.length} file(s) no longer exist`);
    }

    if (validFiles.length === 0) {
      new Notice('No valid files to process');
      return;
    }

    const enabledInstances = this.settings.instances.filter(i => i.enabled);
    if (enabledInstances.length === 0) {
      new Notice('No Jira instances configured');
      return;
    }

    const modal = new BulkStatusChangeModal(this.app, {
      instances: enabledInstances,
      defaultInstanceId: enabledInstances.find(i => i.isDefault)?.id || enabledInstances[0].id,
      target: validFiles,
      settings: this.settings,
    });

    const selection = await modal.open();
    if (!selection) return;

    this.clearSelection();

    const service = new BulkStatusChangeService(this.app, this.settings, selection.instanceId);
    const progressModal = new BulkStatusChangeProgressModal(this.app);

    progressModal.setOnCancel(() => {
      service.cancel();
      progressModal.disableCancel();
    });

    progressModal.open();

    const result = await service.execute(validFiles, selection, progress => {
      progressModal.updateProgress(progress);
    });

    progressModal.close();

    const reportModal = new BulkStatusChangeReportModal(this.app, result);
    reportModal.open();
  }

  private toggleFileSelection(file: TFile): void {
    const existingFile = Array.from(this.selectedFiles).find(f => f.path === file.path);

    if (existingFile) {
      this.selectedFiles.delete(existingFile);
      this.removeFileSelectionVisual(file);
    } else {
      if (this.selectedFiles.size >= 100) {
        new Notice('Maximum 100 files can be selected');
        return;
      }
      this.selectedFiles.add(file);
      this.addFileSelectionVisual(file);
    }
    this.lastClickedFile = file;
    this.updateSelectionCounter();
  }

  private selectFileRange(endFile: TFile): void {
    if (!this.lastClickedFile) {
      this.toggleFileSelection(endFile);
      return;
    }

    if (this.lastClickedFile.parent?.path !== endFile.parent?.path) {
      new Notice('Range selection only works within the same folder');
      return;
    }

    const parent = endFile.parent;
    if (!parent) return;

    const files = parent.children.filter(f => f instanceof TFile && f.extension === 'md') as TFile[];

    const startIndex = files.findIndex(f => f.path === this.lastClickedFile!.path);
    const endIndex = files.findIndex(f => f.path === endFile.path);

    console.log('Range selection debug:', {
      lastClickedFile: this.lastClickedFile.path,
      endFile: endFile.path,
      totalFiles: files.length,
      startIndex,
      endIndex,
      currentSelection: this.selectedFiles.size,
    });

    if (startIndex === -1 || endIndex === -1) return;

    const [min, max] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const rangeFiles = files.slice(min, max + 1);

    console.log(
      'Range files:',
      rangeFiles.map(f => f.name),
      'count:',
      rangeFiles.length,
    );

    const spaceAvailable = 100 - this.selectedFiles.size;
    const filesToAdd = rangeFiles.filter(f => !Array.from(this.selectedFiles).some(sf => sf.path === f.path)).slice(0, spaceAvailable);

    console.log(
      'Files to add:',
      filesToAdd.map(f => f.name),
      'count:',
      filesToAdd.length,
    );

    if (filesToAdd.length < rangeFiles.filter(f => !Array.from(this.selectedFiles).some(sf => sf.path === f.path)).length) {
      new Notice('Maximum 100 files can be selected. Only some files were added.');
    }

    for (const file of filesToAdd) {
      this.selectedFiles.add(file);
      this.addFileSelectionVisual(file);
    }

    console.log('After adding, selection size:', this.selectedFiles.size);

    this.lastClickedFile = endFile;
    this.updateSelectionCounter();
  }

  private addFileSelectionVisual(file: TFile): void {
    const fileExplorer = document.querySelector('.nav-files-container');
    if (!fileExplorer) return;

    const element = fileExplorer.querySelector(`[data-path="${file.path}"]`);
    if (element) {
      element.addClass('jira-bridge-file-selected');
    }
  }

  private removeFileSelectionVisual(file: TFile): void {
    const fileExplorer = document.querySelector('.nav-files-container');
    if (!fileExplorer) return;

    const element = fileExplorer.querySelector(`[data-path="${file.path}"]`);
    if (element) {
      element.removeClass('jira-bridge-file-selected');
    }
  }

  private clearSelection(): void {
    for (const file of this.selectedFiles) {
      this.removeFileSelectionVisual(file);
    }
    this.selectedFiles.clear();
    this.lastClickedFile = null;
    this.updateSelectionCounter();
  }

  private syncWithObsidianSelection(): void {
    const selectedItems = document.querySelectorAll('.nav-file-title.is-selected, .tree-item.is-selected');

    this.clearSelection();

    selectedItems.forEach(item => {
      const titleEl = item.querySelector('.tree-item-inner') || item;
      const fileName = titleEl.textContent?.trim();
      if (!fileName) return;

      this.app.vault.getMarkdownFiles().forEach(file => {
        if (file.basename === fileName || file.name === fileName) {
          const notAlreadySelected = !Array.from(this.selectedFiles).some(f => f.path === file.path);
          if (notAlreadySelected) {
            this.selectedFiles.add(file);
            this.addFileSelectionVisual(file);
          }
        }
      });
    });

    this.updateSelectionCounter();
  }

  private updateSelectionCounter(): void {
    let counter = document.querySelector('.jira-bridge-selection-counter') as HTMLElement;

    if (this.selectedFiles.size === 0) {
      counter?.remove();
      return;
    }

    if (!counter) {
      counter = document.body.createDiv('jira-bridge-selection-counter');
    }

    counter.empty();

    const header = counter.createDiv('selection-counter-header');
    header.setText(`${this.selectedFiles.size} file${this.selectedFiles.size !== 1 ? 's' : ''} selected`);

    const actions = counter.createDiv('selection-counter-actions');

    const createBtn = actions.createEl('button', { cls: 'selection-action-btn' });
    createBtn.setText('Create Tickets');
    createBtn.addEventListener('click', () => {
      this.handleBulkCreateFromSelection(Array.from(this.selectedFiles));
    });

    const statusBtn = actions.createEl('button', { cls: 'selection-action-btn' });
    statusBtn.setText('Change Status');
    statusBtn.addEventListener('click', () => {
      this.handleBulkStatusChangeFromSelection(Array.from(this.selectedFiles));
    });

    const clearBtn = actions.createEl('button', { cls: 'selection-action-btn selection-clear-btn' });
    clearBtn.setText('Clear');
    clearBtn.addEventListener('click', () => {
      this.clearSelection();
    });
  }

  private openSettings(): void {
    const settingModal = (this.app as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
    if (settingModal) {
      settingModal.open();
      settingModal.openTabById(this.manifest.id);
    }
  }
}
