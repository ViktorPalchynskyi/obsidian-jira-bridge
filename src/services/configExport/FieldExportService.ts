import type { App } from 'obsidian';
import type { JiraInstance } from '../../types';
import type {
  ExportedFieldConfig,
  ExportMeta,
  FieldConfig,
  FieldContext,
  FieldOption,
  UserConfig,
  PriorityConfig,
  ExportProgressCallback,
} from '../../types/configExport.types';
import { JiraClient } from '../../api/JiraClient';

const CONFIG_VERSION = '1.0';

export class FieldExportService {
  private client: JiraClient;

  constructor(
    private app: App,
    private instance: JiraInstance,
    private pluginVersion: string,
  ) {
    this.client = new JiraClient(instance);
  }

  async exportFieldConfig(projectKey: string, issueTypeIds: string[], onProgress?: ExportProgressCallback): Promise<ExportedFieldConfig> {
    const progress = (step: string, current: number, total: number, detail?: string) => {
      onProgress?.({ step, current, total, detail });
    };

    progress('Fetching project details', 0, 5);
    const project = await this.client.getProject(projectKey);

    if (project.projectTypeKey !== 'software') {
      throw new Error(`Only software projects are supported. Project ${projectKey} is of type ${project.projectTypeKey}`);
    }

    progress('Fetching fields', 1, 5);
    const rawFields = await this.client.getProjectFields(project.id);

    progress('Fetching field contexts and options', 2, 5);
    const fields = await this.enrichFieldsWithContextsAndOptions(rawFields, issueTypeIds, (current, total) => {
      progress('Fetching field contexts and options', 2, 5, `${current}/${total} fields`);
    });

    progress('Fetching assignable users', 3, 5);
    const assignableUsers = await this.fetchAssignableUsers(projectKey);

    progress('Fetching priorities', 4, 5);
    const priorities = await this.fetchPriorities();

    const meta: ExportMeta = {
      version: CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      pluginVersion: this.pluginVersion,
      projectKey: project.key,
      projectName: project.name,
      projectId: project.id,
      projectType: 'software',
      instanceName: this.instance.name,
      instanceId: this.instance.id,
      selectedIssueTypes: issueTypeIds,
    };

    progress('Export complete', 5, 5);

    return {
      meta,
      fields,
      assignableUsers,
      priorities,
    };
  }

  private async enrichFieldsWithContextsAndOptions(
    rawFields: {
      id: string;
      key: string;
      name: string;
      custom: boolean;
      schema: {
        type: string;
        system?: string;
        custom?: string;
        customId?: number;
        items?: string;
      };
    }[],
    issueTypeIds: string[],
    onFieldProgress?: (current: number, total: number) => void,
  ): Promise<FieldConfig[]> {
    const fields: FieldConfig[] = [];

    for (let i = 0; i < rawFields.length; i++) {
      const rawField = rawFields[i];
      onFieldProgress?.(i + 1, rawFields.length);

      const contexts = await this.fetchFieldContexts(rawField.id, issueTypeIds);
      let options: FieldOption[] = [];

      if (this.isSelectField(rawField.schema.type) && contexts.length > 0) {
        options = await this.fetchFieldOptionsForContexts(rawField.id, contexts);
      }

      fields.push({
        id: rawField.id,
        key: rawField.key,
        name: rawField.name,
        type: rawField.schema.type,
        custom: rawField.custom,
        required: false,
        schema: rawField.schema,
        contexts,
        options,
      });
    }

    return fields;
  }

  private isSelectField(schemaType: string): boolean {
    return ['option', 'option-with-child', 'array'].includes(schemaType);
  }

  private async fetchFieldContexts(fieldId: string, issueTypeIds: string[]): Promise<FieldContext[]> {
    const rawContexts = await this.client.getFieldContexts(fieldId);
    const contexts: FieldContext[] = [];

    for (const ctx of rawContexts) {
      let contextIssueTypeIds: string[] = [];

      if (ctx.isAnyIssueType) {
        contextIssueTypeIds = issueTypeIds;
      } else {
        contextIssueTypeIds = await this.client.getFieldContextIssueTypes(fieldId, ctx.id);
      }

      const relevantIssueTypes = contextIssueTypeIds.filter(id => issueTypeIds.includes(id));

      if (ctx.isGlobalContext || ctx.isAnyIssueType || relevantIssueTypes.length > 0) {
        contexts.push({
          id: ctx.id,
          name: ctx.name,
          isGlobalContext: ctx.isGlobalContext,
          isAnyIssueType: ctx.isAnyIssueType,
          issueTypeIds: ctx.isAnyIssueType ? issueTypeIds : relevantIssueTypes,
        });
      }
    }

    return contexts;
  }

