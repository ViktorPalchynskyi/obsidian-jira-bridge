import { describe, it, expect } from 'vitest';
import { FieldExtractor } from '../../../../../src/features/sync/services/FieldExtractor';
import type { FieldExtractionStrategy } from '../../../../../src/features/sync/services/types';

describe('FieldExtractor', () => {
  describe('with default strategies', () => {
    const extractor = new FieldExtractor();

    it('should extract null for null values', () => {
      const fields = { status: null };
      expect(extractor.extract(fields, 'status')).toBe(null);
    });

    it('should extract null for undefined values', () => {
      const fields = {};
      expect(extractor.extract(fields, 'status')).toBe(null);
    });

    it('should extract name property from objects', () => {
      const fields = { status: { name: 'In Progress', id: '3' } };
      expect(extractor.extract(fields, 'status')).toBe('In Progress');
    });

    it('should extract displayName property from objects', () => {
      const fields = { assignee: { displayName: 'John Doe', accountId: '123' } };
      expect(extractor.extract(fields, 'assignee')).toBe('John Doe');
    });

    it('should prefer name over displayName when both exist', () => {
      const fields = { user: { name: 'jdoe', displayName: 'John Doe' } };
      expect(extractor.extract(fields, 'user')).toBe('jdoe');
    });

    it('should return JSON for objects without name or displayName', () => {
      const fields = { customField: { value: 'test', other: 123 } };
      expect(extractor.extract(fields, 'customField')).toBe('{"value":"test","other":123}');
    });

    it('should return string for primitive values', () => {
      const fields = { summary: 'Test summary', points: 5, active: true };
      expect(extractor.extract(fields, 'summary')).toBe('Test summary');
      expect(extractor.extract(fields, 'points')).toBe('5');
      expect(extractor.extract(fields, 'active')).toBe('true');
    });
  });

  describe('with custom strategies', () => {
    it('should use custom strategies when provided', () => {
      const customStrategy: FieldExtractionStrategy = {
        canHandle: (value: unknown) => typeof value === 'string' && value.startsWith('PREFIX:'),
        extract: (value: unknown) => (value as string).replace('PREFIX:', ''),
      };

      const extractor = new FieldExtractor([customStrategy]);
      const fields = { field: 'PREFIX:value' };

      expect(extractor.extract(fields, 'field')).toBe('value');
    });

    it('should return null when no strategy handles the value', () => {
      const neverHandles: FieldExtractionStrategy = {
        canHandle: () => false,
        extract: () => null,
      };

      const extractor = new FieldExtractor([neverHandles]);
      const fields = { field: 'value' };

      expect(extractor.extract(fields, 'field')).toBe(null);
    });
  });
});
