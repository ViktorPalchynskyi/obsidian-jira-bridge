import { App, Notice, DropdownComponent, setIcon } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import type { JiraInstance, JiraIssueType, JiraProject } from '../../types';
import type { ExportModalResult, ExportProgress } from '../../types/configExport.types';
import { JiraClient } from '../../api/JiraClient';
import { FieldExportService } from '../../services/configExport';

interface ExportFieldConfigModalOptions {
  instances: JiraInstance[];
  pluginVersion: string;
  defaultBasePath?: string;
}

type ExportPhase = 'select' | 'progress' | 'complete' | 'error';

export class ExportFieldConfigModal extends BaseModal<ExportModalResult> {
  private options: ExportFieldConfigModalOptions;
  private phase: ExportPhase = 'select';

  private selectedInstance: JiraInstance | null = null;
  private selectedProject: JiraProject | null = null;
  private selectedIssueTypes: Set<string> = new Set();

  private projects: JiraProject[] = [];
  private issueTypes: JiraIssueType[] = [];

  private projectDropdown: DropdownComponent | null = null;
  private issueTypeContainer: HTMLElement | null = null;
  private exportButton: HTMLButtonElement | null = null;
  private progressContainer: HTMLElement | null = null;

  private resultPath: string = '';
  private errorMessage: string = '';

  constructor(app: App, options: ExportFieldConfigModalOptions) {
    super(app);
    this.options = options;

    const enabledInstances = options.instances.filter(i => i.enabled);
    if (enabledInstances.length > 0) {
      this.selectedInstance = enabledInstances.find(i => i.isDefault) || enabledInstances[0];
    }
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'export-config-modal');

    contentEl.createEl('h2', {
      text: 'Export Field Configuration',
      cls: 'modal-title',
    });

