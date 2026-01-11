import { App } from 'obsidian';
import { BaseModal } from '../../../../modals/base/BaseModal';
import { FolderSuggestModal } from '../FolderSuggestModal/FolderSuggestModal';
import { JiraClient } from '../../../../api';
import type { FolderMapping, JiraProject } from '../../../../types';
import type { FolderMappingModalOptions, FormState } from './types';

export class FolderMappingModal extends BaseModal<FolderMapping> {
  private options: FolderMappingModalOptions;
  private state: FormState = {
    folderPath: '',
    instanceId: '',
    projectKey: '',
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
  };
  private folderInput: HTMLInputElement | null = null;
  private instanceSelect: HTMLSelectElement | null = null;
  private projectSelect: HTMLSelectElement | null = null;
  private submitButton: HTMLButtonElement | null = null;
  private projectContainer: HTMLElement | null = null;

  constructor(app: App, options: FolderMappingModalOptions) {
    super(app);
    this.options = options;
    if (options.mapping) {
      this.state.folderPath = options.mapping.folderPath;
      this.state.instanceId = options.mapping.instanceId || '';
      this.state.projectKey = options.mapping.projectKey || '';
    }
    if (options.parentInstanceId) {
      this.state.instanceId = options.parentInstanceId;
    }
  }

  build(): void {
    const { contentEl } = this;
    const isEdit = this.options.mode === 'edit';
    const isInstanceMapping = this.options.mappingType === 'instance';

    contentEl.addClass('jira-bridge-modal', 'jira-bridge-folder-mapping-modal');

    const title = isEdit
      ? isInstanceMapping
        ? 'Edit Instance Mapping'
        : 'Edit Project Mapping'
      : isInstanceMapping
        ? 'Add Instance Mapping'
        : 'Add Project Mapping';

    contentEl.createEl('h2', { text: title, cls: 'modal-title' });

    const form = contentEl.createEl('div', { cls: 'modal-form' });

    this.createFolderField(form);

    if (isInstanceMapping) {
      this.createInstanceField(form);
    } else {
      this.createInstanceInfo(form);
      this.createProjectField(form);
      this.loadProjects();
    }

    const buttonContainer = contentEl.createEl('div', { cls: 'modal-buttons' });

    buttonContainer.createEl('button', { text: 'Cancel', cls: 'modal-button' }).addEventListener('click', () => {
      this.cancel();
    });

    this.submitButton = buttonContainer.createEl('button', {
      text: isEdit ? 'Save' : 'Add',
      cls: 'modal-button mod-cta',
    });
    this.submitButton.disabled = true;
    this.submitButton.addEventListener('click', () => {
      this.handleSubmit();
    });

    this.updateSubmitButtonState();
  }

  private createFolderField(container: HTMLElement): void {
    const fieldGroup = container.createEl('div', { cls: 'field-group' });
    fieldGroup.createEl('label', { text: 'Folder' });

    const inputContainer = fieldGroup.createEl('div', { cls: 'folder-input-container' });

    this.folderInput = inputContainer.createEl('input', {
      type: 'text',
      cls: 'field-input',
      attr: { placeholder: 'Select a folder...', readonly: 'true' },
    });
    this.folderInput.value = this.state.folderPath;

    const browseButton = inputContainer.createEl('button', {
      text: 'Browse',
      cls: 'modal-button browse-button',
    });
    browseButton.addEventListener('click', async () => {
      await this.openFolderPicker();
    });

    fieldGroup.createEl('span', { cls: 'field-error', attr: { 'data-error': 'folder' } });
  }

  private createInstanceInfo(container: HTMLElement): void {
    const instance = this.options.instances.find(i => i.id === this.state.instanceId);
    if (!instance) return;

    const fieldGroup = container.createEl('div', { cls: 'field-group' });
    fieldGroup.createEl('label', { text: 'Jira Instance' });
    fieldGroup.createEl('div', { text: instance.name, cls: 'field-value' });
  }

  private createInstanceField(container: HTMLElement): void {
    const fieldGroup = container.createEl('div', { cls: 'field-group' });
    fieldGroup.createEl('label', { text: 'Jira Instance' });

    this.instanceSelect = fieldGroup.createEl('select', { cls: 'field-select' });

    const defaultOption = this.instanceSelect.createEl('option', {
      text: 'Select an instance...',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });

    for (const instance of this.options.instances) {
      const option = this.instanceSelect.createEl('option', {
        text: instance.name,
        attr: { value: instance.id },
      });
      if (this.state.instanceId === instance.id) {
        option.selected = true;
        defaultOption.selected = false;
      }
    }

    this.instanceSelect.addEventListener('change', () => {
      this.state.instanceId = this.instanceSelect!.value;
      this.updateSubmitButtonState();
    });

    fieldGroup.createEl('span', { cls: 'field-error', attr: { 'data-error': 'instance' } });
  }

