export interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface AdfNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  marks?: AdfMark[];
}

export interface AdfDocument {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

export interface DebouncedFunction<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

export interface FieldValidationResult {
  valid: boolean;
  error?: string;
}