    this.renderContent();
  }

  private renderContent(): void {
    const { contentEl } = this;
    const existingContent = contentEl.querySelector('.modal-content');
    if (existingContent) {
      existingContent.remove();
    }

    const content = contentEl.createDiv('modal-content');

    switch (this.phase) {
      case 'select':
        this.renderSelectPhase(content);
        break;
      case 'progress':
        this.renderProgressPhase(content);
        break;
      case 'complete':
        this.renderCompletePhase(content);
        break;
      case 'error':
        this.renderErrorPhase(content);
        break;
    }
  }

  private renderSelectPhase(container: HTMLElement): void {
    const form = container.createDiv('modal-form');

    this.renderInstanceDropdown(form);
    this.renderProjectDropdown(form);
    this.renderIssueTypeSelection(form);
    this.renderButtons(container);

    if (this.selectedInstance) {
      this.loadProjects();
    }
  }

  private renderInstanceDropdown(container: HTMLElement): void {
    const fieldGroup = container.createDiv('field-group');
    fieldGroup.createEl('label', { text: 'Jira Instance' });

    const dropdown = new DropdownComponent(fieldGroup);
    const enabledInstances = this.options.instances.filter(i => i.enabled);

    for (const instance of enabledInstances) {
      dropdown.addOption(instance.id, instance.name);
    }

    if (this.selectedInstance) {
      dropdown.setValue(this.selectedInstance.id);
    }

    dropdown.onChange(async value => {
      this.selectedInstance = enabledInstances.find(i => i.id === value) || null;
      this.selectedProject = null;
      this.selectedIssueTypes.clear();
      this.projects = [];
      this.issueTypes = [];

      if (this.projectDropdown) {
        this.projectDropdown.selectEl.empty();
        this.projectDropdown.addOption('', 'Loading...');
      }

      this.updateIssueTypeCheckboxes();
      this.updateExportButton();

      await this.loadProjects();
    });
  }

  private renderProjectDropdown(container: HTMLElement): void {
    const fieldGroup = container.createDiv('field-group');
    fieldGroup.createEl('label', { text: 'Project' });

    this.projectDropdown = new DropdownComponent(fieldGroup);
    this.projectDropdown.addOption('', 'Select project...');
    this.projectDropdown.setDisabled(true);

    this.projectDropdown.onChange(async value => {
      this.selectedProject = this.projects.find(p => p.key === value) || null;
      this.selectedIssueTypes.clear();
      this.issueTypes = [];

      this.updateIssueTypeCheckboxes();
      this.updateExportButton();

      if (this.selectedProject) {
        await this.loadIssueTypes(this.selectedProject.key);
      }
    });
  }

  private renderIssueTypeSelection(container: HTMLElement): void {
    const fieldGroup = container.createDiv('field-group');
    fieldGroup.createEl('label', { text: 'Issue Types' });

    this.issueTypeContainer = fieldGroup.createDiv('issue-type-checkboxes');
    this.issueTypeContainer.createEl('span', {
      text: 'Select a project first',
      cls: 'text-muted',
    });
  }

  private renderButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv('modal-buttons');

    buttonContainer
      .createEl('button', {
        text: 'Cancel',
        cls: 'modal-button',
      })
      .addEventListener('click', () => this.cancel());

    this.exportButton = buttonContainer.createEl('button', {
      text: 'Export',
      cls: 'modal-button mod-cta',
    });
    this.exportButton.disabled = true;
    this.exportButton.addEventListener('click', () => this.startExport());
  }

  private async loadProjects(): Promise<void> {
    if (!this.selectedInstance || !this.projectDropdown) return;

    try {
      const client = new JiraClient(this.selectedInstance);
      this.projects = await client.getProjects();

      this.projectDropdown.selectEl.empty();
      this.projectDropdown.addOption('', 'Select project...');

      for (const project of this.projects) {
        this.projectDropdown.addOption(project.key, `${project.key} - ${project.name}`);
      }

      this.projectDropdown.setDisabled(false);
    } catch (error) {
      new Notice(`Failed to load projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async loadIssueTypes(projectKey: string): Promise<void> {
    if (!this.selectedInstance) return;

    try {
      const client = new JiraClient(this.selectedInstance);
      this.issueTypes = await client.getIssueTypes(projectKey);
      this.updateIssueTypeCheckboxes();
    } catch (error) {
      new Notice(`Failed to load issue types: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private updateIssueTypeCheckboxes(): void {
    if (!this.issueTypeContainer) return;

    this.issueTypeContainer.empty();

    if (this.issueTypes.length === 0) {
      this.issueTypeContainer.createEl('span', {
        text: this.selectedProject ? 'Loading issue types...' : 'Select a project first',
        cls: 'text-muted',
      });
      return;
    }

    const selectAllContainer = this.issueTypeContainer.createDiv('select-all-container');
    const selectAllCheckbox = selectAllContainer.createEl('input', { type: 'checkbox' });
    selectAllContainer.createEl('label', { text: 'Select all' });

    selectAllCheckbox.addEventListener('change', () => {
      if (selectAllCheckbox.checked) {
        for (const it of this.issueTypes) {
          this.selectedIssueTypes.add(it.id);
        }
      } else {
        this.selectedIssueTypes.clear();
      }
      this.updateCheckboxStates();
      this.updateExportButton();
    });

    const checkboxesContainer = this.issueTypeContainer.createDiv('checkboxes-grid');

    for (const issueType of this.issueTypes) {
      const item = checkboxesContainer.createDiv('checkbox-label');
      const checkbox = item.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.selectedIssueTypes.has(issueType.id);
      checkbox.dataset.id = issueType.id;

      item.createEl('label', { text: issueType.name });

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedIssueTypes.add(issueType.id);
        } else {
          this.selectedIssueTypes.delete(issueType.id);
        }
        this.updateSelectAllState(selectAllCheckbox);
        this.updateExportButton();
      });
    }
  }

  private updateCheckboxStates(): void {
    if (!this.issueTypeContainer) return;

    const checkboxes = this.issueTypeContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-id]');
    Array.from(checkboxes).forEach(cb => {
      cb.checked = this.selectedIssueTypes.has(cb.dataset.id || '');
    });
  }

  private updateSelectAllState(selectAllCheckbox: HTMLInputElement): void {
    selectAllCheckbox.checked = this.selectedIssueTypes.size === this.issueTypes.length && this.issueTypes.length > 0;
    selectAllCheckbox.indeterminate = this.selectedIssueTypes.size > 0 && this.selectedIssueTypes.size < this.issueTypes.length;
  }

  private updateExportButton(): void {
    if (!this.exportButton) return;
    this.exportButton.disabled = !this.selectedInstance || !this.selectedProject || this.selectedIssueTypes.size === 0;
  }

  private async startExport(): Promise<void> {
    if (!this.selectedInstance || !this.selectedProject) return;

    this.phase = 'progress';
    this.renderContent();

    try {
      const service = new FieldExportService(this.app, this.selectedInstance, this.options.pluginVersion);

      const config = await service.exportFieldConfig(this.selectedProject.key, Array.from(this.selectedIssueTypes), progress =>
        this.updateProgress(progress),
      );

      const basePath = this.options.defaultBasePath || 'Jira/Configs';
      this.resultPath = await service.saveToVault(config, basePath);

      this.phase = 'complete';
      this.renderContent();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.phase = 'error';
      this.renderContent();
    }
  }

  private renderProgressPhase(container: HTMLElement): void {
    this.progressContainer = container.createDiv('export-progress');

    const spinner = this.progressContainer.createDiv('progress-spinner');
    setIcon(spinner, 'loader');
    spinner.addClass('spin');

    this.progressContainer.createEl('p', {
      text: 'Starting export...',
      cls: 'progress-text',
    });

    const progressBar = this.progressContainer.createDiv('progress-bar');
    progressBar.createDiv('progress-fill');
  }

  private updateProgress(progress: ExportProgress): void {
    if (!this.progressContainer) return;

    const text = this.progressContainer.querySelector('.progress-text');
    if (text) {
      text.textContent = progress.detail ? `${progress.step} (${progress.detail})` : progress.step;
    }

    const fill = this.progressContainer.querySelector<HTMLElement>('.progress-fill');
    if (fill && progress.total > 0) {
      const percent = (progress.current / progress.total) * 100;
      fill.style.width = `${percent}%`;
    }
  }

  private renderCompletePhase(container: HTMLElement): void {
    const successDiv = container.createDiv('export-success');

    const iconDiv = successDiv.createDiv('success-icon');
    setIcon(iconDiv, 'check-circle');

    successDiv.createEl('h3', { text: 'Export Complete!' });
    successDiv.createEl('p', { text: `Configuration saved to:` });
    successDiv.createEl('code', { text: this.resultPath });

    const buttonContainer = container.createDiv('modal-buttons');

    buttonContainer
      .createEl('button', {
        text: 'Open Folder',
        cls: 'modal-button',
      })
      .addEventListener('click', () => {
        const folder = this.app.vault.getAbstractFileByPath(this.resultPath);
        if (folder) {
          const leaf = this.app.workspace.getLeaf();
          const firstFile = this.app.vault.getAbstractFileByPath(`${this.resultPath}/fields.md`);
          if (firstFile) {
            leaf.openFile(firstFile as never);
          }
        }
        this.submit({ folderPath: this.resultPath, projectKey: this.selectedProject?.key || '' });
      });

    buttonContainer
      .createEl('button', {
        text: 'Close',
        cls: 'modal-button mod-cta',
      })
      .addEventListener('click', () => {
        this.submit({ folderPath: this.resultPath, projectKey: this.selectedProject?.key || '' });
      });
  }

  private renderErrorPhase(container: HTMLElement): void {
    const errorDiv = container.createDiv('export-error');

    const iconDiv = errorDiv.createDiv('error-icon');
    setIcon(iconDiv, 'x-circle');

    errorDiv.createEl('h3', { text: 'Export Failed' });
    errorDiv.createEl('p', { text: this.errorMessage });

    const buttonContainer = container.createDiv('modal-buttons');

    buttonContainer
      .createEl('button', {
        text: 'Try Again',
        cls: 'modal-button',
      })
      .addEventListener('click', () => {
        this.phase = 'select';
        this.renderContent();
      });

    buttonContainer
      .createEl('button', {
        text: 'Close',
        cls: 'modal-button mod-cta',
      })
      .addEventListener('click', () => this.cancel());
  }
}
