import { App, Notice, DropdownComponent, setIcon } from 'obsidian';
import { BaseModal } from '../../../../ui/modals/BaseModal/BaseModal';
import type { JiraProject, ConfigurationDiff } from '../../../../types';
import type { ComparisonStep, ComparisonState, ProjectSelection, ProjectComparisonModalOptions } from './types';
import { JiraClient } from '../../../../api/JiraClient';
import { ProjectComparisonService, type ComparisonProjectInfo } from '../../services';

export class ProjectComparisonModal extends BaseModal<void> {
  private options: ProjectComparisonModalOptions;
  private comparisonService: ProjectComparisonService;

  private state: ComparisonState = {
    currentStep: 1,
    projectA: null,
    projectB: null,
    comparisonResult: null,
  };

  private projectsA: JiraProject[] = [];
  private projectsB: JiraProject[] = [];
  private selectedInstanceA: string | null = null;
  private selectedInstanceB: string | null = null;
  private isLoading: boolean = false;

  constructor(app: App, options: ProjectComparisonModalOptions) {
    super(app);
    this.options = options;
    this.comparisonService = new ProjectComparisonService();

    const enabledInstances = options.instances.filter(i => i.enabled);
    if (enabledInstances.length > 0) {
      const defaultInstance = enabledInstances.find(i => i.isDefault) || enabledInstances[0];
      this.selectedInstanceA = defaultInstance.id;
      this.selectedInstanceB = defaultInstance.id;
    }
  }

  build(): void {
    const { contentEl } = this;
    contentEl.addClass('jira-bridge-modal', 'project-comparison-modal');

    this.renderHeader();
    this.renderContent();
  }

  private renderHeader(): void {
    const { contentEl } = this;

    const existingHeader = contentEl.querySelector('.wizard-header');
    if (existingHeader) existingHeader.remove();

    const header = contentEl.createDiv('wizard-header');

    header.createEl('h2', {
      text: 'Compare Projects',
      cls: 'modal-title',
    });

    const stepIndicator = header.createDiv('step-indicator');
    const steps = [
      { num: 1, label: 'Project A' },
      { num: 2, label: 'Project B' },
      { num: 3, label: 'Compare' },
      { num: 4, label: 'Results' },
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
        this.renderSelectProjectA(content);
        break;
      case 2:
        this.renderSelectProjectB(content);
        break;
      case 3:
        this.renderComparing(content);
        break;
      case 4:
        this.renderResults(content);
        break;
    }

    this.renderFooter();
  }

  private renderSelectProjectA(container: HTMLElement): void {
    container.createEl('h3', { text: 'Select First Project' });
    container.createEl('p', {
      text: 'Choose the first project to compare.',
      cls: 'step-description',
    });

    const form = container.createDiv('modal-form');
    this.renderProjectSelector(form, 'A');
  }

  private renderSelectProjectB(container: HTMLElement): void {
    container.createEl('h3', { text: 'Select Second Project' });
    container.createEl('p', {
      text: 'Choose the second project to compare with.',
      cls: 'step-description',
    });

    if (this.state.projectA) {
      const selectedInfo = container.createDiv('selected-project-info');
      selectedInfo.createEl('label', { text: 'Comparing with:' });
      selectedInfo.createSpan({
        text: `${this.state.projectA.projectKey} - ${this.state.projectA.projectName}`,
        cls: 'project-name',
      });
    }

    const form = container.createDiv('modal-form');
    this.renderProjectSelector(form, 'B');
  }

