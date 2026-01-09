import { App, Notice, DropdownComponent, setIcon } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import type {
  JiraInstance,
  JiraProject,
  ConfigurationReference,
  ImportWizardStep,
  ImportWizardState,
  ValidationResult,
  ConfigurationDiff,
  ImportModalResult,
  ApplyOptions,
} from '../../types';
import { JiraClient } from '../../api/JiraClient';
import { ConfigDiscoveryService } from '../../services/configExport';
import { ConfigurationValidationService, ConfigurationApplyService } from '../../services/configImport';

interface ImportConfigurationModalOptions {
  instances: JiraInstance[];
  defaultBasePath?: string;
}

export class ImportConfigurationModal extends BaseModal<ImportModalResult> {
  private options: ImportConfigurationModalOptions;
  private discoveryService: ConfigDiscoveryService;

  private state: ImportWizardState = {
    currentStep: 1,
    selectedConfig: null,
    targetInstanceId: null,
    targetProjectKey: null,
    validationResult: null,
    diffPreview: null,
    confirmationChecked: false,
    applyOptions: {
      updateFieldContexts: true,
      updateFieldOptions: true,
      dryRun: false,
    },
  };

  private configs: ConfigurationReference[] = [];
  private projects: JiraProject[] = [];
  private isLoading: boolean = false;

  constructor(app: App, options: ImportConfigurationModalOptions) {
    super(app);
    this.options = options;
    this.discoveryService = new ConfigDiscoveryService(app);

    const enabledInstances = options.instances.filter(i => i.enabled);
    if (enabledInstances.length > 0) {
      const defaultInstance = enabledInstances.find(i => i.isDefault) || enabledInstances[0];
      this.state.targetInstanceId = defaultInstance.id;
    }
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'import-config-modal');

