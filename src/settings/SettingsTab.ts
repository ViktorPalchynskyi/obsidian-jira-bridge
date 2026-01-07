import { App, PluginSettingTab, Setting } from 'obsidian';
import type { JiraBridgePlugin } from '../core/Plugin';
import type { JiraInstance, FolderMapping, MappingType } from '../types';
import { JiraInstanceModal, FolderMappingModal, CustomFieldsModal, FrontmatterMappingModal, AdvancedConfigModal } from '../modals';
import { JiraClient } from '../api';

export class JiraBridgeSettingsTab extends PluginSettingTab {
  plugin: JiraBridgePlugin;
  private toastContainer: HTMLElement | null = null;

  constructor(app: App, plugin: JiraBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('jira-bridge-settings');

    containerEl.createEl('h1', { text: 'Jira Bridge Settings' });

    this.toastContainer = containerEl.createEl('div', { cls: 'settings-toast-container' });

    this.renderUISection(containerEl);
    this.renderInstancesSection(containerEl);
    this.renderMappingsSection(containerEl);
    this.renderSyncSection(containerEl);
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    if (!this.toastContainer) return;

    const toast = this.toastContainer.createEl('div', {
      cls: `settings-toast ${type}`,
      text: message,
    });

    setTimeout(() => {
      toast.addClass('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
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
    testButton.addEventListener('click', async () => {
      await this.handleTestConnection(instance, testButton);
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
    editButton.addEventListener('click', async () => {
      await this.handleEditInstance(instance);
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
    const modal = new JiraInstanceModal(this.app, { mode: 'add' });
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

  private async handleEditInstance(instance: JiraInstance): Promise<void> {
    const modal = new JiraInstanceModal(this.app, { mode: 'edit', instance });
    const result = await modal.open();

    if (result) {
      const index = this.plugin.settings.instances.findIndex(i => i.id === instance.id);
      if (index !== -1) {
        this.plugin.settings.instances[index] = result;
        await this.plugin.saveSettings();
        this.display();
      }
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

    const isLastInstance = this.plugin.settings.instances.length === 1;
    const message = isLastInstance
      ? `"${instance.name}" is your only configured instance. Are you sure you want to remove it?`
      : `Are you sure you want to remove "${instance.name}"?`;

    const confirmed = confirm(message);
    if (!confirmed) return;

    const wasDefault = instance.isDefault;
    this.plugin.settings.instances = this.plugin.settings.instances.filter(i => i.id !== instanceId);

    if (wasDefault && this.plugin.settings.instances.length > 0) {
      this.plugin.settings.instances[0].isDefault = true;
    }

    await this.plugin.saveSettings();
    this.display();
  }

  private async handleTestConnection(instance: JiraInstance, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    button.textContent = 'Testing...';

    const client = new JiraClient(instance);
    const result = await client.testConnection();

    button.disabled = false;
    button.textContent = 'Test';

    if (result.success && result.user) {
      this.showToast(`✓ Connected to ${instance.name} as ${result.user.displayName}`, 'success');
    } else {
      this.showToast(`✗ ${instance.name}: ${result.error}`, 'error');
    }
  }

  private renderMappingsSection(containerEl: HTMLElement): void {
    const section = containerEl.createEl('div', { cls: 'folder-mappings-section' });

    const headerSetting = new Setting(section).setName('Folder Mappings').setDesc('Map folders to Jira instances and projects');

    headerSetting.addButton(button =>
      button.setButtonText('Add Instance Mapping').onClick(async () => {
        await this.handleAddMapping('instance');
      }),
    );

    const mappingList = section.createEl('div', { cls: 'mapping-list' });

    const instanceMappings = this.plugin.settings.mappings.filter(m => m.type === 'instance');

    if (instanceMappings.length === 0) {
      mappingList.createEl('p', {
        text: 'No folder mappings configured. Add an instance mapping to get started.',
        cls: 'setting-item-description',
      });
    } else {
      this.renderMappingTree(mappingList, instanceMappings);
    }
  }

  private renderMappingTree(container: HTMLElement, instanceMappings: FolderMapping[]): void {
    const projectMappings = this.plugin.settings.mappings.filter(m => m.type === 'project');

    for (const instanceMapping of instanceMappings) {
      const instance = this.plugin.settings.instances.find(i => i.id === instanceMapping.instanceId);
      const instanceName = instance?.name || 'Unknown Instance';

      const treeItem = container.createEl('div', { cls: 'mapping-tree-item' });

      this.renderMappingCard(treeItem, instanceMapping, instanceName, 'instance');

      const childMappings = projectMappings.filter(pm => pm.folderPath.startsWith(instanceMapping.folderPath));

      if (childMappings.length > 0) {
        const childContainer = treeItem.createEl('div', { cls: 'mapping-children' });
        for (const childMapping of childMappings) {
          this.renderMappingCard(childContainer, childMapping, childMapping.projectKey || 'Unknown', 'project', instanceMapping.instanceId);
        }
      }
    }
  }

  private renderMappingCard(
    container: HTMLElement,
    mapping: FolderMapping,
    targetName: string,
    type: MappingType,
    parentInstanceId?: string,
  ): void {
    const card = container.createEl('div', { cls: `mapping-card mapping-${type}` });

    const header = card.createEl('div', { cls: 'mapping-header' });

    const titleContainer = header.createEl('div', { cls: 'mapping-title-container' });

    titleContainer.createEl('span', { text: mapping.folderPath || '/', cls: 'mapping-folder' });
    titleContainer.createEl('span', { text: '→', cls: 'mapping-arrow' });
    titleContainer.createEl('span', { text: targetName, cls: 'mapping-target' });

    const badge = type === 'instance' ? 'Instance' : 'Project';
    titleContainer.createEl('span', { text: badge, cls: `mapping-badge mapping-badge-${type}` });

    const actions = header.createEl('div', { cls: 'mapping-actions' });

    if (type === 'instance' && mapping.instanceId) {
      const addProjectButton = actions.createEl('button', {
        text: 'Add Project',
        cls: 'mapping-action-btn',
        attr: { 'aria-label': 'Add project mapping' },
      });
      addProjectButton.addEventListener('click', async () => {
        await this.handleAddMapping('project', mapping.instanceId, mapping.folderPath);
      });
    }

    if (type === 'project' && mapping.projectKey && parentInstanceId) {
      const advancedBtn = actions.createEl('button', {
        text: 'Advanced Config',
        cls: 'mapping-action-btn',
        attr: { 'aria-label': 'Advanced configuration' },
      });
      advancedBtn.addEventListener('click', async () => {
        await this.handleAdvancedConfig(mapping, parentInstanceId);
      });
    }

    const editButton = actions.createEl('button', {
      text: 'Edit',
      cls: 'mapping-action-btn',
      attr: { 'aria-label': 'Edit mapping' },
    });
    editButton.addEventListener('click', async () => {
      await this.handleEditMapping(mapping);
    });

    const removeButton = actions.createEl('button', {
      text: 'Remove',
      cls: 'mapping-action-btn mod-warning',
      attr: { 'aria-label': 'Remove mapping' },
    });
    removeButton.addEventListener('click', async () => {
      await this.handleRemoveMapping(mapping);
    });
  }

  private async handleAddMapping(mappingType: MappingType, instanceId?: string, baseFolderPath?: string): Promise<void> {
    const modal = new FolderMappingModal(this.app, {
      mode: 'add',
      mappingType,
      instances: this.plugin.settings.instances,
      existingMappings: this.plugin.settings.mappings,
      parentInstanceId: instanceId,
      baseFolderPath,
    });

    const result = await modal.open();

    if (result) {
      this.plugin.settings.mappings.push(result);
      await this.plugin.saveSettings();
      this.display();
    }
  }

  private async handleEditMapping(mapping: FolderMapping): Promise<void> {
    const modal = new FolderMappingModal(this.app, {
      mode: 'edit',
      mappingType: mapping.type,
      instances: this.plugin.settings.instances,
      existingMappings: this.plugin.settings.mappings,
      mapping,
      parentInstanceId: mapping.type === 'project' ? this.findParentInstanceId(mapping.folderPath) : undefined,
    });

    const result = await modal.open();

    if (result) {
      const index = this.plugin.settings.mappings.findIndex(m => m.id === mapping.id);
      if (index !== -1) {
        this.plugin.settings.mappings[index] = result;
        await this.plugin.saveSettings();
        this.display();
      }
    }
  }

  private findParentInstanceId(folderPath: string): string | undefined {
    const instanceMappings = this.plugin.settings.mappings.filter(m => m.type === 'instance');
    for (const mapping of instanceMappings) {
      if (folderPath.startsWith(mapping.folderPath)) {
        return mapping.instanceId;
      }
    }
    return undefined;
  }

  private async handleRemoveMapping(mapping: FolderMapping): Promise<void> {
    let message = `Are you sure you want to remove the mapping for "${mapping.folderPath}"?`;

    if (mapping.type === 'instance') {
      const childMappings = this.plugin.settings.mappings.filter(m => m.type === 'project' && m.folderPath.startsWith(mapping.folderPath));
      if (childMappings.length > 0) {
        message = `This instance mapping has ${childMappings.length} project mapping(s). Removing it will also remove all project mappings. Continue?`;
      }
    }

    const confirmed = confirm(message);
    if (!confirmed) return;

    if (mapping.type === 'instance') {
      this.plugin.settings.mappings = this.plugin.settings.mappings.filter(
        m => !(m.id === mapping.id || (m.type === 'project' && m.folderPath.startsWith(mapping.folderPath))),
      );
    } else {
      this.plugin.settings.mappings = this.plugin.settings.mappings.filter(m => m.id !== mapping.id);
    }

    await this.plugin.saveSettings();
    this.display();
  }

  private async handleConfigureFields(mapping: FolderMapping, instanceId: string): Promise<void> {
    if (!mapping.projectKey) return;

    const instance = this.plugin.settings.instances.find(i => i.id === instanceId);
    if (!instance) return;

    const modal = new CustomFieldsModal(this.app, {
      instance,
      projectKey: mapping.projectKey,
      customFields: this.plugin.settings.createTicket.customFields,
    });

    const result = await modal.open();

    if (result) {
      this.plugin.settings.createTicket.customFields = result.customFields;
      await this.plugin.saveSettings();
    }
  }

  private async handleConfigureMapping(mapping: FolderMapping, instanceId: string): Promise<void> {
    if (!mapping.projectKey) return;

    const instance = this.plugin.settings.instances.find(i => i.id === instanceId);
    if (!instance) return;

    const customFields = this.plugin.settings.createTicket.customFields.filter(
      cf => cf.enabled && (!cf.instanceId || cf.instanceId === instanceId) && (!cf.projectKey || cf.projectKey === mapping.projectKey),
    );

    const modal = new FrontmatterMappingModal(this.app, {
      mapping,
      instance,
      customFields,
    });

    const result = await modal.open();

    if (result) {
      const mappingIndex = this.plugin.settings.mappings.findIndex(m => m.id === mapping.id);
      if (mappingIndex !== -1) {
        this.plugin.settings.mappings[mappingIndex].projectConfig = result.projectConfig;
        await this.plugin.saveSettings();
      }
    }
  }

  private async handleAdvancedConfig(mapping: FolderMapping, instanceId: string): Promise<void> {
    const instance = this.plugin.settings.instances.find(i => i.id === instanceId);
    if (!instance) return;

    const customFields = this.plugin.settings.createTicket.customFields.filter(
      cf => cf.enabled && (!cf.instanceId || cf.instanceId === instanceId) && (!cf.projectKey || cf.projectKey === mapping.projectKey),
    );

    const defaultSyncFields = [
      { jiraField: 'status', frontmatterKey: 'jira_status', enabled: true, readOnly: true },
      { jiraField: 'assignee', frontmatterKey: 'jira_assignee', enabled: false, readOnly: true },
      { jiraField: 'priority', frontmatterKey: 'jira_priority', enabled: false, readOnly: true },
    ];

    const modal = new AdvancedConfigModal(this.app, {
      mapping,
      instance,
      customFields,
      globalSyncFields: this.plugin.settings.sync?.syncFields ?? defaultSyncFields,
      onUpdate: async projectConfig => {
        const mappingIndex = this.plugin.settings.mappings.findIndex(m => m.id === mapping.id);
        if (mappingIndex !== -1) {
          this.plugin.settings.mappings[mappingIndex].projectConfig = projectConfig;
          await this.plugin.saveSettings();
        }
      },
      onUpdateCustomFields: async fields => {
        this.plugin.settings.createTicket.customFields = fields;
        await this.plugin.saveSettings();
      },
    });

    await modal.open();
    this.display();
  }

  private renderSyncSection(containerEl: HTMLElement): void {
    const section = containerEl.createEl('div', { cls: 'sync-settings-section' });

    new Setting(section).setName('Sync Settings').setHeading();

    new Setting(section)
      .setName('Auto-sync')
      .setDesc('Automatically sync open notes with Jira at regular intervals')
      .addToggle(toggle => {
        const syncSettings = this.plugin.settings.sync ?? { autoSync: false, syncInterval: 1 };
        toggle.setValue(syncSettings.autoSync ?? false).onChange(async value => {
          if (!this.plugin.settings.sync) {
            this.plugin.settings.sync = {
              autoSync: false,
              syncInterval: 1,
              syncOnFileOpen: true,
              updateFrontmatter: true,
              frontmatterFields: [],
              syncFields: [],
            };
          }
          this.plugin.settings.sync.autoSync = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(section)
      .setName('Sync interval')
      .setDesc('How often to sync (in minutes)')
      .addText(text => {
        const syncSettings = this.plugin.settings.sync ?? { syncInterval: 1 };
        text.setValue(String(syncSettings.syncInterval ?? 1)).onChange(async value => {
          const interval = parseInt(value) || 1;
          if (!this.plugin.settings.sync) {
            this.plugin.settings.sync = {
              autoSync: false,
              syncInterval: 1,
              syncOnFileOpen: true,
              updateFrontmatter: true,
              frontmatterFields: [],
              syncFields: [],
            };
          }
          this.plugin.settings.sync.syncInterval = Math.max(1, interval);
          await this.plugin.saveSettings();
        });
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text.inputEl.style.width = '60px';
      });

    new Setting(section)
      .setName('Sync on file open')
      .setDesc('Sync note when you open or switch to it')
      .addToggle(toggle => {
        const syncSettings = this.plugin.settings.sync ?? { syncOnFileOpen: true };
        toggle.setValue(syncSettings.syncOnFileOpen ?? true).onChange(async value => {
          if (!this.plugin.settings.sync) {
            this.plugin.settings.sync = {
              autoSync: false,
              syncInterval: 1,
              syncOnFileOpen: true,
              updateFrontmatter: true,
              frontmatterFields: [],
              syncFields: [],
            };
          }
          this.plugin.settings.sync.syncOnFileOpen = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(section).setName('Sync Fields').setDesc('Fields to sync from Jira to frontmatter (global defaults)');

    const fieldsContainer = section.createEl('div', { cls: 'sync-fields-global' });
    this.renderGlobalSyncFields(fieldsContainer);
  }

  private renderGlobalSyncFields(container: HTMLElement): void {
    container.empty();

    const defaultFields = [
      { jiraField: 'status', frontmatterKey: 'jira_status', enabled: true, readOnly: true },
      { jiraField: 'assignee', frontmatterKey: 'jira_assignee', enabled: false, readOnly: true },
      { jiraField: 'priority', frontmatterKey: 'jira_priority', enabled: false, readOnly: true },
    ];

    const syncFields = this.plugin.settings.sync?.syncFields ?? defaultFields;

    for (const field of syncFields) {
      const item = container.createEl('div', { cls: 'sync-field-item' });

      const checkbox = item.createEl('input', { type: 'checkbox' });
      checkbox.checked = field.enabled;
      checkbox.addEventListener('change', async () => {
        field.enabled = checkbox.checked;
        if (!this.plugin.settings.sync) {
          this.plugin.settings.sync = {
            autoSync: false,
            syncInterval: 1,
            syncOnFileOpen: true,
            updateFrontmatter: true,
            frontmatterFields: [],
            syncFields: syncFields,
          };
        }
        this.plugin.settings.sync.syncFields = syncFields;
        await this.plugin.saveSettings();
      });

      const label = item.createEl('label');
      label.createSpan({ text: field.jiraField, cls: 'field-jira' });
      label.createSpan({ text: ' → ', cls: 'field-arrow' });
      label.createSpan({ text: field.frontmatterKey, cls: 'field-frontmatter' });
    }
  }

  private renderUISection(containerEl: HTMLElement): void {
    const section = containerEl.createEl('div', { cls: 'ui-settings-section' });

    new Setting(section).setName('Status Bar').setHeading();

    new Setting(section)
      .setName('Show Jira instance')
      .setDesc('Display current Jira instance in the status bar')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.ui.showStatusBarInstance).onChange(async value => {
          this.plugin.settings.ui.showStatusBarInstance = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(section)
      .setName('Show Jira project')
      .setDesc('Display current Jira project in the status bar')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.ui.showStatusBarProject).onChange(async value => {
          this.plugin.settings.ui.showStatusBarProject = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(section).setName('Custom Fields').setHeading();

    new Setting(section)
      .setName('Enable custom fields')
      .setDesc('Show additional Jira fields when creating issues. Configure fields per project in Folder Mappings.')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.ui.enableCustomFields).onChange(async value => {
          this.plugin.settings.ui.enableCustomFields = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );
  }
}