  private async fetchFieldOptionsForContexts(fieldId: string, contexts: FieldContext[]): Promise<FieldOption[]> {
    const allOptions: FieldOption[] = [];
    const seenIds = new Set<string>();

    for (const ctx of contexts) {
      const options = await this.client.getFieldOptions(fieldId, ctx.id);
      for (const opt of options) {
        if (!seenIds.has(opt.id)) {
          seenIds.add(opt.id);
          allOptions.push({
            id: opt.id,
            value: opt.value,
            disabled: opt.disabled,
          });
        }
      }
    }

    return allOptions;
  }

  private async fetchAssignableUsers(projectKey: string): Promise<UserConfig[]> {
    const users = await this.client.getAssignableUsers(projectKey);
    return users.map(u => ({
      accountId: u.accountId,
      displayName: u.displayName,
      emailAddress: undefined,
      active: true,
    }));
  }

  private async fetchPriorities(): Promise<PriorityConfig[]> {
    const priorities = await this.client.getPriorities();
    return priorities.map(p => ({
      id: p.id,
      name: p.name,
      iconUrl: p.iconUrl,
    }));
  }

  async saveToVault(config: ExportedFieldConfig, basePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const folderName = `${config.meta.projectKey}-${timestamp}`;
    const folderPath = `${basePath}/${folderName}`;

    await this.ensureFolderExists(basePath);
    await this.ensureFolderExists(folderPath);

    const jsonContent = JSON.stringify(config, null, 2);
    await this.app.vault.create(`${folderPath}/fields.json`, jsonContent);

    const mdContent = this.generateMarkdown(config);
    await this.app.vault.create(`${folderPath}/fields.md`, mdContent);

    return folderPath;
  }

  private async ensureFolderExists(path: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder) {
      await this.app.vault.createFolder(path);
    }
  }

  private generateMarkdown(config: ExportedFieldConfig): string {
    const lines: string[] = [];

    lines.push(`# Fields Configuration: ${config.meta.projectKey}`);
    lines.push('');
    lines.push(`**Exported:** ${new Date(config.meta.exportedAt).toLocaleString()}`);
    lines.push(`**Project:** ${config.meta.projectName}`);
    lines.push(`**Instance:** ${config.meta.instanceName}`);
    lines.push(`**Plugin Version:** ${config.meta.pluginVersion}`);
    lines.push('');

    lines.push('## Fields Summary');
    lines.push('');
    lines.push('| Field Name | Field ID | Type | Custom | Options |');
    lines.push('|------------|----------|------|--------|---------|');

    for (const field of config.fields) {
      const optionsCount = field.options.length > 0 ? `${field.options.length} options` : '-';
      lines.push(`| ${field.name} | ${field.id} | ${field.type} | ${field.custom ? 'Yes' : 'No'} | ${optionsCount} |`);
    }

    lines.push('');
    lines.push('## Field Details');
    lines.push('');

    for (const field of config.fields) {
      lines.push(`### ${field.name} (${field.id})`);
      lines.push('');
      lines.push(`- **Type:** ${field.type}`);
      lines.push(`- **Custom:** ${field.custom ? 'Yes' : 'No'}`);

      if (field.contexts.length > 0) {
        lines.push(`- **Contexts:** ${field.contexts.length}`);
      }

      if (field.options.length > 0) {
        lines.push(`- **Options** (${field.options.length}):`);
        for (const opt of field.options.slice(0, 20)) {
          lines.push(`  - ${opt.value}${opt.disabled ? ' (disabled)' : ''}`);
        }
        if (field.options.length > 20) {
          lines.push(`  - ... and ${field.options.length - 20} more`);
        }
      }

      lines.push('');
    }

    lines.push('## Assignable Users');
    lines.push('');
    lines.push(`Total: ${config.assignableUsers.length} users`);
    lines.push('');

    for (const user of config.assignableUsers.slice(0, 50)) {
      lines.push(`- ${user.displayName}`);
    }
    if (config.assignableUsers.length > 50) {
      lines.push(`- ... and ${config.assignableUsers.length - 50} more`);
    }

    lines.push('');
    lines.push('## Priorities');
    lines.push('');

    for (const priority of config.priorities) {
      lines.push(`- ${priority.name}`);
    }

    return lines.join('\n');
  }
}
