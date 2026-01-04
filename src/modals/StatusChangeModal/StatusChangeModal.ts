import { App, Notice } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import type { StatusChangeResult, StatusChangeModalOptions } from './types';
import type { JiraTransition, JiraStatus } from '../../types';
import { JiraClient } from '../../api/JiraClient';

interface ModalState {
  issueKey: string;
  instanceId: string;
  isLoadingIssue: boolean;
  isLoadingTransitions: boolean;
  isSubmitting: boolean;
  currentStatus: JiraStatus | null;
  issueSummary: string;
  transitions: JiraTransition[];
  selectedTransitionId: string | null;
  error: string | null;
}

export class StatusChangeModal extends BaseModal<StatusChangeResult> {
  private state: ModalState;
  private client: JiraClient | null = null;

  private issueKeyInput: HTMLInputElement | null = null;
  private instanceSelect: HTMLSelectElement | null = null;
  private statusContainer: HTMLDivElement | null = null;
  private transitionsContainer: HTMLDivElement | null = null;
  private submitButton: HTMLButtonElement | null = null;
  private suggestionsContainer: HTMLDivElement | null = null;

  constructor(
    app: App,
    private options: StatusChangeModalOptions,
  ) {
    super(app);
    this.state = {
      issueKey: '',
      instanceId: options.defaultInstanceId || options.instances[0]?.id || '',
      isLoadingIssue: false,
      isLoadingTransitions: false,
      isSubmitting: false,
      currentStatus: null,
      issueSummary: '',
      transitions: [],
      selectedTransitionId: null,
      error: null,
    };

    if (this.state.instanceId) {
      const instance = options.instances.find(i => i.id === this.state.instanceId);
      if (instance) {
        this.client = new JiraClient(instance);
      }
    }
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal');
    contentEl.addClass('jira-bridge-status-change');

    contentEl.createEl('h2', { text: 'Change Issue Status' });

    this.buildInstanceSelector(contentEl);
    this.buildIssueKeyInput(contentEl);
    this.buildStatusSection(contentEl);
    this.buildTransitionsSection(contentEl);
    this.buildButtons(contentEl);

    this.setupKeyboardNavigation();
  }

  private buildInstanceSelector(container: HTMLElement): void {
    if (this.options.instances.length <= 1) return;

    const group = container.createDiv({ cls: 'form-group' });
    group.createEl('label', { text: 'Jira Instance' });

    this.instanceSelect = group.createEl('select', { cls: 'instance-select' });
    for (const instance of this.options.instances) {
      const option = this.instanceSelect.createEl('option', {
        text: instance.name,
        value: instance.id,
      });
      if (instance.id === this.state.instanceId) {
        option.selected = true;
      }
    }

    this.instanceSelect.addEventListener('change', () => {
      this.state.instanceId = this.instanceSelect!.value;
      const instance = this.options.instances.find(i => i.id === this.state.instanceId);
      this.client = instance ? new JiraClient(instance) : null;
      this.resetState();
    });
  }