  private createProjectField(container: HTMLElement): void {
    this.projectContainer = container.createEl('div', { cls: 'field-group' });
    this.projectContainer.createEl('label', { text: 'Jira Project' });

    this.projectSelect = this.projectContainer.createEl('select', { cls: 'field-select' });

    this.projectSelect.createEl('option', {
      text: 'Loading projects...',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });

    this.projectSelect.addEventListener('change', () => {
      this.state.projectKey = this.projectSelect!.value;
      this.updateSubmitButtonState();
    });

    this.projectContainer.createEl('span', { cls: 'field-error', attr: { 'data-error': 'project' } });
  }

  private async loadProjects(): Promise<void> {
    if (!this.state.instanceId || !this.projectSelect) return;

    this.state.isLoadingProjects = true;
    this.state.projectsError = null;
    this.projectSelect.innerHTML = '';
    this.projectSelect.createEl('option', {
      text: 'Loading projects...',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });

    const instance = this.options.instances.find(i => i.id === this.state.instanceId);
    if (!instance) {
      this.state.projectsError = 'Instance not found';
      this.updateProjectSelectError();
      return;
    }

    try {
      const client = new JiraClient(instance);
      const projects = await client.getProjects();
      this.state.projects = projects;
      this.state.isLoadingProjects = false;
      this.updateProjectSelect(projects);
    } catch (error) {
      this.state.isLoadingProjects = false;
      this.state.projectsError = error instanceof Error ? error.message : 'Failed to load projects';
      this.updateProjectSelectError();
    }
  }

  private updateProjectSelect(projects: JiraProject[]): void {
    if (!this.projectSelect) return;

    this.projectSelect.innerHTML = '';

    if (projects.length === 0) {
      this.projectSelect.createEl('option', {
        text: 'No projects found',
        attr: { value: '', disabled: 'true', selected: 'true' },
      });
      return;
    }

    const defaultOption = this.projectSelect.createEl('option', {
      text: 'Select a project...',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });

    for (const project of projects) {
      const option = this.projectSelect.createEl('option', {
        text: `${project.key} - ${project.name}`,
        attr: { value: project.key },
      });
      if (this.state.projectKey === project.key) {
        option.selected = true;
        defaultOption.selected = false;
      }
    }

    this.updateSubmitButtonState();
  }

  private updateProjectSelectError(): void {
    if (!this.projectSelect) return;

    this.projectSelect.innerHTML = '';
    this.projectSelect.createEl('option', {
      text: this.state.projectsError || 'Error loading projects',
      attr: { value: '', disabled: 'true', selected: 'true' },
    });
  }

  private async openFolderPicker(): Promise<void> {
    const basePath = this.options.mappingType === 'project' ? this.options.baseFolderPath : undefined;
    const modal = new FolderSuggestModal(this.app, basePath);
    const selectedPath = await modal.open();

    if (selectedPath !== null && this.folderInput) {
      this.state.folderPath = selectedPath;
      this.folderInput.value = selectedPath;
      this.validateFolderSelection();
      this.updateSubmitButtonState();
    }
  }

  private validateFolderSelection(): boolean {
    const errorEl = this.contentEl.querySelector('[data-error="folder"]');

    if (this.options.mappingType === 'project') {
      const isInsideInstanceMapping = this.options.existingMappings.some(
        m => m.type === 'instance' && this.state.folderPath.startsWith(m.folderPath),
      );

      if (!isInsideInstanceMapping) {
        if (errorEl) {
          errorEl.textContent = 'Folder must be inside an instance-mapped folder';
          errorEl.addClass('visible');
        }
        return false;
      }
    }

    const isDuplicate = this.options.existingMappings.some(
      m => m.folderPath === this.state.folderPath && m.id !== this.options.mapping?.id,
    );

    if (isDuplicate) {
      if (errorEl) {
        errorEl.textContent = 'This folder already has a mapping';
        errorEl.addClass('visible');
      }
      return false;
    }

    if (errorEl) {
      errorEl.textContent = '';
      errorEl.removeClass('visible');
    }
    return true;
  }

  private updateSubmitButtonState(): void {
    if (!this.submitButton) return;

    const isInstanceMapping = this.options.mappingType === 'instance';
    const hasFolderPath = this.state.folderPath.length > 0;
    const hasInstance = isInstanceMapping ? this.state.instanceId.length > 0 : true;
    const hasProject = isInstanceMapping ? true : this.state.projectKey.length > 0;
    const isValid = this.validateFolderSelection();

    this.submitButton.disabled = !(hasFolderPath && hasInstance && hasProject && isValid);
  }

  private handleSubmit(): void {
    const isEdit = this.options.mode === 'edit' && this.options.mapping;
    const isInstanceMapping = this.options.mappingType === 'instance';

    const mapping: FolderMapping = {
      id: isEdit ? this.options.mapping!.id : crypto.randomUUID(),
      folderPath: this.state.folderPath,
      type: this.options.mappingType,
      instanceId: isInstanceMapping ? this.state.instanceId : undefined,
      projectKey: isInstanceMapping ? undefined : this.state.projectKey,
      enabled: isEdit ? this.options.mapping!.enabled : true,
    };

    this.submit(mapping);
  }
}
