import type { PluginSettings, FolderMapping, ResolvedContext } from '../types';

export class MappingResolver {
  private settings: PluginSettings;

  constructor(settings: PluginSettings) {
    this.settings = settings;
  }

  resolve(filePath: string): ResolvedContext {
    const folderPath = this.getFolderPath(filePath);
    const instanceMapping = this.findInstanceMapping(folderPath);
    const projectMapping = this.findProjectMapping(folderPath);

    if (!instanceMapping) {
      return {
        instance: null,
        instanceMapping: null,
        projectKey: null,
        projectMapping: null,
      };
    }

    const instance = this.settings.instances.find(i => i.id === instanceMapping.instanceId) || null;

    return {
      instance,
      instanceMapping,
      projectKey: projectMapping?.projectKey || null,
      projectMapping,
    };
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  private getFolderPath(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash === -1 ? '' : filePath.substring(0, lastSlash);
  }

  private findInstanceMapping(folderPath: string): FolderMapping | null {
    return this.findMostSpecificMapping(folderPath, 'instance');
  }

  private findProjectMapping(folderPath: string): FolderMapping | null {
    return this.findMostSpecificMapping(folderPath, 'project');
  }

  private findMostSpecificMapping(folderPath: string, type: 'instance' | 'project'): FolderMapping | null {
    const mappings = this.settings.mappings
      .filter(m => m.type === type && m.enabled)
      .filter(m => this.isPathMatch(folderPath, m.folderPath))
      .sort((a, b) => b.folderPath.length - a.folderPath.length);

    return mappings[0] || null;
  }

  private isPathMatch(fileFolderPath: string, mappingFolderPath: string): boolean {
    if (mappingFolderPath === '') {
      return true;
    }
    if (fileFolderPath === mappingFolderPath) {
      return true;
    }
    return fileFolderPath.startsWith(mappingFolderPath + '/');
  }
}