    this.renderHeader();
    this.renderContent();
  }

  private renderHeader(): void {
    const { contentEl } = this;

    const existingHeader = contentEl.querySelector('.wizard-header');
    if (existingHeader) existingHeader.remove();

    const header = contentEl.createDiv('wizard-header');

    header.createEl('h2', {
      text: 'Import Configuration',
      cls: 'modal-title',
    });

    const stepIndicator = header.createDiv('step-indicator');
    const steps = [
      { num: 1, label: 'Select' },
      { num: 2, label: 'Target' },
      { num: 3, label: 'Validate' },
      { num: 4, label: 'Preview' },
      { num: 5, label: 'Confirm' },
    ];

    for (const step of steps) {
      const stepEl = stepIndicator.createDiv('step');
      stepEl.textContent = String(step.num);

      if (step.num < this.state.currentStep) {
        stepEl.addClass('completed');
        setIcon(stepEl, 'check');
      } else if (step.num === this.state.currentStep) {
        stepEl.addClass('current');
      } else {
        stepEl.addClass('pending');
      }

      stepEl.setAttribute('title', step.label);
    }
  }

  private renderContent(): void {
    const { contentEl } = this;

    const existingContent = contentEl.querySelector('.wizard-content');
    if (existingContent) existingContent.remove();

    const existingFooter = contentEl.querySelector('.wizard-footer');
    if (existingFooter) existingFooter.remove();

    const content = contentEl.createDiv('wizard-content');

    switch (this.state.currentStep) {
      case 1:
        this.renderSelectConfigStep(content);
        break;
      case 2:
        this.renderSelectTargetStep(content);
        break;
      case 3:
        this.renderValidationStep(content);
        break;
      case 4:
        this.renderDiffPreviewStep(content);
        break;
      case 5:
        this.renderConfirmationStep(content);
        break;
    }

    this.renderFooter();
  }

  private renderSelectConfigStep(container: HTMLElement): void {
    container.createEl('h3', { text: 'Select Configuration' });
    container.createEl('p', {
      text: 'Choose an exported configuration to import.',
      cls: 'step-description',
    });

    const listContainer = container.createDiv('config-list');

    if (this.configs.length === 0 && !this.isLoading) {
      this.loadConfigs(listContainer);
    } else if (this.isLoading) {
      const loading = listContainer.createDiv('loading-state');
      setIcon(loading.createSpan('loading-icon'), 'loader');
      loading.createSpan({ text: 'Loading configurations...' });
    } else {
      this.renderConfigList(listContainer);
    }
  }

  private async loadConfigs(container: HTMLElement): Promise<void> {
    this.isLoading = true;
    container.empty();

    const loading = container.createDiv('loading-state');
    const iconSpan = loading.createSpan('loading-icon');
    setIcon(iconSpan, 'loader');
    iconSpan.addClass('spin');
    loading.createSpan({ text: 'Loading configurations...' });

    try {
      const basePath = this.options.defaultBasePath || 'Jira/Configs';
      this.configs = await this.discoveryService.discoverConfigs(basePath);
      this.isLoading = false;
      this.renderContent();
    } catch (error) {
      this.isLoading = false;
      container.empty();
      container.createEl('p', {
        text: `Failed to load configurations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        cls: 'error-text',
      });
    }
  }

  private renderConfigList(container: HTMLElement): void {
    if (this.configs.length === 0) {
      const empty = container.createDiv('empty-state');
      setIcon(empty.createSpan('empty-icon'), 'folder-open');
      empty.createEl('p', { text: 'No exported configurations found.' });
      empty.createEl('p', {
        text: 'Export a project configuration first using the Export command.',
        cls: 'text-muted',
      });
      return;
    }

    for (const config of this.configs) {
      const item = container.createDiv('config-item');
      if (this.state.selectedConfig?.id === config.id) {
        item.addClass('selected');
      }

      const info = item.createDiv('config-info');
      const nameRow = info.createDiv('config-name-row');
      nameRow.createSpan({ text: config.projectKey, cls: 'config-project-key' });
      nameRow.createSpan({ text: config.projectName, cls: 'config-project-name' });

      const meta = info.createDiv('config-meta');
      meta.createSpan({ text: config.instanceName, cls: 'config-instance' });
      meta.createSpan({ text: ' • ' });
      meta.createSpan({ text: this.formatDate(config.exportedAt), cls: 'config-date' });

      const stats = info.createDiv('config-stats');
      stats.createSpan({ text: `${config.fieldsCount} fields` });
      stats.createSpan({ text: ' • ' });
      stats.createSpan({ text: `${config.issueTypesCount} issue types` });
      stats.createSpan({ text: ' • ' });
      stats.createSpan({ text: `${config.workflowsCount} workflows` });
      if (config.boardsCount > 0) {
        stats.createSpan({ text: ' • ' });
        stats.createSpan({ text: `${config.boardsCount} boards` });
      }

      item.addEventListener('click', () => {
        this.state.selectedConfig = config;
        this.renderContent();
      });
    }
  }

  private renderSelectTargetStep(container: HTMLElement): void {
    container.createEl('h3', { text: 'Select Target' });
    container.createEl('p', {
      text: 'Choose where to import the configuration.',
      cls: 'step-description',
    });

    if (this.state.selectedConfig) {
      const sourceInfo = container.createDiv('source-info');
      sourceInfo.createEl('label', { text: 'Source:' });
      sourceInfo.createSpan({
        text: `${this.state.selectedConfig.projectKey} - ${this.state.selectedConfig.projectName}`,
      });
      sourceInfo.createSpan({
        text: ` (${this.state.selectedConfig.instanceName})`,
        cls: 'text-muted',
      });
    }

    const form = container.createDiv('modal-form');

    this.renderTargetInstanceDropdown(form);
    this.renderTargetProjectDropdown(form);
  }

  private renderTargetInstanceDropdown(container: HTMLElement): void {
    const fieldGroup = container.createDiv('field-group');
    fieldGroup.createEl('label', { text: 'Target Instance' });

    const dropdown = new DropdownComponent(fieldGroup);
    const enabledInstances = this.options.instances.filter(i => i.enabled);

    for (const instance of enabledInstances) {
      dropdown.addOption(instance.id, instance.name);
    }

    if (this.state.targetInstanceId) {
      dropdown.setValue(this.state.targetInstanceId);
    }

    dropdown.onChange(async value => {
      this.state.targetInstanceId = value;
      this.state.targetProjectKey = null;
      this.state.validationResult = null;
      this.state.diffPreview = null;
      this.projects = [];
      this.renderContent();
      await this.loadProjects();
    });

    if (this.state.targetInstanceId && this.projects.length === 0) {
      this.loadProjects();
    }
  }

  private renderTargetProjectDropdown(container: HTMLElement): void {
    const fieldGroup = container.createDiv('field-group');
    fieldGroup.createEl('label', { text: 'Target Project' });

    const dropdown = new DropdownComponent(fieldGroup);
    dropdown.addOption('', 'Select project...');

    if (this.projects.length === 0) {
      dropdown.setDisabled(true);
    } else {
      for (const project of this.projects) {
        dropdown.addOption(project.key, `${project.key} - ${project.name}`);
      }
      if (this.state.targetProjectKey) {
        dropdown.setValue(this.state.targetProjectKey);
      }
    }

    dropdown.onChange(value => {
      this.state.targetProjectKey = value || null;
      this.state.validationResult = null;
      this.state.diffPreview = null;
      this.renderFooter();
    });
  }

  private async loadProjects(): Promise<void> {
    if (!this.state.targetInstanceId) return;

    const instance = this.options.instances.find(i => i.id === this.state.targetInstanceId);
    if (!instance) return;

    try {
      const client = new JiraClient(instance);
      this.projects = await client.getProjects();
      this.renderContent();
    } catch (error) {
      new Notice(`Failed to load projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private renderValidationStep(container: HTMLElement): void {
    container.createEl('h3', { text: 'Validation' });
    container.createEl('p', {
      text: 'Checking compatibility with the target project.',
      cls: 'step-description',
    });

    if (!this.state.validationResult && !this.isLoading) {
      this.runValidation(container);
    } else if (this.isLoading) {
      const loading = container.createDiv('loading-state');
      const iconSpan = loading.createSpan('loading-icon');
      setIcon(iconSpan, 'loader');
      iconSpan.addClass('spin');
      loading.createSpan({ text: 'Running validation...' });
    } else if (this.state.validationResult) {
      this.renderValidationResults(container, this.state.validationResult);
    }
  }

  private async runValidation(container: HTMLElement): Promise<void> {
    if (!this.state.selectedConfig || !this.state.targetInstanceId || !this.state.targetProjectKey) {
      return;
    }

    this.isLoading = true;
    container.empty();

    const loading = container.createDiv('loading-state');
    const iconSpan = loading.createSpan('loading-icon');
    setIcon(iconSpan, 'loader');
    iconSpan.addClass('spin');
    loading.createSpan({ text: 'Running validation...' });

    try {
      const config = await this.discoveryService.getConfigByPath(this.state.selectedConfig.folderPath);
      if (!config) {
        throw new Error('Failed to load configuration');
      }

      const instance = this.options.instances.find(i => i.id === this.state.targetInstanceId);
      if (!instance) {
        throw new Error('Instance not found');
      }

      const client = new JiraClient(instance);
      const validationService = new ConfigurationValidationService(client);

      this.state.validationResult = await validationService.validate(config, this.state.targetProjectKey!);
      this.state.diffPreview = this.state.validationResult.diff;
      this.isLoading = false;
      this.renderContent();
    } catch (error) {
      this.isLoading = false;
      container.empty();
      container.createEl('p', {
        text: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        cls: 'error-text',
      });
    }
  }

  private renderValidationResults(container: HTMLElement, result: ValidationResult): void {
    const summary = container.createDiv('validation-summary');

    if (result.compatible) {
      summary.addClass('compatible');
      const iconSpan = summary.createSpan('summary-icon');
      setIcon(iconSpan, 'check-circle');
      summary.createSpan({ text: 'Configuration is compatible', cls: 'summary-text' });
    } else {
      summary.addClass('incompatible');
      const iconSpan = summary.createSpan('summary-icon');
      setIcon(iconSpan, 'x-circle');
      summary.createSpan({ text: 'Configuration is not compatible', cls: 'summary-text' });
    }

    const checks = container.createDiv('validation-checks');

    for (const check of result.checks) {
      const checkEl = checks.createDiv('validation-check');
      checkEl.addClass(check.status);

      const iconSpan = checkEl.createSpan('check-icon');
      if (check.status === 'pass') {
        setIcon(iconSpan, 'check');
      } else if (check.status === 'warning') {
        setIcon(iconSpan, 'alert-triangle');
      } else {
        setIcon(iconSpan, 'x');
      }

      const content = checkEl.createDiv('check-content');
      content.createSpan({ text: check.name, cls: 'check-name' });
      content.createSpan({ text: check.message, cls: 'check-message' });

      if (check.details && check.details.length > 0) {
        const details = content.createDiv('check-details');
        for (const detail of check.details.slice(0, 5)) {
          details.createDiv({ text: `• ${detail}`, cls: 'detail-item' });
        }
        if (check.details.length > 5) {
          details.createDiv({
            text: `... and ${check.details.length - 5} more`,
            cls: 'detail-item text-muted',
          });
        }
      }
    }
  }

  private renderDiffPreviewStep(container: HTMLElement): void {
    container.createEl('h3', { text: 'Changes Preview' });
    container.createEl('p', {
      text: 'Review the changes that will be applied.',
      cls: 'step-description',
    });

    if (!this.state.diffPreview) {
      container.createEl('p', {
        text: 'No changes to preview.',
        cls: 'text-muted',
      });
      return;
    }

    this.renderDiff(container, this.state.diffPreview);
  }

  private renderDiff(container: HTMLElement, diff: ConfigurationDiff): void {
    const summary = container.createDiv('diff-summary');

    const counts = {
      new: diff.fields.new.length + diff.issueTypes.new.length + diff.workflows.new.length + diff.boards.new.length,
      modified:
        diff.fields.modified.length + diff.issueTypes.modified.length + diff.workflows.modified.length + diff.boards.modified.length,
      skipped: diff.fields.skipped.length + diff.issueTypes.skipped.length + diff.workflows.skipped.length + diff.boards.skipped.length,
      unchanged:
        diff.fields.unchanged.length + diff.issueTypes.unchanged.length + diff.workflows.unchanged.length + diff.boards.unchanged.length,
    };

    if (counts.new > 0) {
      const item = summary.createSpan('diff-count new');
      setIcon(item.createSpan(), 'plus');
      item.createSpan({ text: `${counts.new} new` });
    }
    if (counts.modified > 0) {
      const item = summary.createSpan('diff-count modified');
      setIcon(item.createSpan(), 'edit');
      item.createSpan({ text: `${counts.modified} modified` });
    }
    if (counts.skipped > 0) {
      const item = summary.createSpan('diff-count manual');
      setIcon(item.createSpan(), 'alert-circle');
      item.createSpan({ text: `${counts.skipped} manual setup` });
    }

    const sections = container.createDiv('diff-sections');

    this.renderDiffSection(sections, 'Fields', diff.fields);
    this.renderDiffSection(sections, 'Issue Types', diff.issueTypes);
    this.renderDiffSection(sections, 'Workflows', diff.workflows);
    this.renderDiffSection(sections, 'Boards', diff.boards);
  }

  private renderDiffSection<T extends { name?: string; id: string }>(
    container: HTMLElement,
    title: string,
    category: {
      new: { item: T; reason?: string }[];
      modified: { item: T; reason?: string }[];
      skipped: { item: T; reason?: string }[];
      unchanged: { item: T; reason?: string }[];
    },
  ): void {
    const actionable = category.new.length + category.modified.length + category.skipped.length;
    if (actionable === 0) return;

    const section = container.createDiv('diff-section');
    const header = section.createDiv('diff-section-header');
    header.createSpan({ text: title, cls: 'section-title' });
    header.createSpan({ text: `(${actionable})`, cls: 'section-count' });

    const content = section.createDiv('diff-section-content');
    let isExpanded = false;

    header.addEventListener('click', () => {
      isExpanded = !isExpanded;
      content.toggleClass('collapsed', !isExpanded);
      header.toggleClass('expanded', isExpanded);
    });

    content.addClass('collapsed');

    for (const item of category.new) {
      this.renderDiffItem(content, item, 'new');
    }
    for (const item of category.modified) {
      this.renderDiffItem(content, item, 'modified');
    }
    for (const item of category.skipped) {
      this.renderDiffItem(content, item, 'manual');
    }
  }

  private renderDiffItem<T extends { name?: string; id: string }>(
    container: HTMLElement,
    item: { item: T; reason?: string },
    status: 'new' | 'modified' | 'manual',
  ): void {
    const el = container.createDiv('diff-item');
    el.addClass(status);

    const iconSpan = el.createSpan('diff-icon');
    if (status === 'new') {
      setIcon(iconSpan, 'plus');
    } else if (status === 'modified') {
      setIcon(iconSpan, 'edit');
    } else {
      setIcon(iconSpan, 'alert-circle');
    }

    el.createSpan({ text: item.item.name || item.item.id, cls: 'diff-name' });

    if (item.reason) {
      el.createSpan({ text: item.reason, cls: 'diff-reason' });
    }
  }

  private renderConfirmationStep(container: HTMLElement): void {
    container.createEl('h3', { text: 'Confirm Import' });
    container.createEl('p', {
      text: 'Review and confirm the import.',
      cls: 'step-description',
    });

    const summaryBox = container.createDiv('confirmation-summary');

    const sourceRow = summaryBox.createDiv('summary-row');
    sourceRow.createSpan({ text: 'Source:', cls: 'label' });
    sourceRow.createSpan({
      text: `${this.state.selectedConfig?.projectKey} (${this.state.selectedConfig?.instanceName})`,
    });

    const targetRow = summaryBox.createDiv('summary-row');
    targetRow.createSpan({ text: 'Target:', cls: 'label' });
    const targetInstance = this.options.instances.find(i => i.id === this.state.targetInstanceId);
    targetRow.createSpan({
      text: `${this.state.targetProjectKey} (${targetInstance?.name || ''})`,
    });

    if (this.state.diffPreview) {
      const changesRow = summaryBox.createDiv('summary-row');
      changesRow.createSpan({ text: 'Changes:', cls: 'label' });
      const modified =
        this.state.diffPreview.fields.modified.length +
        this.state.diffPreview.issueTypes.modified.length +
        this.state.diffPreview.workflows.modified.length +
        this.state.diffPreview.boards.modified.length;
      const newItems =
        this.state.diffPreview.fields.new.length +
        this.state.diffPreview.issueTypes.new.length +
        this.state.diffPreview.workflows.new.length +
        this.state.diffPreview.boards.new.length;
      changesRow.createSpan({ text: `${newItems} new, ${modified} modified` });
    }

    this.renderApplyOptions(container);

    const confirmBox = container.createDiv('confirmation-checkbox');
    const checkbox = confirmBox.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.state.confirmationChecked;
    confirmBox.createEl('label', {
      text: 'I understand that this will modify the target project configuration',
    });

    checkbox.addEventListener('change', () => {
      this.state.confirmationChecked = checkbox.checked;
      this.renderFooter();
    });
  }

  private renderApplyOptions(container: HTMLElement): void {
    const optionsBox = container.createDiv('apply-options');
    optionsBox.createEl('h4', { text: 'Import Options' });

    const options: { key: keyof ApplyOptions; label: string; description: string }[] = [
      {
        key: 'updateFieldContexts',
        label: 'Update field contexts',
        description: 'Update which issue types each field applies to',
      },
      {
        key: 'updateFieldOptions',
        label: 'Update field options',
        description: 'Add missing options to select fields',
      },
      {
        key: 'dryRun',
        label: 'Dry run (preview only)',
        description: 'Show what would change without making actual changes',
      },
    ];

    for (const opt of options) {
      const item = optionsBox.createDiv('option-item');
      const checkbox = item.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.state.applyOptions[opt.key];

      const label = item.createDiv('option-label');
      label.createSpan({ text: opt.label, cls: 'option-name' });
      label.createSpan({ text: opt.description, cls: 'option-description' });

      checkbox.addEventListener('change', () => {
        this.state.applyOptions[opt.key] = checkbox.checked;
      });
    }
  }

  private renderFooter(): void {
    const { contentEl } = this;

    const existingFooter = contentEl.querySelector('.wizard-footer');
    if (existingFooter) existingFooter.remove();

    const footer = contentEl.createDiv('wizard-footer');
    const leftButtons = footer.createDiv('footer-left');
    const rightButtons = footer.createDiv('footer-right');

    leftButtons
      .createEl('button', {
        text: 'Cancel',
        cls: 'modal-button',
      })
      .addEventListener('click', () => this.cancel());

    if (this.state.currentStep > 1) {
      leftButtons
        .createEl('button', {
          text: 'Back',
          cls: 'modal-button',
        })
        .addEventListener('click', () => this.goToStep((this.state.currentStep - 1) as ImportWizardStep));
    }

    if (this.state.currentStep < 5) {
      const nextBtn = rightButtons.createEl('button', {
        text: 'Next',
        cls: 'modal-button mod-cta',
      });
      nextBtn.disabled = !this.canProceed();
      nextBtn.addEventListener('click', () => this.goToStep((this.state.currentStep + 1) as ImportWizardStep));
    } else {
      const applyBtn = rightButtons.createEl('button', {
        text: this.state.applyOptions.dryRun ? 'Preview Changes' : 'Apply Import',
        cls: 'modal-button mod-cta',
      });
      applyBtn.disabled = !this.state.confirmationChecked;
      applyBtn.addEventListener('click', () => this.applyImport());
    }
  }

  private canProceed(): boolean {
    switch (this.state.currentStep) {
      case 1:
        return this.state.selectedConfig !== null;
      case 2:
        return this.state.targetInstanceId !== null && this.state.targetProjectKey !== null;
      case 3:
        return this.state.validationResult?.compatible === true;
      case 4:
        return true;
      case 5:
        return this.state.confirmationChecked;
      default:
        return false;
    }
  }

  private goToStep(step: ImportWizardStep): void {
    this.state.currentStep = step;
    this.renderHeader();
    this.renderContent();
  }

  private async applyImport(): Promise<void> {
    if (!this.state.selectedConfig || !this.state.targetInstanceId || !this.state.targetProjectKey || !this.state.diffPreview) {
      new Notice('Missing required data for import');
      return;
    }

    const { contentEl } = this;
    const existingContent = contentEl.querySelector('.wizard-content');
    if (existingContent) {
      existingContent.empty();
      const loading = existingContent.createDiv('loading-state');
      const iconSpan = loading.createSpan('loading-icon');
      setIcon(iconSpan, 'loader');
      iconSpan.addClass('spin');
      loading.createSpan({ text: 'Applying configuration...' });
    }

    try {
      const config = await this.discoveryService.getConfigByPath(this.state.selectedConfig.folderPath);
      if (!config) {
        throw new Error('Failed to load configuration');
      }

      const instance = this.options.instances.find(i => i.id === this.state.targetInstanceId);
      if (!instance) {
        throw new Error('Instance not found');
      }

      const client = new JiraClient(instance);
      const applyService = new ConfigurationApplyService(this.app, client);

      const result = await applyService.apply(config, this.state.targetProjectKey!, this.state.diffPreview, this.state.applyOptions);

      let appliedCount = 0;
      let skippedCount = 0;

      for (const stepResult of result.results) {
        for (const itemResult of stepResult.results) {
          if (itemResult.status === 'success') {
            appliedCount++;
          } else if (itemResult.status === 'skipped') {
            skippedCount++;
          }
        }
      }

      if (result.success) {
        new Notice(`Configuration imported successfully. ${appliedCount} items applied.`);
      } else {
        new Notice(`Configuration import completed with errors. Check the results.`);
      }

      this.submit({
        success: result.success,
        backupPath: result.backupPath,
        appliedCount,
        skippedCount,
        manualSteps: result.manualSteps,
      });
    } catch (error) {
      new Notice(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (existingContent) {
        existingContent.empty();
        existingContent.createEl('p', {
          text: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cls: 'error-text',
        });
      }
    }
  }

  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }
}