  private renderProjectSelector(container: HTMLElement, which: 'A' | 'B'): void {
    const instanceFieldGroup = container.createDiv('field-group');
    instanceFieldGroup.createEl('label', { text: 'Jira Instance' });

    const instanceDropdown = new DropdownComponent(instanceFieldGroup);
    const enabledInstances = this.options.instances.filter(i => i.enabled);

    for (const instance of enabledInstances) {
      instanceDropdown.addOption(instance.id, instance.name);
    }

    const selectedInstance = which === 'A' ? this.selectedInstanceA : this.selectedInstanceB;
    if (selectedInstance) {
      instanceDropdown.setValue(selectedInstance);
    }

    instanceDropdown.onChange(async value => {
      if (which === 'A') {
        this.selectedInstanceA = value;
        this.state.projectA = null;
        this.projectsA = [];
      } else {
        this.selectedInstanceB = value;
        this.state.projectB = null;
        this.projectsB = [];
      }
      this.renderContent();
      await this.loadProjects(which);
    });

    const projectFieldGroup = container.createDiv('field-group');
    projectFieldGroup.createEl('label', { text: 'Project' });

    const projectDropdown = new DropdownComponent(projectFieldGroup);
    projectDropdown.addOption('', 'Select project...');

    const projects = which === 'A' ? this.projectsA : this.projectsB;
    const currentSelection = which === 'A' ? this.state.projectA : this.state.projectB;

    if (projects.length === 0) {
      projectDropdown.setDisabled(true);
      if (selectedInstance && !this.isLoading) {
        this.loadProjects(which);
      }
    } else {
      for (const project of projects) {
        projectDropdown.addOption(project.key, `${project.key} - ${project.name}`);
      }
      if (currentSelection) {
        projectDropdown.setValue(currentSelection.projectKey);
      }
    }

    projectDropdown.onChange(value => {
      const project = projects.find(p => p.key === value);
      const instance = this.options.instances.find(i => i.id === (which === 'A' ? this.selectedInstanceA : this.selectedInstanceB));

      if (project && instance) {
        const selection: ProjectSelection = {
          instanceId: instance.id,
          projectKey: project.key,
          projectName: project.name,
        };

        if (which === 'A') {
          this.state.projectA = selection;
        } else {
          this.state.projectB = selection;
        }
      } else {
        if (which === 'A') {
          this.state.projectA = null;
        } else {
          this.state.projectB = null;
        }
      }

      this.renderFooter();
    });
  }

