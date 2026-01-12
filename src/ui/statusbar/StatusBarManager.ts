import { TFile, App, Plugin } from 'obsidian';
import type { MappingResolver } from '../../mapping/MappingResolver';
import type { UISettings } from '../../types';
import { readFrontmatterField } from '../../utils/frontmatter';

export class StatusBarManager {
  private app: App;
  private plugin: Plugin;
  private instanceItem: HTMLElement | null = null;
  private projectItem: HTMLElement | null = null;
  private statusItem: HTMLElement | null = null;
  private resolver: MappingResolver;
  private onClickCallback: () => void;
  private settings: UISettings;

  constructor(app: App, plugin: Plugin, resolver: MappingResolver, settings: UISettings, onClick: () => void) {
    this.app = app;
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

    if (this.statusItem) {
      if (filePath) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          const issueKey = readFrontmatterField(this.app, file, 'issue_id');
          const status = readFrontmatterField(this.app, file, 'jira_status');

          if (issueKey && status) {
            this.statusItem.setText(`Status: ${status}`);
            this.statusItem.style.display = 'inline-block';
          } else if (issueKey) {
            this.statusItem.setText(`Status: Not synced`);
            this.statusItem.style.display = 'inline-block';
          } else {
            this.statusItem.style.display = 'none';
          }
        } else {
          this.statusItem.style.display = 'none';
        }
      } else {
        this.statusItem.style.display = 'none';
      }
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

    if (this.settings.showStatusBarStatus) {
      this.statusItem = this.plugin.addStatusBarItem();
      this.statusItem.addClass('jira-bridge-status', 'jira-bridge-status-ticket');
      this.statusItem.setText('Status: None');
      this.statusItem.style.display = 'none';
      this.statusItem.addEventListener('click', () => this.onClickCallback());
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
    if (this.statusItem) {
      this.statusItem.remove();
      this.statusItem = null;
    }
    this.createStatusBarItems();
  }
}
