import { Plugin } from 'obsidian';
import type { PluginSettings, ServiceToken } from '../types';
import { ServiceContainer } from './ServiceContainer';
import { EventBus } from './EventBus';
import { JiraBridgeSettingsTab } from '../settings';
import { DEFAULT_SETTINGS } from '../constants/defaults';

export class JiraBridgePlugin extends Plugin {
  private container!: ServiceContainer;
  private eventBus!: EventBus;
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
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'open-settings',
      name: 'Open settings',
      callback: () => this.openSettings(),
    });
  }

  private setupEventListeners(): void {
    this.registerEvent(
      this.app.workspace.on('file-open', file => {
        if (file) {
          this.eventBus.emit('file:opened', file);
        }
      }),
    );
  }

  private openSettings(): void {
    const settingModal = (this.app as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
    if (settingModal) {
      settingModal.open();
      settingModal.openTabById(this.manifest.id);
    }
  }
}
