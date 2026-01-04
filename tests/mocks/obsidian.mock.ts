export class Plugin {
  app = {};
  manifest = { id: 'test-plugin' };
  loadData = async () => ({});
  saveData = async () => {};
  addCommand = () => {};
  addRibbonIcon = () => {};
  registerEvent = () => {};
}

export class Modal {
  app = {};
  contentEl = {
    empty: () => {},
    createEl: () => ({ createEl: () => {}, createDiv: () => {} }),
    createDiv: () => ({ createEl: () => {}, createDiv: () => {} }),
    addClass: () => {},
  };
  open = () => {};
  close = () => {};
}

export class Setting {
  setName = () => this;
  setDesc = () => this;
  addText = () => this;
  addToggle = () => this;
  addButton = () => this;
  addDropdown = () => this;
}

export class PluginSettingTab {
  app = {};
  plugin = {};
  containerEl = {
    empty: () => {},
    createEl: () => {},
  };
}

export class Notice {
  constructor(_message: string) {}
}

export type App = Record<string, unknown>;
export type TFile = Record<string, unknown>;
export type Editor = Record<string, unknown>;
