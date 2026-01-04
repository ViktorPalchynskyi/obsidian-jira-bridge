import { App, setIcon } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import type { JiraInstance } from '../../types';
import { validateField, validateForm, generateInstanceId, type JiraInstanceFormData } from '../../utils/validation';

const FIELD_HINTS: Partial<Record<keyof JiraInstanceFormData, string>> = {
  email: 'Your Atlassian account email used for API authentication',
  apiToken: 'Create at: id.atlassian.com → Security → API tokens',
};

interface FormElements {
  name: HTMLInputElement;
  baseUrl: HTMLInputElement;
  email: HTMLInputElement;
  apiToken: HTMLInputElement;
}

interface ErrorElements {
  name: HTMLSpanElement;
  baseUrl: HTMLSpanElement;
  email: HTMLSpanElement;
  apiToken: HTMLSpanElement;
}

export class AddJiraInstanceModal extends BaseModal<JiraInstance> {
  private formElements: FormElements | null = null;
  private errorElements: ErrorElements | null = null;
  private submitButton: HTMLButtonElement | null = null;
  private fieldErrors: Partial<Record<keyof JiraInstanceFormData, string>> = {};

  constructor(app: App) {
    super(app);
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'jira-bridge-add-instance');

    contentEl.createEl('h2', { text: 'Add Jira Instance', cls: 'modal-title' });

    const form = contentEl.createEl('div', { cls: 'modal-form' });

    this.formElements = {
      name: this.createField(form, 'name', 'Name', 'text', 'My Jira'),
      baseUrl: this.createField(form, 'baseUrl', 'URL', 'url', 'https://your-domain.atlassian.net'),
      email: this.createField(form, 'email', 'Email', 'email', 'your-email@example.com'),
      apiToken: this.createField(form, 'apiToken', 'API Token', 'password', 'Your Jira API token'),
    };

    this.errorElements = {
      name: form.querySelector('[data-error="name"]') as HTMLSpanElement,
      baseUrl: form.querySelector('[data-error="baseUrl"]') as HTMLSpanElement,
      email: form.querySelector('[data-error="email"]') as HTMLSpanElement,
      apiToken: form.querySelector('[data-error="apiToken"]') as HTMLSpanElement,
    };

    const buttonContainer = contentEl.createEl('div', { cls: 'modal-buttons' });

    buttonContainer.createEl('button', { text: 'Cancel', cls: 'modal-button' }).addEventListener('click', () => {
      this.cancel();
    });

    this.submitButton = buttonContainer.createEl('button', {
      text: 'Add',
      cls: 'modal-button mod-cta',
    });
    this.submitButton.disabled = true;
    this.submitButton.addEventListener('click', () => {
      this.handleSubmit();
    });
  }

  private createField(
    container: HTMLElement,
    name: keyof JiraInstanceFormData,
    label: string,
    type: string,
    placeholder: string,
  ): HTMLInputElement {
    const fieldGroup = container.createEl('div', { cls: 'field-group' });

    const labelContainer = fieldGroup.createEl('div', { cls: 'label-container' });
    labelContainer.createEl('label', { text: label, attr: { for: `field-${name}` } });

    const hint = FIELD_HINTS[name];
    if (hint) {
      const hintIcon = labelContainer.createEl('span', {
        cls: 'hint-icon',
        attr: { 'aria-label': hint, title: hint },
      });
      setIcon(hintIcon, 'info');
    }

    const input = fieldGroup.createEl('input', {
      type,
      placeholder,
      cls: 'field-input',
      attr: { id: `field-${name}`, name },
    });

    fieldGroup.createEl('span', {
      cls: 'field-error',
      attr: { 'data-error': name },
    });

    input.addEventListener('blur', () => {
      this.validateSingleField(name);
    });

    input.addEventListener('input', () => {
      this.clearFieldError(name);
      this.updateSubmitButtonState();
    });

    return input;
  }

  private validateSingleField(name: keyof JiraInstanceFormData): void {
    if (!this.formElements) return;

    const value = this.formElements[name].value;
    const result = validateField(name, value);

    if (!result.valid && result.error) {
      this.showFieldError(name, result.error);
      this.fieldErrors[name] = result.error;
    } else {
      this.clearFieldError(name);
      delete this.fieldErrors[name];
    }

    this.updateSubmitButtonState();
  }

  private showFieldError(name: keyof JiraInstanceFormData, message: string): void {
    if (!this.formElements || !this.errorElements) return;

    this.formElements[name].addClass('invalid');
    this.errorElements[name].textContent = message;
    this.errorElements[name].addClass('visible');
  }

  private clearFieldError(name: keyof JiraInstanceFormData): void {
    if (!this.formElements || !this.errorElements) return;

    this.formElements[name].removeClass('invalid');
    this.errorElements[name].textContent = '';
    this.errorElements[name].removeClass('visible');
    delete this.fieldErrors[name];
  }

  private updateSubmitButtonState(): void {
    if (!this.submitButton || !this.formElements) return;

    const allFilled = Object.values(this.formElements).every(input => input.value.trim() !== '');
    const noErrors = Object.keys(this.fieldErrors).length === 0;

    this.submitButton.disabled = !(allFilled && noErrors);
  }

  private handleSubmit(): void {
    if (!this.formElements) return;

    const formData: JiraInstanceFormData = {
      name: this.formElements.name.value.trim(),
      baseUrl: this.formElements.baseUrl.value.trim(),
      email: this.formElements.email.value.trim(),
      apiToken: this.formElements.apiToken.value.trim(),
    };

    const validation = validateForm(formData);

    if (!validation.valid) {
      for (const [field, error] of Object.entries(validation.errors)) {
        if (error) {
          this.showFieldError(field as keyof JiraInstanceFormData, error);
          this.fieldErrors[field as keyof JiraInstanceFormData] = error;
        }
      }
      this.updateSubmitButtonState();
      return;
    }

    const instance: JiraInstance = {
      id: generateInstanceId(),
      name: formData.name,
      baseUrl: formData.baseUrl.replace(/\/+$/, ''),
      email: formData.email,
      apiToken: formData.apiToken,
      isDefault: false,
      enabled: true,
      createdAt: Date.now(),
    };

    this.submit(instance);
  }
}
