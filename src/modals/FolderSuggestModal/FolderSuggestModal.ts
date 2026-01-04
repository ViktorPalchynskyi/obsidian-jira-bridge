import { App, FuzzySuggestModal, TFolder } from 'obsidian';

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private resolvePromise: ((value: string | null) => void) | null = null;
  private chosenPath: string | null = null;
  private wasChosen = false;
  private basePath: string | null = null;

  constructor(app: App, basePath?: string) {
    super(app);
    this.basePath = basePath || null;
    this.setPlaceholder(basePath ? `Select a folder in ${basePath}...` : 'Select a folder...');
  }

  getItems(): TFolder[] {
    const allFolders = this.app.vault.getAllFolders(false);
    if (this.basePath) {
      return allFolders.filter(f => f.path.startsWith(this.basePath!));
    }
    return allFolders;
  }

  getItemText(folder: TFolder): string {
    return folder.path || '/';
  }

  onChooseItem(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
    this.chosenPath = folder.path;
    this.wasChosen = true;
  }

  onClose(): void {
    super.onClose();
    setTimeout(() => {
      if (this.wasChosen) {
        this.resolvePromise?.(this.chosenPath);
      } else {
        this.resolvePromise?.(null);
      }
    }, 10);
  }

  open(): Promise<string | null> {
    return new Promise(resolve => {
      this.resolvePromise = resolve;
      super.open();
    });
  }
}
