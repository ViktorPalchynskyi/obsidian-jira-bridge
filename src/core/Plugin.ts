import { Plugin, MarkdownView } from 'obsidian';
import type { PluginSettings, ServiceToken } from '../types';
import { ServiceContainer } from './ServiceContainer';
import { EventBus } from './EventBus';
import { JiraBridgeSettingsTab } from '../settings';
import { DEFAULT_SETTINGS } from '../constants/defaults';
import { MappingResolver } from '../mapping';
import { StatusBarManager } from '../ui';
import { CreateTicketModal } from '../modals';
import { parseSummaryFromContent, parseDescriptionFromContent } from '../utils';

export class JiraBridgePlugin extends Plugin {
  private container!: ServiceContainer;
  private eventBus!: EventBus;
  private mappingResolver!: MappingResolver;
  private statusBar!: StatusBarManager;
  settings!: PluginSettings;

  async onload(): Promise<void> {
    this.container = new ServiceContainer();
    this.eventBus = new EventBus();

    await this.loadSettings();
    this.registerServices();
    this.initializeUI();
    this.registerCommands();
    this.setupEventListeners();
  }

  async onunload(): Promise<void> {
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
  }

  private openCreateTicketModal(): void {
    const activeFile = this.app.workspace.getActiveFile();
    const filePath = activeFile?.path || null;
    const context = this.mappingResolver.resolve(filePath || '');

    let initialSummary = activeFile?.basename || '';
    let initialDescription = '';

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const editor = activeView.editor;
      const content = editor.getValue();

      const parsedSummary = parseSummaryFromContent(content);
      if (parsedSummary) {
        initialSummary = parsedSummary;
      }

      const parsedDescription = parseDescriptionFromContent(content);
      if (parsedDescription) {
        initialDescription = parsedDescription;
      } else {
        const selection = editor.getSelection();
        if (selection) {
          initialDescription = selection;
        }
      }
    }

    const modal = new CreateTicketModal(this.app, {
      instances: this.settings.instances,
      context,
      initialSummary,
      initialDescription,
      filePath: filePath || undefined,
    });

    modal.open();
  }

  private setupEventListeners(): void {
    this.registerEvent(
      this.app.workspace.on('file-open', file => {
        this.statusBar.update(file?.path || null);
        if (file) {
          this.eventBus.emit('file:opened', file);
        }
      }),
    );

    this.eventBus.on('settings:changed', () => {
      this.mappingResolver.updateSettings(this.settings);
      this.statusBar.updateSettings(this.settings.ui);
      const activeFile = this.app.workspace.getActiveFile();
      this.statusBar.update(activeFile?.path || null);
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
