import { Modal, App } from 'obsidian';

export abstract class BaseModal<T> extends Modal {
  protected result: T | null = null;
  protected resolvePromise: ((value: T | null) => void) | null = null;

  constructor(app: App) {
    super(app);
  }

  abstract build(): void;

  onOpen(): void {
    this.build();
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolvePromise?.(this.result);
  }

  open(): Promise<T | null> {
    return new Promise(resolve => {
      this.resolvePromise = resolve;
      super.open();
    });
  }

  protected submit(result: T): void {
    this.result = result;
    this.close();
  }

  protected cancel(): void {
    this.result = null;
    this.close();
  }
}