  private buildIssueKeyInput(container: HTMLElement): void {
    const group = container.createDiv({ cls: 'form-group' });
    group.createEl('label', { text: 'Issue Key' });

    const inputWrapper = group.createDiv({ cls: 'input-wrapper' });

    this.issueKeyInput = inputWrapper.createEl('input', {
      type: 'text',
      placeholder: 'e.g., PROJ-123',
      cls: 'issue-key-input',
    });

    this.suggestionsContainer = inputWrapper.createDiv({ cls: 'suggestions-container' });
    this.suggestionsContainer.style.display = 'none';

    this.issueKeyInput.addEventListener('input', () => {
      this.state.issueKey = this.issueKeyInput!.value.toUpperCase();
      this.issueKeyInput!.value = this.state.issueKey;
      this.updateSuggestions();
    });

    this.issueKeyInput.addEventListener('focus', () => {
      this.updateSuggestions();
    });

    this.issueKeyInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (this.suggestionsContainer) {
          this.suggestionsContainer.style.display = 'none';
        }
      }, 200);
    });

    this.issueKeyInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && this.state.issueKey) {
        e.preventDefault();
        this.loadIssue();
      }
    });

    const loadButton = inputWrapper.createEl('button', { text: 'Load', cls: 'load-button' });
    loadButton.addEventListener('click', () => this.loadIssue());
  }

  private updateSuggestions(): void {
    if (!this.suggestionsContainer) return;

    const recentForInstance = this.options.recentIssues
      .filter(r => r.instanceId === this.state.instanceId)
      .filter(r => !this.state.issueKey || r.key.includes(this.state.issueKey))
      .slice(0, 5);

    if (recentForInstance.length === 0) {
      this.suggestionsContainer.style.display = 'none';
      return;
    }

    this.suggestionsContainer.empty();
    this.suggestionsContainer.style.display = 'block';

    for (const recent of recentForInstance) {
      const item = this.suggestionsContainer.createDiv({ cls: 'suggestion-item' });
      item.createSpan({ text: recent.key, cls: 'suggestion-key' });
      item.createSpan({ text: recent.summary, cls: 'suggestion-summary' });

      item.addEventListener('click', () => {
        this.state.issueKey = recent.key;
        if (this.issueKeyInput) {
          this.issueKeyInput.value = recent.key;
        }
        this.suggestionsContainer!.style.display = 'none';
        this.loadIssue();
      });
    }
  }

  private buildStatusSection(container: HTMLElement): void {
    this.statusContainer = container.createDiv({ cls: 'status-section' });
    this.statusContainer.style.display = 'none';
  }

  private buildTransitionsSection(container: HTMLElement): void {
    this.transitionsContainer = container.createDiv({ cls: 'transitions-section' });
    this.transitionsContainer.style.display = 'none';
  }

  private buildButtons(container: HTMLElement): void {
    const buttonGroup = container.createDiv({ cls: 'button-group' });

    const cancelButton = buttonGroup.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => this.cancel());

    this.submitButton = buttonGroup.createEl('button', {
      text: 'Change Status',
      cls: 'mod-cta',
    });
    this.submitButton.disabled = true;
    this.submitButton.addEventListener('click', () => this.handleSubmit());
  }

  private async loadIssue(): Promise<void> {
    if (!this.client || !this.state.issueKey || this.state.isLoadingIssue) return;

    this.state.isLoadingIssue = true;
    this.state.error = null;
    this.updateStatusDisplay();

    try {
      const issue = await this.client.getIssue(this.state.issueKey);
      this.state.currentStatus = issue.status;
      this.state.issueSummary = issue.summary;
      this.state.issueKey = issue.key;

      if (this.issueKeyInput) {
        this.issueKeyInput.value = issue.key;
      }

      await this.loadTransitions();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load issue';
      this.state.currentStatus = null;
      this.state.transitions = [];
    } finally {
      this.state.isLoadingIssue = false;
      this.updateStatusDisplay();
      this.updateTransitionsDisplay();
    }
  }

  private async loadTransitions(): Promise<void> {
    if (!this.client || !this.state.issueKey) return;

    this.state.isLoadingTransitions = true;
    this.updateTransitionsDisplay();

    try {
      this.state.transitions = await this.client.getTransitions(this.state.issueKey);
      if (this.state.transitions.length > 0) {
        this.state.selectedTransitionId = this.state.transitions[0].id;
      }
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load transitions';
      this.state.transitions = [];
    } finally {
      this.state.isLoadingTransitions = false;
      this.updateTransitionsDisplay();
      this.updateSubmitButton();
    }
  }

  private updateStatusDisplay(): void {
    if (!this.statusContainer) return;

    this.statusContainer.empty();

    if (this.state.isLoadingIssue) {
      this.statusContainer.style.display = 'block';
      this.statusContainer.createDiv({ cls: 'loading', text: 'Loading issue...' });
      return;
    }

    if (this.state.error) {
      this.statusContainer.style.display = 'block';
      this.statusContainer.createDiv({ cls: 'error-message', text: this.state.error });
      return;
    }

    if (!this.state.currentStatus) {
      this.statusContainer.style.display = 'none';
      return;
    }

    this.statusContainer.style.display = 'block';

    const summaryEl = this.statusContainer.createDiv({ cls: 'issue-summary' });
    summaryEl.createSpan({ text: this.state.issueKey, cls: 'issue-key' });
    summaryEl.createSpan({ text: this.state.issueSummary, cls: 'summary-text' });

    const statusEl = this.statusContainer.createDiv({ cls: 'current-status' });
    statusEl.createSpan({ text: 'Current: ' });
    const statusBadge = statusEl.createSpan({
      text: this.state.currentStatus.name,
      cls: `status-badge status-${this.state.currentStatus.statusCategory.key}`,
    });
    statusBadge.dataset.category = this.state.currentStatus.statusCategory.key;
  }

  private updateTransitionsDisplay(): void {
    if (!this.transitionsContainer) return;

    this.transitionsContainer.empty();

    if (this.state.isLoadingTransitions) {
      this.transitionsContainer.style.display = 'block';
      this.transitionsContainer.createDiv({ cls: 'loading', text: 'Loading transitions...' });
      return;
    }

    if (!this.state.currentStatus || this.state.transitions.length === 0) {
      if (this.state.currentStatus && !this.state.error) {
        this.transitionsContainer.style.display = 'block';
        this.transitionsContainer.createDiv({
          cls: 'no-transitions',
          text: 'No transitions available',
        });
      } else {
        this.transitionsContainer.style.display = 'none';
      }
      return;
    }

    this.transitionsContainer.style.display = 'block';
    this.transitionsContainer.createEl('label', { text: 'Available Transitions' });

    const list = this.transitionsContainer.createDiv({ cls: 'transitions-list' });

    for (const transition of this.state.transitions) {
      const item = list.createDiv({
        cls: `transition-item ${transition.id === this.state.selectedTransitionId ? 'selected' : ''}`,
      });
      item.dataset.transitionId = transition.id;
      item.tabIndex = 0;

      const radio = item.createEl('input', {
        type: 'radio',
        attr: {
          name: 'transition',
          value: transition.id,
        },
      }) as HTMLInputElement;
      radio.checked = transition.id === this.state.selectedTransitionId;

      const label = item.createDiv({ cls: 'transition-label' });
      label.createSpan({ text: transition.name, cls: 'transition-name' });
      label.createSpan({
        text: `→ ${transition.to.name}`,
        cls: `transition-target status-${transition.to.statusCategory.key}`,
      });

      item.addEventListener('click', () => {
        this.selectTransition(transition.id);
      });

      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.selectTransition(transition.id);
        }
      });
    }
  }

  private selectTransition(transitionId: string): void {
    this.state.selectedTransitionId = transitionId;
    this.updateTransitionsDisplay();
    this.updateSubmitButton();
  }

  private updateSubmitButton(): void {
    if (!this.submitButton) return;
    this.submitButton.disabled = !this.state.selectedTransitionId || this.state.isSubmitting || this.state.isLoadingTransitions;
  }

  private setupKeyboardNavigation(): void {
    this.contentEl.addEventListener('keydown', e => {
      if (!this.transitionsContainer || this.state.transitions.length === 0) return;

      const currentIndex = this.state.transitions.findIndex(t => t.id === this.state.selectedTransitionId);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % this.state.transitions.length;
        this.selectTransition(this.state.transitions[nextIndex].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + this.state.transitions.length) % this.state.transitions.length;
        this.selectTransition(this.state.transitions[prevIndex].id);
      }
    });
  }

  private async handleSubmit(): Promise<void> {
    if (!this.client || !this.state.selectedTransitionId || this.state.isSubmitting) return;

    const transition = this.state.transitions.find(t => t.id === this.state.selectedTransitionId);
    if (!transition) return;

    this.state.isSubmitting = true;
    this.updateSubmitButton();
    if (this.submitButton) {
      this.submitButton.textContent = 'Changing...';
    }

    try {
      await this.client.transitionIssue(this.state.issueKey, this.state.selectedTransitionId);

      new Notice(`${this.state.issueKey} → ${transition.to.name}`, 5000);

      this.submit({
        issueKey: this.state.issueKey,
        transitionId: transition.id,
        transitionName: transition.name,
        newStatusName: transition.to.name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change status';
      new Notice(`Error: ${message}`, 5000);
      this.state.isSubmitting = false;
      this.updateSubmitButton();
      if (this.submitButton) {
        this.submitButton.textContent = 'Change Status';
      }
    }
  }

  private resetState(): void {
    this.state.currentStatus = null;
    this.state.issueSummary = '';
    this.state.transitions = [];
    this.state.selectedTransitionId = null;
    this.state.error = null;
    this.updateStatusDisplay();
    this.updateTransitionsDisplay();
    this.updateSubmitButton();
  }

  getIssueKey(): string {
    return this.state.issueKey;
  }

  getInstanceId(): string {
    return this.state.instanceId;
  }
}
