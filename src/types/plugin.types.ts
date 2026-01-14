import type { App, Editor, Plugin, TFile } from 'obsidian';
import type { PluginSettings } from './settings.types';
import type { SyncResult } from './sync.types';

export type ServiceToken<T> = {
  name: string;
  _type?: T;
};

export interface EventMap {
  'settings:changed': PluginSettings;
  'file:opened': TFile;
  'sync:complete': SyncResult;
}

export type EventName = keyof EventMap;

export type EventHandler<K extends EventName> = (payload: EventMap[K]) => void | Promise<void>;

export type HandlersStore = {
  [K in EventName]?: Set<EventHandler<K>>;
};

export type EventBus = {
  on<K extends EventName>(event: K, handler: EventHandler<K>): () => void;
  off<K extends EventName>(event: K, handler: EventHandler<K>): void;
  emit<K extends EventName>(event: K, payload: EventMap[K]): Promise<void>;
  once<K extends EventName>(event: K, handler: EventHandler<K>): void;
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
