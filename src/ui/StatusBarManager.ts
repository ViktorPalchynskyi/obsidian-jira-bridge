import type { Plugin } from 'obsidian';
import type { MappingResolver } from '../mapping/MappingResolver';
import type { UISettings } from '../types';

export class StatusBarManager {
  private plugin: Plugin;
  private instanceItem: HTMLElement | null = null;
  private projectItem: HTMLElement | null = null;
  private resolver: MappingResolver;
  private onClickCallback: () => void;
  private settings: UISettings;

  constructor(plugin: Plugin, resolver: MappingResolver, settings: UISettings, onClick: () => void) {
    this.plugin = plugin;
    this.resolver = resolver;
    this.settings = settings;
    this.onClickCallback = onClick;
    this.createStatusBarItems();
  }

  update(filePath: string | null): void {
    const context = filePath ? this.resolver.resolve(filePath) : null;

    if (this.instanceItem) {
      let instanceText = 'Jira: None';
      if (context?.instance) {
        const suffix = context.isDefault ? ' (default)' : context.isInstanceInherited ? ' (inherited)' : '';
        instanceText = `Jira: ${context.instance.name}${suffix}`;
      }
      this.instanceItem.setText(instanceText);
    }

    if (this.projectItem) {
      let projectText = 'Project: None';
      if (context?.projectKey) {
        const suffix = context.isProjectInherited ? ' (inherited)' : '';
        projectText = `Project: ${context.projectKey}${suffix}`;
      }
      this.projectItem.setText(projectText);
    }
  }

  setResolver(resolver: MappingResolver): void {
    this.resolver = resolver;
  }

  updateSettings(settings: UISettings): void {
    this.settings = settings;
    this.recreateStatusBarItems();
  }

  private createStatusBarItems(): void {
    if (this.settings.showStatusBarInstance) {
      this.instanceItem = this.plugin.addStatusBarItem();
      this.instanceItem.addClass('jira-bridge-status');
      this.instanceItem.setText('Jira: None');
      this.instanceItem.addEventListener('click', () => this.onClickCallback());
    }

    if (this.settings.showStatusBarProject) {
      this.projectItem = this.plugin.addStatusBarItem();
      this.projectItem.addClass('jira-bridge-status');
      this.projectItem.setText('Project: None');
      this.projectItem.addEventListener('click', () => this.onClickCallback());
    }
  }

  private recreateStatusBarItems(): void {
    if (this.instanceItem) {
      this.instanceItem.remove();
      this.instanceItem = null;
    }
    if (this.projectItem) {
      this.projectItem.remove();
      this.projectItem = null;
    }
    this.createStatusBarItems();
  }
}
