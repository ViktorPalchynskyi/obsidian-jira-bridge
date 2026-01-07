import { App, debounce } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import type { LinkTicketModalOptions, LinkTicketModalResult, SearchIssueResult } from './types';
import { JiraClient } from '../../api/JiraClient';

interface ModalState {
  selectedInstanceId: string;
  searchQuery: string;
  isSearching: boolean;
  searchResults: SearchIssueResult[];
  selectedIssueKey: string | null;
  error: string | null;
}

export class LinkTicketModal extends BaseModal<LinkTicketModalResult> {
  private options: LinkTicketModalOptions;
  private state: ModalState;
  private client: JiraClient | null = null;
  private searchInput: HTMLInputElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private linkButton: HTMLButtonElement | null = null;
  private debouncedSearch: () => void;

  constructor(app: App, options: LinkTicketModalOptions) {
    super(app);
    this.options = options;

    const defaultInstanceId = options.defaultInstanceId || options.instances[0]?.id || '';

    this.state = {
      selectedInstanceId: defaultInstanceId,
      searchQuery: '',
      isSearching: false,
      searchResults: [],
      selectedIssueKey: null,
      error: null,
    };

    const instance = options.instances.find(i => i.id === defaultInstanceId);
    if (instance) {
      this.client = new JiraClient(instance);
    }

    this.debouncedSearch = debounce(() => this.performSearch(), 300, true);
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'jira-bridge-link-ticket-modal');

    contentEl.createEl('h2', { text: 'Link Existing Jira Ticket', cls: 'modal-title' });

    if (this.options.currentIssueKey) {
      contentEl.createEl('p', {
        text: `Current: ${this.options.currentIssueKey}`,
        cls: 'modal-subtitle',
      });
    }

    this.renderInstanceSelector(contentEl);
    this.renderSearchInput(contentEl);
    this.resultsContainer = contentEl.createEl('div', { cls: 'search-results' });
    this.renderButtons(contentEl);
  }

  private renderInstanceSelector(container: HTMLElement): void {
    if (this.options.instances.length <= 1) return;

    const group = container.createEl('div', { cls: 'form-group' });
    group.createEl('label', { text: 'Jira Instance' });

    const instanceSelect = group.createEl('select', { cls: 'instance-select' });
    for (const instance of this.options.instances) {
      const option = instanceSelect.createEl('option', {
        text: instance.name,
        value: instance.id,
      });
      if (instance.id === this.state.selectedInstanceId) {
        option.selected = true;
      }
    }

    instanceSelect.addEventListener('change', () => {
      this.state.selectedInstanceId = instanceSelect.value;
      const instance = this.options.instances.find(i => i.id === this.state.selectedInstanceId);
      this.client = instance ? new JiraClient(instance) : null;
      this.state.searchResults = [];
      this.state.selectedIssueKey = null;
      this.updateResultsDisplay();
    });
  }

  private renderSearchInput(container: HTMLElement): void {
    const group = container.createEl('div', { cls: 'form-group' });
    group.createEl('label', { text: 'Search by Issue Key or Summary' });

    this.searchInput = group.createEl('input', {
      type: 'text',
      cls: 'search-input',
      attr: { placeholder: 'e.g., PROJ-123 or "bug in login"' },
    });

    this.searchInput.addEventListener('input', () => {
      this.state.searchQuery = this.searchInput?.value || '';
      this.state.selectedIssueKey = null;
      this.updateLinkButton();

      if (this.state.searchQuery.trim().length >= 2) {
        this.debouncedSearch();
      } else {
        this.state.searchResults = [];
        this.updateResultsDisplay();
      }
    });
  }

  private async performSearch(): Promise<void> {
    if (!this.client || !this.state.searchQuery.trim()) return;

    this.state.isSearching = true;
    this.state.error = null;
    this.updateResultsDisplay();

    try {
      const query = this.state.searchQuery.trim();
      const issues = await this.client.searchIssues(query, 10);

      this.state.searchResults = issues.map(issue => ({
        key: issue.key,
        summary: issue.summary,
        status: issue.status?.name || 'Unknown',
        issueType: issue.issueType?.name || 'Unknown',
      }));
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to search issues';
      this.state.searchResults = [];
    } finally {
      this.state.isSearching = false;
      this.updateResultsDisplay();
    }
  }

  private updateResultsDisplay(): void {
    if (!this.resultsContainer) return;

    this.resultsContainer.empty();

    if (this.state.isSearching) {
      this.resultsContainer.createEl('p', { text: 'Searching...', cls: 'loading-text' });
      return;
    }

    if (this.state.error) {
      this.resultsContainer.createEl('p', { text: this.state.error, cls: 'error-text' });
      return;
    }

    if (this.state.searchQuery.trim().length < 2) {
      this.resultsContainer.createEl('p', {
        text: 'Type at least 2 characters to search',
        cls: 'hint-text',
      });
      return;
    }

    if (this.state.searchResults.length === 0) {
      this.resultsContainer.createEl('p', { text: 'No results found', cls: 'empty-text' });
      return;
    }

    for (const issue of this.state.searchResults) {
      const item = this.resultsContainer.createEl('div', {
        cls: `result-item ${issue.key === this.state.selectedIssueKey ? 'selected' : ''}`,
      });

      const header = item.createEl('div', { cls: 'result-header' });
      header.createEl('span', { text: issue.key, cls: 'issue-key' });
      header.createEl('span', { text: issue.issueType, cls: 'issue-type' });
      header.createEl('span', { text: issue.status, cls: 'issue-status' });

      item.createEl('div', { text: issue.summary, cls: 'issue-summary' });

      item.addEventListener('click', () => {
        this.state.selectedIssueKey = issue.key;
        this.updateResultsDisplay();
        this.updateLinkButton();
      });
    }
  }

  private renderButtons(container: HTMLElement): void {
    const buttonContainer = container.createEl('div', { cls: 'modal-buttons' });

    buttonContainer.createEl('button', { text: 'Cancel', cls: 'modal-button' }).addEventListener('click', () => {
      this.cancel();
    });

    this.linkButton = buttonContainer.createEl('button', {
      text: 'Link',
      cls: 'modal-button mod-cta',
    });
    this.linkButton.disabled = true;
    this.linkButton.addEventListener('click', () => this.handleLink());

    this.updateLinkButton();
  }

  private updateLinkButton(): void {
    if (!this.linkButton) return;
    this.linkButton.disabled = !this.state.selectedIssueKey;
  }

  private handleLink(): void {
    if (!this.state.selectedIssueKey) return;

    this.submit({
      issueKey: this.state.selectedIssueKey,
      instanceId: this.state.selectedInstanceId,
    });
  }
}
