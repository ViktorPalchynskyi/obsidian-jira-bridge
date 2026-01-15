import type { FieldExtractionStrategy } from './types';
import { createDefaultExtractionStrategies } from './strategies/fieldExtraction';

export class FieldExtractor {
  private strategies: FieldExtractionStrategy[];

  constructor(strategies?: FieldExtractionStrategy[]) {
    this.strategies = strategies ?? createDefaultExtractionStrategies();
  }

  extract(fields: Record<string, unknown>, fieldName: string): string | null {
    const value = fields[fieldName];

    for (const strategy of this.strategies) {
      if (strategy.canHandle(value)) {
        return strategy.extract(value);
      }
    }

    return null;
  }
}
