import { App, TFile } from 'obsidian';
import { BaseModal } from '../base/BaseModal';
import type { BulkStatusChangeModalOptions, BulkStatusChangeModalResult } from './types';
import type { JiraTransition, JiraBoard, JiraSprint } from '../../types';
import { JiraClient } from '../../api/JiraClient';
import { MappingResolver } from '../../mapping';
import { parseSummaryFromContent } from '../../utils';
import { DEFAULT_CONTENT_PARSING } from '../../constants/defaults';
import { isFolder, collectMarkdownFiles } from '../../services/utils';

interface ModalState {
  instanceId: string;
  isLoading: boolean;
  sampleIssueKey: string | null;
  currentStatus: string | null;
  transitions: JiraTransition[];
  selectedTransitionId: string | null;
  error: string | null;
  board: JiraBoard | null;
  availableSprints: JiraSprint[];
  locationAction: 'none' | 'backlog' | 'board' | 'sprint';
  selectedSprintId: number | null;
}

export class BulkStatusChangeModal extends BaseModal<BulkStatusChangeModalResult> {
  private state: ModalState;
  private client: JiraClient | null = null;
  private mappingResolver: MappingResolver;
  private statusContainer: HTMLDivElement | null = null;
  private transitionsContainer: HTMLDivElement | null = null;
  private locationContainer: HTMLDivElement | null = null;
  private submitButton: HTMLButtonElement | null = null;

  constructor(
    app: App,
    private options: BulkStatusChangeModalOptions,
  ) {
    super(app);
    this.mappingResolver = new MappingResolver(options.settings);
    this.state = {
      instanceId: options.defaultInstanceId,
      isLoading: false,
      sampleIssueKey: null,
      currentStatus: null,
      transitions: [],
      selectedTransitionId: null,
      error: null,
      board: null,
      availableSprints: [],
      locationAction: 'none',
      selectedSprintId: null,
    };

    const instance = options.instances.find(i => i.id === this.state.instanceId);
    if (instance) {
      this.client = new JiraClient(instance);
    }
  }

  async build(): Promise<void> {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal');
    contentEl.addClass('bulk-status-change-modal');

    contentEl.createEl('h2', { text: 'Bulk Status Change' });

    contentEl.createEl('p', {
      text: this.getTargetDescription(),
      cls: 'modal-description',
    });

    this.buildInstanceSelector(contentEl);
    this.statusContainer = contentEl.createDiv({ cls: 'status-section' });
    this.transitionsContainer = contentEl.createDiv({ cls: 'transitions-section' });
    this.locationContainer = contentEl.createDiv({ cls: 'location-section' });
    this.buildButtons(contentEl);

    await this.loadSampleIssue();
  }

  private buildInstanceSelector(container: HTMLElement): void {
    if (this.options.instances.length <= 1) return;

    const group = container.createDiv({ cls: 'form-group' });
    group.createEl('label', { text: 'Jira Instance' });

    const instanceSelect = group.createEl('select', { cls: 'instance-select' });
    for (const instance of this.options.instances) {
      const option = instanceSelect.createEl('option', {
        text: instance.name,
        value: instance.id,
      });
      if (instance.id === this.state.instanceId) {
        option.selected = true;
      }
    }

    instanceSelect.addEventListener('change', async () => {
      this.state.instanceId = instanceSelect.value;
      const instance = this.options.instances.find(i => i.id === this.state.instanceId);
      this.client = instance ? new JiraClient(instance) : null;
      await this.loadSampleIssue();
    });
  }

  private buildButtons(container: HTMLElement): void {
    const buttonGroup = container.createDiv({ cls: 'button-group' });

    const cancelButton = buttonGroup.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => this.cancel());