  private async loadProjects(which: 'A' | 'B'): Promise<void> {
    const instanceId = which === 'A' ? this.selectedInstanceA : this.selectedInstanceB;
    if (!instanceId) return;

    const instance = this.options.instances.find(i => i.id === instanceId);
    if (!instance) return;

    this.isLoading = true;

    try {
      const client = new JiraClient(instance);
      const projects = await client.getProjects();

      if (which === 'A') {
        this.projectsA = projects;
      } else {
        this.projectsB = projects;
      }

      this.isLoading = false;
      this.renderContent();
    } catch (error) {
      this.isLoading = false;
      new Notice(`Failed to load projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private renderComparing(container: HTMLElement): void {
    container.createEl('h3', { text: 'Comparing Projects' });

    const loading = container.createDiv('loading-state');
    const iconSpan = loading.createSpan('loading-icon');
    setIcon(iconSpan, 'loader');
    iconSpan.addClass('spin');
    loading.createSpan({ text: 'Fetching and comparing configurations...' });

    this.runComparison();
  }

  private async runComparison(): Promise<void> {
    if (!this.state.projectA || !this.state.projectB) return;

    try {
      const instanceA = this.options.instances.find(i => i.id === this.state.projectA!.instanceId);
      const instanceB = this.options.instances.find(i => i.id === this.state.projectB!.instanceId);

      if (!instanceA || !instanceB) {
        throw new Error('Instance not found');
      }

      const clientA = new JiraClient(instanceA);
      const clientB = new JiraClient(instanceB);

      const result = await this.comparisonService.compare(clientA, this.state.projectA.projectKey, clientB, this.state.projectB.projectKey);

      this.state.comparisonResult = {
        diff: result.diff,
        projectAInfo: { ...result.projectAInfo, instanceName: instanceA.name },
        projectBInfo: { ...result.projectBInfo, instanceName: instanceB.name },
      };

      this.state.currentStep = 4;
      this.renderHeader();
      this.renderContent();
    } catch (error) {
      new Notice(`Comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.state.currentStep = 2;
      this.renderHeader();
      this.renderContent();
    }
  }

  private renderResults(container: HTMLElement): void {
    container.createEl('h3', { text: 'Comparison Results' });

    if (!this.state.comparisonResult) {
      container.createEl('p', { text: 'No results available.', cls: 'text-muted' });
      return;
    }

    const { projectAInfo, projectBInfo, diff } = this.state.comparisonResult;

    this.renderProjectsSummary(container, projectAInfo, projectBInfo);
    this.renderDiff(container, diff);
  }

  private renderProjectsSummary(
    container: HTMLElement,
    projectA: ComparisonProjectInfo & { instanceName: string },
    projectB: ComparisonProjectInfo & { instanceName: string },
  ): void {
    const summary = container.createDiv('comparison-summary');

    const projectABox = summary.createDiv('project-box project-a');
    projectABox.createEl('h4', { text: 'Project A' });
    projectABox.createDiv({ text: `${projectA.key} - ${projectA.name}`, cls: 'project-name' });
    projectABox.createDiv({ text: projectA.instanceName, cls: 'instance-name text-muted' });
    const statsA = projectABox.createDiv('project-stats');
    statsA.createSpan({ text: `${projectA.fieldsCount} fields` });
    statsA.createSpan({ text: ' • ' });
    statsA.createSpan({ text: `${projectA.issueTypesCount} types` });
    statsA.createSpan({ text: ' • ' });
    statsA.createSpan({ text: `${projectA.boardsCount} boards` });

    const vsDiv = summary.createDiv('vs-divider');
    vsDiv.createSpan({ text: 'vs' });

    const projectBBox = summary.createDiv('project-box project-b');
    projectBBox.createEl('h4', { text: 'Project B' });
    projectBBox.createDiv({ text: `${projectB.key} - ${projectB.name}`, cls: 'project-name' });
    projectBBox.createDiv({ text: projectB.instanceName, cls: 'instance-name text-muted' });
    const statsB = projectBBox.createDiv('project-stats');
    statsB.createSpan({ text: `${projectB.fieldsCount} fields` });
    statsB.createSpan({ text: ' • ' });
    statsB.createSpan({ text: `${projectB.issueTypesCount} types` });
    statsB.createSpan({ text: ' • ' });
    statsB.createSpan({ text: `${projectB.boardsCount} boards` });
  }

  private renderDiff(container: HTMLElement, diff: ConfigurationDiff): void {
    const diffContainer = container.createDiv('diff-container');

    const legend = diffContainer.createDiv('diff-legend');
    const legendA = legend.createSpan('legend-item only-a');
    setIcon(legendA.createSpan(), 'arrow-left');
    legendA.createSpan({ text: 'Only in A' });

    const legendBoth = legend.createSpan('legend-item both');
    setIcon(legendBoth.createSpan(), 'check');
    legendBoth.createSpan({ text: 'In both' });

    const legendB = legend.createSpan('legend-item only-b');
    setIcon(legendB.createSpan(), 'arrow-right');
    legendB.createSpan({ text: 'Only in B' });

    const legendDiff = legend.createSpan('legend-item different');
    setIcon(legendDiff.createSpan(), 'git-compare');
    legendDiff.createSpan({ text: 'Different' });

    const sections = diffContainer.createDiv('diff-sections');

    this.renderDiffSection(sections, 'Custom Fields', diff.fields);
    this.renderDiffSection(sections, 'Issue Types', diff.issueTypes);
    this.renderDiffSection(sections, 'Statuses', diff.workflows);
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
    const onlyInA = category.new.length;
    const onlyInB = category.skipped.length;
    const different = category.modified.length;
    const same = category.unchanged.length;

    const total = onlyInA + onlyInB + different + same;
    if (total === 0) return;

    const section = container.createDiv('diff-section');
    const header = section.createDiv('diff-section-header');

    header.createSpan({ text: title, cls: 'section-title' });

    const badges = header.createDiv('section-badges');
    if (onlyInA > 0) {
      const badge = badges.createSpan('badge only-a');
      badge.textContent = `A: ${onlyInA}`;
    }
    if (same > 0) {
      const badge = badges.createSpan('badge both');
      badge.textContent = `Both: ${same}`;
    }
    if (different > 0) {
      const badge = badges.createSpan('badge different');
      badge.textContent = `Diff: ${different}`;
    }
    if (onlyInB > 0) {
      const badge = badges.createSpan('badge only-b');
      badge.textContent = `B: ${onlyInB}`;
    }

    const content = section.createDiv('diff-section-content');
    let isExpanded = false;

    header.addEventListener('click', () => {
      isExpanded = !isExpanded;
      content.toggleClass('collapsed', !isExpanded);
      header.toggleClass('expanded', isExpanded);
    });

    content.addClass('collapsed');

    for (const item of category.new) {
      this.renderComparisonItem(content, item, 'only-a');
    }
    for (const item of category.modified) {
      this.renderComparisonItem(content, item, 'different');
    }
    for (const item of category.skipped) {
      this.renderComparisonItem(content, item, 'only-b');
    }
    for (const item of category.unchanged) {
      this.renderComparisonItem(content, item, 'both');
    }
  }

  private renderComparisonItem<T extends { name?: string; id: string }>(
    container: HTMLElement,
    item: { item: T; reason?: string },
    status: 'only-a' | 'only-b' | 'different' | 'both',
  ): void {
    const el = container.createDiv('diff-item');
    el.addClass(status);

    const iconSpan = el.createSpan('diff-icon');
    if (status === 'only-a') {
      setIcon(iconSpan, 'arrow-left');
    } else if (status === 'only-b') {
      setIcon(iconSpan, 'arrow-right');
    } else if (status === 'both') {
      setIcon(iconSpan, 'check');
    } else {
      setIcon(iconSpan, 'git-compare');
    }

    el.createSpan({ text: item.item.name || item.item.id, cls: 'diff-name' });

    if (item.reason) {
      el.createSpan({ text: item.reason, cls: 'diff-reason' });
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

    if (this.state.currentStep > 1 && this.state.currentStep < 4) {
      leftButtons
        .createEl('button', {
          text: 'Back',
          cls: 'modal-button',
        })
        .addEventListener('click', () => this.goToStep((this.state.currentStep - 1) as ComparisonStep));
    }

    if (this.state.currentStep < 3) {
      const nextBtn = rightButtons.createEl('button', {
        text: 'Next',
        cls: 'modal-button mod-cta',
      });
      nextBtn.disabled = !this.canProceed();
      nextBtn.addEventListener('click', () => this.goToStep((this.state.currentStep + 1) as ComparisonStep));
    } else if (this.state.currentStep === 4) {
      rightButtons
        .createEl('button', {
          text: 'Export',
          cls: 'modal-button',
        })
        .addEventListener('click', () => this.exportToMarkdown());

      rightButtons
        .createEl('button', {
          text: 'New Comparison',
          cls: 'modal-button',
        })
        .addEventListener('click', () => {
          this.state = {
            currentStep: 1,
            projectA: null,
            projectB: null,
            comparisonResult: null,
          };
          this.renderHeader();
          this.renderContent();
        });

      rightButtons
        .createEl('button', {
          text: 'Close',
          cls: 'modal-button mod-cta',
        })
        .addEventListener('click', () => this.close());
    }
  }

  private canProceed(): boolean {
    switch (this.state.currentStep) {
      case 1:
        return this.state.projectA !== null;
      case 2:
        return this.state.projectB !== null;
      default:
        return false;
    }
  }

  private goToStep(step: ComparisonStep): void {
    this.state.currentStep = step;
    this.renderHeader();
    this.renderContent();
  }

  private async exportToMarkdown(): Promise<void> {
    if (!this.state.comparisonResult || !this.state.projectA || !this.state.projectB) {
      new Notice('No comparison results to export');
      return;
    }

    const { projectAInfo, projectBInfo, diff } = this.state.comparisonResult;
    const instanceA = this.options.instances.find(i => i.id === this.state.projectA!.instanceId);
    const instanceB = this.options.instances.find(i => i.id === this.state.projectB!.instanceId);

    const lines: string[] = [];
    const now = new Date().toISOString();

    lines.push(`# Project Comparison Report`);
    lines.push('');
    lines.push(`**Generated:** ${now}`);
    lines.push('');

    lines.push('## Projects');
    lines.push('');
    lines.push('| | Project A | Project B |');
    lines.push('|---|---|---|');
    lines.push(`| **Key** | ${projectAInfo.key} | ${projectBInfo.key} |`);
    lines.push(`| **Name** | ${projectAInfo.name} | ${projectBInfo.name} |`);
    lines.push(`| **Instance** | ${instanceA?.name || ''} | ${instanceB?.name || ''} |`);
    lines.push(`| **Custom Fields** | ${projectAInfo.fieldsCount} | ${projectBInfo.fieldsCount} |`);
    lines.push(`| **Issue Types** | ${projectAInfo.issueTypesCount} | ${projectBInfo.issueTypesCount} |`);
    lines.push(`| **Boards** | ${projectAInfo.boardsCount} | ${projectBInfo.boardsCount} |`);
    lines.push('');

    this.appendDiffSection(lines, 'Custom Fields', diff.fields);
    this.appendDiffSection(lines, 'Issue Types', diff.issueTypes);
    this.appendDiffSection(lines, 'Statuses', diff.workflows);
    this.appendDiffSection(lines, 'Boards', diff.boards);

    const content = lines.join('\n');
    const fileName = `comparison-${projectAInfo.key}-vs-${projectBInfo.key}-${now.split('T')[0]}.md`;
    const folderPath = 'Jira/Comparisons';

    try {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        await this.app.vault.createFolder(folderPath);
      }

      const filePath = `${folderPath}/${fileName}`;
      await this.app.vault.create(filePath, content);
      new Notice(`Comparison exported to ${filePath}`);
    } catch (error) {
      new Notice(`Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private appendDiffSection<T extends { name?: string; id: string }>(
    lines: string[],
    title: string,
    category: {
      new: { item: T; reason?: string }[];
      modified: { item: T; reason?: string }[];
      skipped: { item: T; reason?: string }[];
      unchanged: { item: T; reason?: string }[];
    },
  ): void {
    const onlyInA = category.new;
    const onlyInB = category.skipped;
    const different = category.modified;
    const same = category.unchanged;

    const total = onlyInA.length + onlyInB.length + different.length + same.length;
    if (total === 0) return;

    lines.push(`## ${title}`);
    lines.push('');
    lines.push(`| Status | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Only in A | ${onlyInA.length} |`);
    lines.push(`| Only in B | ${onlyInB.length} |`);
    lines.push(`| Different | ${different.length} |`);
    lines.push(`| Same | ${same.length} |`);
    lines.push('');

    if (onlyInA.length > 0) {
      lines.push(`### Only in Project A (${onlyInA.length})`);
      lines.push('');
      for (const item of onlyInA) {
        lines.push(`- ${item.item.name || item.item.id}${item.reason ? ` _(${item.reason})_` : ''}`);
      }
      lines.push('');
    }

    if (onlyInB.length > 0) {
      lines.push(`### Only in Project B (${onlyInB.length})`);
      lines.push('');
      for (const item of onlyInB) {
        lines.push(`- ${item.item.name || item.item.id}${item.reason ? ` _(${item.reason})_` : ''}`);
      }
      lines.push('');
    }

    if (different.length > 0) {
      lines.push(`### Different (${different.length})`);
      lines.push('');
      for (const item of different) {
        lines.push(`- ${item.item.name || item.item.id}${item.reason ? ` _(${item.reason})_` : ''}`);
      }
      lines.push('');
    }
  }
}
