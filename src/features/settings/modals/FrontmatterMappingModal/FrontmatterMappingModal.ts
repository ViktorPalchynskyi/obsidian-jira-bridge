import { App } from 'obsidian';
import { BaseModal } from '../../../../ui/modals/BaseModal/BaseModal';
import type { FrontmatterFieldMapping, BuiltInFieldType, ProjectMappingConfig } from '../../../../types';
import type { FrontmatterMappingModalOptions, FrontmatterMappingModalResult, FieldOption } from './types';
import { DEFAULT_CONTENT_PARSING } from '../../../../constants/defaults';

const BUILT_IN_FIELDS: { type: BuiltInFieldType; label: string }[] = [
  { type: 'issue_type', label: 'Issue Type' },
  { type: 'labels', label: 'Labels' },
  { type: 'parent', label: 'Parent' },
  { type: 'priority', label: 'Priority' },
];

const BUILT_IN_FIELD_TYPE_SET: Record<BuiltInFieldType, true> = {
  issue_type: true,
  labels: true,
  parent: true,
  priority: true,
  assignee: true,
};

function isBuiltInFieldType(id: string): id is BuiltInFieldType {
  return id in BUILT_IN_FIELD_TYPE_SET;
}

export class FrontmatterMappingModal extends BaseModal<FrontmatterMappingModalResult> {
  private options: FrontmatterMappingModalOptions;
  private localConfig: ProjectMappingConfig;
  private mappingsContainer: HTMLElement | null = null;

  constructor(app: App, options: FrontmatterMappingModalOptions) {
    super(app);
    this.options = options;
    this.localConfig = options.mapping.projectConfig
      ? JSON.parse(JSON.stringify(options.mapping.projectConfig))
      : {
          frontmatterMappings: [],
          contentParsing: { ...DEFAULT_CONTENT_PARSING },
        };
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'jira-bridge-frontmatter-modal');

    contentEl.createEl('h2', { text: 'Configure Frontmatter Mapping', cls: 'modal-title' });
    contentEl.createEl('p', {
      text: `Project: ${this.options.mapping.projectKey} (${this.options.instance.name})`,
      cls: 'modal-subtitle',
    });

