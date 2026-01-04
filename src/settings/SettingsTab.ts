import { App, PluginSettingTab, Setting } from 'obsidian';
import type { JiraBridgePlugin } from '../core/Plugin';
import type { JiraInstance } from '../types';
import { AddJiraInstanceModal } from '../modals';

export class JiraBridgeSettingsTab extends PluginSettingTab {
  plugin: JiraBridgePlugin;

  constructor(app: App, plugin: JiraBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h1', { text: 'Jira Bridge Settings' });

    this.renderInstancesSection(containerEl);
  }

  private renderInstancesSection(containerEl: HTMLElement): void {
    const section = containerEl.createEl('div', { cls: 'jira-instances-section' });

    new Setting(section)
      .setName('Jira Instances')
      .setDesc('Configure your Jira connections')
      .addButton(button =>
        button.setButtonText('Add Instance').onClick(async () => {
          await this.handleAddInstance();
        }),
      );

    const instanceList = section.createEl('div', { cls: 'instance-list' });

    if (this.plugin.settings.instances.length === 0) {
      instanceList.createEl('p', {
        text: 'No Jira instances configured. Add one to get started.',
        cls: 'setting-item-description',
      });
    } else {
      for (const instance of this.plugin.settings.instances) {
        this.renderInstanceCard(instanceList, instance);
      }
    }
  }

  private renderInstanceCard(container: HTMLElement, instance: JiraInstance): void {
    const card = container.createEl('div', { cls: 'instance-card' });

    const header = card.createEl('div', { cls: 'instance-header' });

    const titleContainer = header.createEl('div', { cls: 'instance-title-container' });
    titleContainer.createEl('span', { text: instance.name, cls: 'instance-name' });

    if (instance.isDefault) {
      titleContainer.createEl('span', { text: 'Default', cls: 'instance-badge' });
    }

    if (!instance.enabled) {
      titleContainer.createEl('span', { text: 'Disabled', cls: 'instance-badge mod-disabled' });
    }

    const actions = header.createEl('div', { cls: 'instance-actions' });

    const testButton = actions.createEl('button', {
      text: 'Test',
      cls: 'instance-action-btn',
      attr: { 'aria-label': 'Test connection' },
    });
    testButton.addEventListener('click', () => {
      // TODO: US-1.2 - implement test connection
    });

    if (!instance.isDefault) {
      const defaultButton = actions.createEl('button', {
        text: 'Set Default',
        cls: 'instance-action-btn',
        attr: { 'aria-label': 'Set as default' },
      });
      defaultButton.addEventListener('click', async () => {
        await this.handleSetDefault(instance.id);
      });
    }

    const editButton = actions.createEl('button', {
      text: 'Edit',
      cls: 'instance-action-btn',
      attr: { 'aria-label': 'Edit instance' },
    });
    editButton.addEventListener('click', () => {
      // TODO: US-1.3 - implement edit instance
    });

    const removeButton = actions.createEl('button', {
      text: 'Remove',
      cls: 'instance-action-btn mod-warning',
      attr: { 'aria-label': 'Remove instance' },
    });
    removeButton.addEventListener('click', async () => {
      await this.handleRemoveInstance(instance.id);
    });

    const details = card.createEl('div', { cls: 'instance-details' });
    details.createEl('div', { text: instance.baseUrl, cls: 'instance-url' });
    details.createEl('div', { text: instance.email, cls: 'instance-email' });
  }

  private async handleAddInstance(): Promise<void> {
    const modal = new AddJiraInstanceModal(this.app);
    const result = await modal.open();

    if (result) {
      if (this.plugin.settings.instances.length === 0) {
        result.isDefault = true;
      }

      this.plugin.settings.instances.push(result);
      await this.plugin.saveSettings();
      this.display();
    }
  }

  private async handleSetDefault(instanceId: string): Promise<void> {
    for (const instance of this.plugin.settings.instances) {
      instance.isDefault = instance.id === instanceId;
    }
    await this.plugin.saveSettings();
    this.display();
  }

  private async handleRemoveInstance(instanceId: string): Promise<void> {
    const instance = this.plugin.settings.instances.find(i => i.id === instanceId);
    if (!instance) return;

    const confirmed = confirm(`Are you sure you want to remove "${instance.name}"?`);
    if (!confirmed) return;

    const wasDefault = instance.isDefault;
    this.plugin.settings.instances = this.plugin.settings.instances.filter(i => i.id !== instanceId);

    if (wasDefault && this.plugin.settings.instances.length > 0) {
      this.plugin.settings.instances[0].isDefault = true;
    }

    await this.plugin.saveSettings();
    this.display();
  }
}
