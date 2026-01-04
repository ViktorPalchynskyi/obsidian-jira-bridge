import { App, PluginSettingTab, Setting } from 'obsidian';
import type { JiraBridgePlugin } from '../core/Plugin';

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

    new Setting(containerEl)
      .setName('Jira Instances')
      .setDesc('Configure your Jira connections')
      .addButton(button =>
        button.setButtonText('Add Instance').onClick(() => {
          // TODO: implement add instance modal
        }),
      );

    containerEl.createEl('h2', { text: 'Connected Instances' });

    if (this.plugin.settings.instances.length === 0) {
      containerEl.createEl('p', {
        text: 'No Jira instances configured. Add one to get started.',
        cls: 'setting-item-description',
      });
    }
  }
}
