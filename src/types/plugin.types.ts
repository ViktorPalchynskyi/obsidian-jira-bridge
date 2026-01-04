import type { App, Editor, Plugin, TFile } from 'obsidian';
import type { PluginSettings } from './settings.types';

export type ServiceToken<T> = {
  name: string;
  _type?: T;
};

export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

export type EventBus = {
  on<T>(event: string, handler: EventHandler<T>): () => void;
  off<T>(event: string, handler: EventHandler<T>): void;
  emit<T>(event: string, payload: T): Promise<void>;
  once<T>(event: string, handler: EventHandler<T>): void;
  clear(): void;
};

export type JiraBridgePluginApi = {
  settings: PluginSettings;
  getService<T>(token: ServiceToken<T>): T;
  getEventBus(): EventBus;
  loadSettings(): Promise<void>;
  saveSettings(): Promise<void>;
} & Plugin;

export type PluginCommand = {
  id: string;
  name: string;
  icon?: string;
  hotkeys?: Hotkey[];
  execute: (ctx: CommandContext) => Promise<void>;
  checkCallback?: (checking: boolean) => boolean | void;
};

export type CommandContext = {
  app: App;
  plugin: JiraBridgePluginApi;
  file?: TFile;
  editor?: Editor;
};

export type Hotkey = {
  modifiers: Modifier[];
  key: string;
};

export type Modifier = 'Mod' | 'Ctrl' | 'Alt' | 'Shift';