    this.submitButton = buttonGroup.createEl('button', {
      text: 'Apply',
      cls: 'mod-cta',
    });
    this.submitButton.disabled = true;
    this.submitButton.addEventListener('click', () => this.handleSubmit());
  }

  private async loadSampleIssue(): Promise<void> {
    if (!this.client) return;

    this.state.isLoading = true;
    this.state.error = null;
    this.updateDisplay();

    try {
      const files = collectMarkdownFiles(this.app, this.options.target);
      const firstFileWithIssue = await this.findFirstFileWithIssueId(files);

      if (!firstFileWithIssue) {
        this.state.error = 'No files with issue_id found in folder';
        return;
      }

      this.state.sampleIssueKey = firstFileWithIssue.issueKey;

      const issue = await this.client.getIssue(this.state.sampleIssueKey, ['status']);
      this.state.currentStatus = (issue.fields.status as any)?.name || '';

      await Promise.all([this.loadTransitions(), this.loadSprintInfo()]);
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load issue';
    } finally {
      this.state.isLoading = false;
      this.updateDisplay();
    }
  }

  private getTargetDescription(): string {
    if (isFolder(this.options.target)) {
      return `Change status for all Jira tickets in folder: ${this.options.target.name}`;
    }
    return `Change status for ${this.options.target.length} selected file${this.options.target.length !== 1 ? 's' : ''}`;
  }

  private async findFirstFileWithIssueId(files: TFile[]): Promise<{ file: TFile; issueKey: string } | null> {
    for (const file of files) {
      const metadata = this.app.metadataCache.getFileCache(file);
      const issueKey = metadata?.frontmatter?.issue_id;
      if (issueKey) {
        return { file, issueKey };
      }
    }

    if (!this.client) return null;

    for (const file of files) {
      const context = this.mappingResolver.resolve(file.path);
      if (!context.projectKey) continue;

      const content = await this.app.vault.read(file);
      const projectConfig = context.projectMapping?.projectConfig;
      const contentParsing = projectConfig?.contentParsing || DEFAULT_CONTENT_PARSING;

      const summary = parseSummaryFromContent(content, contentParsing.summaryPattern, contentParsing.summaryFlags);
      if (!summary) continue;

      try {
        const issues = await this.client.searchIssuesBySummary(context.projectKey, summary, 5);
        const exactMatch = issues.find(i => i.summary.toLowerCase() === summary.toLowerCase());
        if (exactMatch) {
          return { file, issueKey: exactMatch.key };
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async loadTransitions(): Promise<void> {
    if (!this.client || !this.state.sampleIssueKey) return;

    try {
      this.state.transitions = await this.client.getTransitions(this.state.sampleIssueKey);
      if (this.state.transitions.length > 0) {
        this.state.selectedTransitionId = this.state.transitions[0].id;
      }
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load transitions';
      this.state.transitions = [];
    }
  }

  private async loadSprintInfo(): Promise<void> {
    if (!this.client || !this.state.sampleIssueKey) return;

    try {
      const projectKey = this.state.sampleIssueKey.split('-')[0];
      const boards = await this.client.getBoardsForProject(projectKey);

      const scrumBoard = boards.find(b => b.type === 'scrum');
      const kanbanBoard = boards.find(b => b.type === 'kanban');
      const simpleBoard = boards.find(b => b.type === 'simple');

      this.state.board = scrumBoard || kanbanBoard || simpleBoard || boards[0] || null;

      if (scrumBoard) {
        this.state.availableSprints = await this.client.getSprintsForBoard(scrumBoard.id);
      }
    } catch {
      this.state.board = null;
      this.state.availableSprints = [];
    }
  }

  private updateDisplay(): void {
    this.updateStatusDisplay();
    this.updateTransitionsDisplay();
    this.updateLocationDisplay();
    this.updateSubmitButton();
  }

  private updateStatusDisplay(): void {
    if (!this.statusContainer) return;

    this.statusContainer.empty();

    if (this.state.isLoading) {
      this.statusContainer.createDiv({ cls: 'loading', text: 'Loading issue data...' });
      return;
    }

    if (this.state.error) {
      this.statusContainer.createDiv({ cls: 'error-message', text: this.state.error });
      return;
    }

    if (!this.state.sampleIssueKey) return;

    const infoEl = this.statusContainer.createDiv({ cls: 'status-info' });
    infoEl.createSpan({ text: 'Sample issue: ' });
    infoEl.createSpan({ text: this.state.sampleIssueKey, cls: 'issue-key' });
    infoEl.createSpan({ text: ` (${this.state.currentStatus})` });
  }

  private updateTransitionsDisplay(): void {
    if (!this.transitionsContainer) return;

    this.transitionsContainer.empty();

    if (this.state.isLoading || !this.state.sampleIssueKey) return;

    if (this.state.transitions.length === 0) {
      this.transitionsContainer.createDiv({
        cls: 'no-transitions',
        text: 'No transitions available',
      });
      return;
    }

    this.transitionsContainer.createEl('label', { text: 'Change Status To' });

    const list = this.transitionsContainer.createDiv({ cls: 'transitions-list' });

    const noneItem = list.createDiv({
      cls: `transition-item ${this.state.selectedTransitionId === null ? 'selected' : ''}`,
    });
    noneItem.tabIndex = 0;

    const noneRadio = noneItem.createEl('input', {
      type: 'radio',
      attr: { name: 'transition', value: 'none' },
    }) as HTMLInputElement;
    noneRadio.checked = this.state.selectedTransitionId === null;

    const noneLabel = noneItem.createDiv({ cls: 'transition-label' });
    noneLabel.createSpan({ text: 'No change', cls: 'transition-name' });

    noneItem.addEventListener('click', () => {
      this.selectTransition(null);
    });

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
    }
  }

  private updateLocationDisplay(): void {
    if (!this.locationContainer) return;

    this.locationContainer.empty();

    if (this.state.isLoading || !this.state.sampleIssueKey || !this.state.board) return;

    this.locationContainer.createEl('label', { text: 'Move To' });

    const list = this.locationContainer.createDiv({ cls: 'location-list' });

    this.createLocationItem(list, 'none', 'No change');

    const supportsBacklog = ['scrum', 'kanban', 'simple'].includes(this.state.board.type);
    if (supportsBacklog) {
      this.createLocationItem(list, 'backlog', 'Backlog');
    }

    this.createLocationItem(list, 'board', `Board (${this.state.board.name})`);

    if (this.state.availableSprints.length > 0) {
      this.createLocationItem(list, 'sprint', 'Sprint →');

      if (this.state.locationAction === 'sprint') {
        const sprintPicker = this.locationContainer.createDiv({ cls: 'sprint-picker' });
        for (const sprint of this.state.availableSprints) {
          const sprintItem = sprintPicker.createDiv({ cls: 'sprint-picker-item' });
          sprintItem.createSpan({ text: sprint.name });
          sprintItem.createSpan({ text: ` (${sprint.state})`, cls: 'sprint-state' });

          if (this.state.selectedSprintId === sprint.id) {
            sprintItem.addClass('selected');
          }

          sprintItem.addEventListener('click', () => {
            this.state.selectedSprintId = sprint.id;
            this.updateLocationDisplay();
            this.updateSubmitButton();
          });
        }
      }
    }
  }

  private createLocationItem(container: HTMLElement, action: 'none' | 'backlog' | 'board' | 'sprint', label: string): void {
    const item = container.createDiv({
      cls: `location-item ${this.state.locationAction === action ? 'selected' : ''}`,
    });
    item.tabIndex = 0;

    const radio = item.createEl('input', {
      type: 'radio',
      attr: { name: 'location', value: action },
    }) as HTMLInputElement;
    radio.checked = this.state.locationAction === action;

    const labelEl = item.createDiv({ cls: 'location-label' });
    labelEl.createSpan({ text: label });

    item.addEventListener('click', () => {
      this.selectLocation(action);
    });
  }

  private selectTransition(transitionId: string | null): void {
    this.state.selectedTransitionId = transitionId;
    this.updateTransitionsDisplay();
    this.updateSubmitButton();
  }

  private selectLocation(action: 'none' | 'backlog' | 'board' | 'sprint'): void {
    this.state.locationAction = action;
    if (action !== 'sprint') {
      this.state.selectedSprintId = null;
    }
    this.updateLocationDisplay();
    this.updateSubmitButton();
  }

  private updateSubmitButton(): void {
    if (!this.submitButton) return;

    const hasTransition = this.state.selectedTransitionId !== null;
    const hasLocation = this.state.locationAction !== 'none';
    const hasAction = hasTransition || hasLocation;

    const isSprintWithoutSelection = this.state.locationAction === 'sprint' && this.state.selectedSprintId === null;

    this.submitButton.disabled = !hasAction || isSprintWithoutSelection || this.state.isLoading;
  }

  private handleSubmit(): void {
    const result: BulkStatusChangeModalResult = {
      instanceId: this.state.instanceId,
    };

    if (this.state.selectedTransitionId) {
      const transition = this.state.transitions.find(t => t.id === this.state.selectedTransitionId);
      if (transition) {
        result.transitionId = transition.id;
        result.transitionName = transition.name;
      }
    }

    if (this.state.locationAction !== 'none') {
      result.agileAction = this.state.locationAction;
      if (this.state.locationAction === 'sprint' && this.state.selectedSprintId) {
        result.sprintId = this.state.selectedSprintId;
      }
      if ((this.state.locationAction === 'board' || this.state.locationAction === 'backlog') && this.state.board) {
        result.boardId = this.state.board.id;
      }
    }

    this.submit(result);
  }
}
