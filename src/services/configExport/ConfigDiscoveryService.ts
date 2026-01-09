import type { App, TFile, TFolder } from 'obsidian';
import type { ConfigurationReference, ExportedProjectConfig } from '../../types/configExport.types';

export class ConfigDiscoveryService {
  constructor(private app: App) {}

  async discoverConfigs(basePath: string = 'Jira/Configs'): Promise<ConfigurationReference[]> {
    const configs: ConfigurationReference[] = [];

    const baseFolder = this.app.vault.getAbstractFileByPath(basePath);
    if (!baseFolder || !('children' in baseFolder)) {
      return configs;
    }

    const folder = baseFolder as TFolder;
    for (const child of folder.children) {
      if (!('children' in child)) {
        continue;
      }

      const configFolder = child as TFolder;
      const configFile = this.app.vault.getAbstractFileByPath(`${configFolder.path}/config.json`);

      if (!configFile || !('extension' in configFile)) {
        continue;
      }

      try {
        const content = await this.app.vault.read(configFile as TFile);
        const config = JSON.parse(content) as ExportedProjectConfig;

        configs.push({
          id: this.generateId(configFolder.path),
          projectKey: config.meta.projectKey,
          projectName: config.meta.projectName,
          projectType: config.meta.projectType,
          instanceName: config.meta.instanceName,
          instanceId: config.meta.instanceId,
          exportedAt: config.meta.exportedAt,
          folderPath: configFolder.path,
          version: config.meta.version,
          fieldsCount: config.fields?.length || 0,
          issueTypesCount: config.issueTypes?.length || 0,
          workflowsCount: config.workflows?.length || 0,
          boardsCount: config.boardConfigs?.length || config.boards?.length || 0,
        });
      } catch {
        continue;
      }
    }

    configs.sort((a, b) => new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime());

    return configs;
  }

  async getConfigByPath(folderPath: string): Promise<ExportedProjectConfig | null> {
    const configFile = this.app.vault.getAbstractFileByPath(`${folderPath}/config.json`);

    if (!configFile || !('extension' in configFile)) {
      return null;
    }

    try {
      const content = await this.app.vault.read(configFile as TFile);
      return JSON.parse(content) as ExportedProjectConfig;
    } catch {
      return null;
    }
  }

  async deleteConfig(folderPath: string): Promise<boolean> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!folder || !('children' in folder)) {
      return false;
    }

    try {
      await this.app.vault.delete(folder, true);
      return true;
    } catch {
      return false;
    }
  }

  private generateId(path: string): string {
    let hash = 0;
    for (let i = 0; i < path.length; i++) {
      const char = path.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}
