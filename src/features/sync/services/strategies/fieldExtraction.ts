import type { FieldExtractionStrategy } from '../types';

export class NullFieldStrategy implements FieldExtractionStrategy {
  canHandle(value: unknown): boolean {
    return value === null || value === undefined;
  }

  extract(_value: unknown): string | null {
    return null;
  }
}

function isObjectWithName(value: unknown): value is { name: string } {
  return typeof value === 'object' && value !== null && 'name' in value && typeof (value as { name: unknown }).name === 'string';
}

export class NamePropertyStrategy implements FieldExtractionStrategy {
  canHandle(value: unknown): boolean {
    return isObjectWithName(value);
  }

  extract(value: unknown): string | null {
    if (isObjectWithName(value)) {
      return value.name;
    }
    return null;
  }
}

function isObjectWithDisplayName(value: unknown): value is { displayName: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'displayName' in value &&
    typeof (value as { displayName: unknown }).displayName === 'string'
  );
}

export class DisplayNamePropertyStrategy implements FieldExtractionStrategy {
  canHandle(value: unknown): boolean {
    return isObjectWithDisplayName(value);
  }

  extract(value: unknown): string | null {
    if (isObjectWithDisplayName(value)) {
      return value.displayName;
    }
    return null;
  }
}

export class JsonObjectStrategy implements FieldExtractionStrategy {
  canHandle(value: unknown): boolean {
    return typeof value === 'object' && value !== null;
  }

  extract(value: unknown): string | null {
    return JSON.stringify(value);
  }
}

export class PrimitiveFieldStrategy implements FieldExtractionStrategy {
  canHandle(_value: unknown): boolean {
    return true;
  }

  extract(value: unknown): string | null {
    return String(value);
  }
}

export function createDefaultExtractionStrategies(): FieldExtractionStrategy[] {
  return [
    new NullFieldStrategy(),
    new NamePropertyStrategy(),
    new DisplayNamePropertyStrategy(),
    new JsonObjectStrategy(),
    new PrimitiveFieldStrategy(),
  ];
}