    this.renderFrontmatterSection(contentEl);
    this.renderContentParsingSection(contentEl);
    this.renderButtons(contentEl);
  }

  private addButton: HTMLButtonElement | null = null;

  private renderFrontmatterSection(container: HTMLElement): void {
    const section = container.createEl('div', { cls: 'mapping-section' });
    section.createEl('h3', { text: 'Frontmatter Field Mappings' });
    section.createEl('p', {
      text: 'Map frontmatter keys to Jira fields. Values will be pre-filled when creating tickets.',
      cls: 'section-description',
    });

    this.mappingsContainer = section.createEl('div', { cls: 'mappings-list' });
    this.renderMappingsList();

    this.addButton = section.createEl('button', { text: 'Add Mapping', cls: 'mod-cta' });
    this.addButton.addEventListener('click', () => this.addMapping());
    this.updateAddButtonState();
  }

  private updateAddButtonState(): void {
    if (!this.addButton) return;
    const hasAvailable = this.getAvailableFieldOptions().length > 0;
    this.addButton.disabled = !hasAvailable;
    this.addButton.style.opacity = hasAvailable ? '1' : '0.5';
  }

  private renderMappingsList(): void {
    if (!this.mappingsContainer) return;
    this.mappingsContainer.innerHTML = '';

    if (this.localConfig.frontmatterMappings.length === 0) {
      this.mappingsContainer.createEl('p', {
        text: 'No mappings configured.',
        cls: 'empty-text',
      });
      this.updateAddButtonState();
      return;
    }

    for (let i = 0; i < this.localConfig.frontmatterMappings.length; i++) {
      const mapping = this.localConfig.frontmatterMappings[i];
      this.renderMappingItem(this.mappingsContainer, mapping, i);
    }

    this.updateAddButtonState();
  }

  private getFieldLabel(mapping: FrontmatterFieldMapping): string {
    if (mapping.jiraFieldType === 'custom') {
      return mapping.customFieldName || mapping.customFieldId || 'Custom Field';
    }
    const builtIn = BUILT_IN_FIELDS.find(f => f.type === mapping.jiraFieldType);
    return builtIn?.label || mapping.jiraFieldType;
  }

  private renderMappingItem(container: HTMLElement, mapping: FrontmatterFieldMapping, index: number): void {
    const item = container.createEl('div', { cls: 'mapping-item' });

    const info = item.createEl('div', { cls: 'mapping-info' });
    info.createEl('span', { text: mapping.frontmatterKey, cls: 'frontmatter-key' });
    info.createEl('span', { text: '→', cls: 'mapping-arrow' });
    info.createEl('span', { text: this.getFieldLabel(mapping), cls: 'jira-field' });

    if (mapping.jiraFieldType === 'custom' && mapping.customFieldId) {
      info.createEl('span', { text: `(${mapping.customFieldId})`, cls: 'custom-field-id' });
    }

    const actions = item.createEl('div', { cls: 'mapping-actions' });

    const editBtn = actions.createEl('button', { text: 'Edit', cls: 'mapping-btn' });
    editBtn.addEventListener('click', () => this.editMapping(index));

    const removeBtn = actions.createEl('button', { text: 'Remove', cls: 'mapping-btn mod-warning' });
    removeBtn.addEventListener('click', () => this.removeMapping(index));
  }

  private addMapping(): void {
    this.showMappingForm();
  }

  private editMapping(index: number): void {
    this.showMappingForm(index);
  }

  private removeMapping(index: number): void {
    this.localConfig.frontmatterMappings.splice(index, 1);
    this.renderMappingsList();
  }

  private getAllFieldOptions(): FieldOption[] {
    const options: FieldOption[] = [];

    for (const field of BUILT_IN_FIELDS) {
      options.push({
        id: field.type,
        label: field.label,
        isBuiltIn: true,
      });
    }

    const builtInFieldIds = new Set(['labels', 'parent', 'priority', 'issuetype']);

    for (const cf of this.options.customFields) {
      if (builtInFieldIds.has(cf.fieldId)) continue;

      options.push({
        id: `custom:${cf.fieldId}`,
        label: cf.fieldName,
        isBuiltIn: false,
        customFieldId: cf.fieldId,
      });
    }

    return options;
  }

  private getUsedFieldIds(excludeIndex?: number): Set<string> {
    return new Set(
      this.localConfig.frontmatterMappings
        .filter((_, index) => index !== excludeIndex)
        .map(m => (m.jiraFieldType === 'custom' ? `custom:${m.customFieldId}` : m.jiraFieldType)),
    );
  }

  private getAvailableFieldOptions(excludeIndex?: number): FieldOption[] {
    const usedIds = this.getUsedFieldIds(excludeIndex);
    return this.getAllFieldOptions().filter(opt => !usedIds.has(opt.id));
  }

  private getCurrentFieldId(mapping: FrontmatterFieldMapping): string {
    return mapping.jiraFieldType === 'custom' ? `custom:${mapping.customFieldId}` : mapping.jiraFieldType;
  }

  private showMappingForm(editIndex?: number): void {
    const isEdit = editIndex !== undefined;
    const existing = isEdit ? this.localConfig.frontmatterMappings[editIndex] : null;

    const availableOptions = this.getAvailableFieldOptions(editIndex);
    if (availableOptions.length === 0) {
      return;
    }

    const overlay = this.contentEl.createEl('div', { cls: 'mapping-form-overlay' });
    const form = overlay.createEl('div', { cls: 'mapping-form' });

    form.createEl('h4', { text: isEdit ? 'Edit Mapping' : 'Add Mapping' });

    const keyGroup = form.createEl('div', { cls: 'form-group' });
    keyGroup.createEl('label', { text: 'Frontmatter Key' });
    const keyInput = keyGroup.createEl('input', {
      type: 'text',
      cls: 'form-input',
      attr: { placeholder: 'e.g., issue_type' },
    });
    if (existing) keyInput.value = existing.frontmatterKey;

    const typeGroup = form.createEl('div', { cls: 'form-group' });
    typeGroup.createEl('label', { text: 'Jira Field' });
    const typeSelect = typeGroup.createEl('select', { cls: 'form-select' });

    const builtInOptions = availableOptions.filter(opt => opt.isBuiltIn);
    const customOptions = availableOptions.filter(opt => !opt.isBuiltIn);

    for (const opt of builtInOptions) {
      const option = typeSelect.createEl('option', {
        text: opt.label,
        attr: { value: opt.id },
      });
      if (existing && this.getCurrentFieldId(existing) === opt.id) {
        option.selected = true;
      }
    }

    if (customOptions.length > 0 && builtInOptions.length > 0) {
      typeSelect.createEl('option', {
        text: '─── Custom Fields ───',
        attr: { disabled: 'true' },
      });
    }

    for (const opt of customOptions) {
      const option = typeSelect.createEl('option', {
        text: opt.label,
        attr: { value: opt.id },
      });
      if (existing && this.getCurrentFieldId(existing) === opt.id) {
        option.selected = true;
      }
    }

    const buttons = form.createEl('div', { cls: 'form-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel', cls: 'form-btn' });
    cancelBtn.addEventListener('click', () => overlay.remove());

    const saveBtn = buttons.createEl('button', { text: 'Save', cls: 'form-btn mod-cta' });
    saveBtn.addEventListener('click', () => {
      const frontmatterKey = keyInput.value.trim();
      const selectedId = typeSelect.value;

      if (!frontmatterKey) {
        keyInput.focus();
        return;
      }

      const selectedOption = availableOptions.find(opt => opt.id === selectedId);
      if (!selectedOption) return;

      const newMapping: FrontmatterFieldMapping = {
        frontmatterKey,
        jiraFieldType: selectedOption.isBuiltIn && isBuiltInFieldType(selectedId) ? selectedId : 'custom',
      };

      if (!selectedOption.isBuiltIn) {
        newMapping.customFieldId = selectedOption.customFieldId;
        newMapping.customFieldName = selectedOption.label;
      }

      if (isEdit) {
        this.localConfig.frontmatterMappings[editIndex] = newMapping;
      } else {
        this.localConfig.frontmatterMappings.push(newMapping);
      }

      overlay.remove();
      this.renderMappingsList();
    });
  }

  private renderContentParsingSection(container: HTMLElement): void {
    const section = container.createEl('div', { cls: 'parsing-section' });
    section.createEl('h3', { text: 'Content Parsing Templates' });
    section.createEl('p', {
      text: 'Configure regex patterns to extract Summary and Description from note content.',
      cls: 'section-description',
    });

    const summaryGroup = section.createEl('div', { cls: 'form-group' });
    summaryGroup.createEl('label', { text: 'Summary Pattern (regex)' });
    const summaryInput = summaryGroup.createEl('input', {
      type: 'text',
      cls: 'form-input mono',
      attr: { placeholder: DEFAULT_CONTENT_PARSING.summaryPattern },
    });
    summaryInput.value = this.localConfig.contentParsing.summaryPattern;
    summaryInput.addEventListener('input', () => {
      this.localConfig.contentParsing.summaryPattern = summaryInput.value;
    });

    const summaryFlagsGroup = section.createEl('div', { cls: 'form-group inline' });
    summaryFlagsGroup.createEl('label', { text: 'Summary Flags' });
    const summaryFlagsInput = summaryFlagsGroup.createEl('input', {
      type: 'text',
      cls: 'form-input small',
      attr: { placeholder: 'm' },
    });
    summaryFlagsInput.value = this.localConfig.contentParsing.summaryFlags;
    summaryFlagsInput.addEventListener('input', () => {
      this.localConfig.contentParsing.summaryFlags = summaryFlagsInput.value;
    });

    const descGroup = section.createEl('div', { cls: 'form-group' });
    descGroup.createEl('label', { text: 'Description Pattern (regex for section header)' });
    const descInput = descGroup.createEl('input', {
      type: 'text',
      cls: 'form-input mono',
      attr: { placeholder: DEFAULT_CONTENT_PARSING.descriptionPattern },
    });
    descInput.value = this.localConfig.contentParsing.descriptionPattern;
    descInput.addEventListener('input', () => {
      this.localConfig.contentParsing.descriptionPattern = descInput.value;
    });

    const descFlagsGroup = section.createEl('div', { cls: 'form-group inline' });
    descFlagsGroup.createEl('label', { text: 'Description Flags' });
    const descFlagsInput = descFlagsGroup.createEl('input', {
      type: 'text',
      cls: 'form-input small',
      attr: { placeholder: 'm' },
    });
    descFlagsInput.value = this.localConfig.contentParsing.descriptionFlags;
    descFlagsInput.addEventListener('input', () => {
      this.localConfig.contentParsing.descriptionFlags = descFlagsInput.value;
    });

    const resetBtn = section.createEl('button', { text: 'Reset to Defaults', cls: 'reset-btn' });
    resetBtn.addEventListener('click', () => {
      this.localConfig.contentParsing = { ...DEFAULT_CONTENT_PARSING };
      summaryInput.value = DEFAULT_CONTENT_PARSING.summaryPattern;
      summaryFlagsInput.value = DEFAULT_CONTENT_PARSING.summaryFlags;
      descInput.value = DEFAULT_CONTENT_PARSING.descriptionPattern;
      descFlagsInput.value = DEFAULT_CONTENT_PARSING.descriptionFlags;
    });
  }

  private renderButtons(container: HTMLElement): void {
    const buttonContainer = container.createEl('div', { cls: 'modal-buttons' });

    buttonContainer.createEl('button', { text: 'Cancel', cls: 'modal-button' }).addEventListener('click', () => {
      this.cancel();
    });

    buttonContainer.createEl('button', { text: 'Save', cls: 'modal-button mod-cta' }).addEventListener('click', () => {
      this.submit({ projectConfig: this.localConfig });
    });
  }
}
