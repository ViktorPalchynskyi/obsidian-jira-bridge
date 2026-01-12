import { App, Notice } from 'obsidian';
import { BaseModal } from '../../../../ui/modals/BaseModal/BaseModal';
import type { StatusChangeResult, StatusChangeModalOptions } from './types';
import type { JiraTransition, JiraStatus, JiraSprint, JiraBoard } from '../../../../types';
import { JiraClient } from '../../../../api/JiraClient';
import { debounce, mapJiraError, NOTICE_DURATION, type DebouncedFunction } from '../../../../utils';

interface ModalState {
  issueKey: string;
  instanceId: string;
  isLoadingIssue: boolean;
  isLoadingTransitions: boolean;
  isSubmitting: boolean;
  isSearching: boolean;
  isLoadingSprint: boolean;
  currentStatus: JiraStatus | null;
  issueSummary: string;
  transitions: JiraTransition[];
  selectedTransitionId: string | null;
  error: string | null;
  searchResults: { key: string; summary: string }[];
  sprint: JiraSprint | null;
  inBacklog: boolean;
  board: JiraBoard | null;
  availableSprints: JiraSprint[];
}

export class StatusChangeModal extends BaseModal<StatusChangeResult> {
  private state: ModalState;
  private client: JiraClient | null = null;
  private debouncedSearch: DebouncedFunction<() => Promise<void>>;

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
      issueKey: options.initialIssueKey || '',
      instanceId: options.defaultInstanceId || options.instances[0]?.id || '',
      isLoadingIssue: false,
      isLoadingTransitions: false,
      isSubmitting: false,
      isSearching: false,
      isLoadingSprint: false,
      currentStatus: null,
      issueSummary: '',
      transitions: [],
      selectedTransitionId: null,
      error: null,
      searchResults: [],
      sprint: null,
      inBacklog: true,
      board: null,
      availableSprints: [],
    };

    if (this.state.instanceId) {
      const instance = options.instances.find(i => i.id === this.state.instanceId);
      if (instance) {
        this.client = new JiraClient(instance);
      }
    }

    this.debouncedSearch = debounce(() => this.performSearch(), 300);
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

    if (this.state.issueKey && this.issueKeyInput) {
      this.issueKeyInput.value = this.state.issueKey;
      this.loadIssue();
    }
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

    this.renderSuggestions();

    if (this.state.issueKey.length >= 2) {
      this.debouncedSearch();
    } else {
      this.debouncedSearch.cancel();
      this.state.searchResults = [];
      this.state.isSearching = false;
    }
  }

  private async performSearch(): Promise<void> {
    if (!this.client || this.state.issueKey.length < 2) return;

    this.state.isSearching = true;
    this.renderSuggestions();

    try {
      this.state.searchResults = await this.client.searchIssues(this.state.issueKey, 5);
    } catch {
      this.state.searchResults = [];
    } finally {
      this.state.isSearching = false;
      this.renderSuggestions();
    }
  }

  private renderSuggestions(): void {
    if (!this.suggestionsContainer) return;

    const recentForInstance = this.options.recentIssues
      .filter(r => r.instanceId === this.state.instanceId)
      .filter(r => !this.state.issueKey || r.key.toLowerCase().includes(this.state.issueKey.toLowerCase()))
      .slice(0, 3);

    const searchResults = this.state.searchResults.filter(sr => !recentForInstance.some(r => r.key === sr.key));

    const hasContent = recentForInstance.length > 0 || searchResults.length > 0 || this.state.isSearching;

    if (!hasContent && !this.state.issueKey) {
      this.suggestionsContainer.style.display = 'none';
      return;
    }

    this.suggestionsContainer.empty();
    this.suggestionsContainer.style.display = 'block';

    if (recentForInstance.length > 0) {
      const recentLabel = this.suggestionsContainer.createDiv({ cls: 'suggestion-label', text: 'Recent' });
      recentLabel.style.fontSize = '10px';
      recentLabel.style.opacity = '0.6';
      recentLabel.style.padding = '4px 8px';

      for (const recent of recentForInstance) {
        this.createSuggestionItem(recent.key, recent.summary);
      }
    }

    if (searchResults.length > 0) {
      if (recentForInstance.length > 0) {
        const searchLabel = this.suggestionsContainer.createDiv({ cls: 'suggestion-label', text: 'Search Results' });
        searchLabel.style.fontSize = '10px';
        searchLabel.style.opacity = '0.6';
        searchLabel.style.padding = '4px 8px';
        searchLabel.style.borderTop = '1px solid var(--background-modifier-border)';
      }

      for (const result of searchResults) {
        this.createSuggestionItem(result.key, result.summary);
      }
    }

    if (this.state.isSearching) {
      const loadingEl = this.suggestionsContainer.createDiv({ cls: 'suggestion-loading', text: 'Searching...' });
      loadingEl.style.padding = '8px';
      loadingEl.style.opacity = '0.6';
      loadingEl.style.fontStyle = 'italic';
    }

    if (!hasContent && this.state.issueKey.length >= 2 && !this.state.isSearching) {
      this.suggestionsContainer.style.display = 'none';
    }
  }

  private createSuggestionItem(key: string, summary: string): void {
    if (!this.suggestionsContainer) return;

    const item = this.suggestionsContainer.createDiv({ cls: 'suggestion-item' });
    item.createSpan({ text: key, cls: 'suggestion-key' });
    item.createSpan({ text: summary, cls: 'suggestion-summary' });

    item.addEventListener('click', () => {
      this.state.issueKey = key;
      if (this.issueKeyInput) {
        this.issueKeyInput.value = key;
      }
      this.suggestionsContainer!.style.display = 'none';
      this.debouncedSearch.cancel();
      this.loadIssue();
    });
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
      const issue = await this.client.getIssue(this.state.issueKey, ['summary', 'status']);
      this.state.currentStatus = issue.fields.status as JiraStatus | null;
      this.state.issueSummary = String(issue.fields.summary || '');
      this.state.issueKey = issue.key;

      if (this.issueKeyInput) {
        this.issueKeyInput.value = issue.key;
      }

      await Promise.all([this.loadTransitions(), this.loadSprintInfo()]);
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

  private async loadSprintInfo(): Promise<void> {
    if (!this.client || !this.state.issueKey) return;

    this.state.isLoadingSprint = true;

    try {
      const sprintInfo = await this.client.getIssueSprintInfo(this.state.issueKey);
      this.state.sprint = sprintInfo.sprint;
      this.state.inBacklog = sprintInfo.inBacklog;

      const projectKey = this.state.issueKey.split('-')[0];
      const boards = await this.client.getBoardsForProject(projectKey);

      const scrumBoard = boards.find(b => b.type === 'scrum');
      const kanbanBoard = boards.find(b => b.type === 'kanban');
      const simpleBoard = boards.find(b => b.type === 'simple');

      this.state.board = scrumBoard || kanbanBoard || simpleBoard || boards[0] || null;

      if (scrumBoard) {
        this.state.availableSprints = await this.client.getSprintsForBoard(scrumBoard.id);
      }

      if (!this.state.sprint && this.state.board) {
        this.state.inBacklog = await this.client.isIssueInBacklog(this.state.board.id, this.state.issueKey);
      }
    } catch {
      this.state.sprint = null;
      this.state.inBacklog = true;
    } finally {
      this.state.isLoadingSprint = false;
      this.updateStatusDisplay();
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

    this.renderSprintSection();
  }

  private renderSprintSection(): void {
    if (!this.statusContainer) return;

    if (this.state.isLoadingSprint) {
      const sprintEl = this.statusContainer.createDiv({ cls: 'sprint-section' });
      sprintEl.createSpan({ text: 'Loading sprint info...', cls: 'loading-text' });
      return;
    }

    if (!this.state.board) {
      return;
    }

    const sprintEl = this.statusContainer.createDiv({ cls: 'sprint-section' });
    const supportsBacklog = ['scrum', 'kanban', 'simple'].includes(this.state.board.type);

    if (this.state.sprint) {
      const sprintRow = sprintEl.createDiv({ cls: 'sprint-row' });
      sprintRow.createSpan({ text: 'Sprint: ' });
      const sprintBadge = sprintRow.createSpan({
        text: `${this.state.sprint.name} (${this.state.sprint.state})`,
        cls: `sprint-badge sprint-${this.state.sprint.state}`,
      });
      sprintBadge.dataset.state = this.state.sprint.state;

      if (supportsBacklog) {
        const backlogBtn = sprintRow.createEl('button', { text: '→ Backlog', cls: 'sprint-action-btn' });
        backlogBtn.addEventListener('click', () => this.handleMoveToBacklog());
      }
    } else if (this.state.inBacklog) {
      const backlogRow = sprintEl.createDiv({ cls: 'sprint-row' });

      if (supportsBacklog) {
        backlogRow.createSpan({ text: 'Location: ' });
        backlogRow.createSpan({ text: 'Backlog', cls: 'backlog-badge' });

        if (this.state.availableSprints.length > 0) {
          const sprintBtn = backlogRow.createEl('button', { text: '→ Sprint', cls: 'sprint-action-btn' });
          sprintBtn.addEventListener('click', () => this.showSprintPicker());
        } else {
          const boardBtn = backlogRow.createEl('button', { text: '→ Board', cls: 'sprint-action-btn' });
          boardBtn.addEventListener('click', () => this.handleMoveToBoard());
        }
      } else {
        backlogRow.createSpan({ text: 'Board: ' });
        backlogRow.createSpan({
          text: `${this.state.board.name} (${this.state.board.type})`,
          cls: 'backlog-badge',
        });
      }
    } else if (supportsBacklog) {
      const boardRow = sprintEl.createDiv({ cls: 'sprint-row' });
      boardRow.createSpan({ text: 'Location: ' });
      boardRow.createSpan({ text: 'Board', cls: 'sprint-badge sprint-active' });

      const backlogBtn = boardRow.createEl('button', { text: '→ Backlog', cls: 'sprint-action-btn' });
      backlogBtn.addEventListener('click', () => this.handleMoveToBacklog());
    }
  }

  private showSprintPicker(): void {
    if (!this.statusContainer || this.state.availableSprints.length === 0) return;

    const existingPicker = this.statusContainer.querySelector('.sprint-picker');
    if (existingPicker) {
      existingPicker.remove();
      return;
    }

    const picker = this.statusContainer.createDiv({ cls: 'sprint-picker' });
    picker.createEl('label', { text: 'Select Sprint:' });

    for (const sprint of this.state.availableSprints) {
      const item = picker.createDiv({ cls: 'sprint-picker-item' });
      item.createSpan({ text: sprint.name });
      item.createSpan({ text: ` (${sprint.state})`, cls: 'sprint-state' });

      item.addEventListener('click', () => {
        this.handleMoveToSprint(sprint.id);
        picker.remove();
      });
    }
  }

  private async handleMoveToSprint(sprintId: number): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.moveToSprint([this.state.issueKey], sprintId);
      const sprint = this.state.availableSprints.find(s => s.id === sprintId);
      new Notice(`${this.state.issueKey} → ${sprint?.name || 'Sprint'}`, NOTICE_DURATION.success);
      await this.loadSprintInfo();
    } catch (error) {
      new Notice(mapJiraError(error), NOTICE_DURATION.error);
    }
  }

  private async handleMoveToBacklog(): Promise<void> {
    if (!this.client || !this.state.board) return;

    try {
      await this.client.moveToBacklog([this.state.issueKey], this.state.board.id);
      new Notice(`${this.state.issueKey} → Backlog`, NOTICE_DURATION.success);
      await this.loadSprintInfo();
    } catch (error) {
      new Notice(mapJiraError(error), NOTICE_DURATION.error);
    }
  }

  private async handleMoveToBoard(): Promise<void> {
    if (!this.client || !this.state.board) return;

    try {
      await this.client.moveToBoard([this.state.issueKey], this.state.board.id);
      new Notice(`${this.state.issueKey} → ${this.state.board.name}`, NOTICE_DURATION.success);
      await this.loadSprintInfo();
    } catch (error) {
      new Notice(mapJiraError(error), NOTICE_DURATION.error);
    }
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
    const disabled = !this.state.selectedTransitionId || this.state.isSubmitting || this.state.isLoadingTransitions;
    this.submitButton.disabled = disabled;
    if (this.state.isSubmitting) {
      this.submitButton.addClass('is-loading');
    } else {
      this.submitButton.removeClass('is-loading');
    }
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

      new Notice(`${this.state.issueKey} → ${transition.to.name}`, NOTICE_DURATION.success);

      this.submit({
        issueKey: this.state.issueKey,
        transitionId: transition.id,
        transitionName: transition.name,
        newStatusName: transition.to.name,
      });
    } catch (error) {
      new Notice(mapJiraError(error), NOTICE_DURATION.error);
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
