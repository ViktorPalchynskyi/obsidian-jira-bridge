import { describe, it, expect } from 'vitest';
import {
  NullFieldStrategy,
  NamePropertyStrategy,
  DisplayNamePropertyStrategy,
  JsonObjectStrategy,
  PrimitiveFieldStrategy,
  createDefaultExtractionStrategies,
} from '../../../../../../src/features/sync/services/strategies/fieldExtraction';

describe('NullFieldStrategy', () => {
  const strategy = new NullFieldStrategy();

  it('should handle null values', () => {
    expect(strategy.canHandle(null)).toBe(true);
  });

  it('should handle undefined values', () => {
    expect(strategy.canHandle(undefined)).toBe(true);
  });

  it('should not handle non-null values', () => {
    expect(strategy.canHandle('test')).toBe(false);
    expect(strategy.canHandle(0)).toBe(false);
    expect(strategy.canHandle({})).toBe(false);
  });

  it('should extract null', () => {
    expect(strategy.extract(null)).toBe(null);
    expect(strategy.extract(undefined)).toBe(null);
  });
});

describe('NamePropertyStrategy', () => {
  const strategy = new NamePropertyStrategy();

  it('should handle objects with name property', () => {
    expect(strategy.canHandle({ name: 'Test' })).toBe(true);
  });

  it('should not handle objects without name property', () => {
    expect(strategy.canHandle({ displayName: 'Test' })).toBe(false);
    expect(strategy.canHandle({})).toBe(false);
  });

  it('should not handle objects with non-string name', () => {
    expect(strategy.canHandle({ name: 123 })).toBe(false);
  });

  it('should not handle primitives', () => {
    expect(strategy.canHandle('test')).toBe(false);
    expect(strategy.canHandle(null)).toBe(false);
  });

  it('should extract name property', () => {
    expect(strategy.extract({ name: 'Test Name' })).toBe('Test Name');
  });
});

describe('DisplayNamePropertyStrategy', () => {
  const strategy = new DisplayNamePropertyStrategy();

  it('should handle objects with displayName property', () => {
    expect(strategy.canHandle({ displayName: 'Test' })).toBe(true);
  });

  it('should not handle objects without displayName property', () => {
    expect(strategy.canHandle({ name: 'Test' })).toBe(false);
    expect(strategy.canHandle({})).toBe(false);
  });

  it('should not handle objects with non-string displayName', () => {
    expect(strategy.canHandle({ displayName: 123 })).toBe(false);
  });

  it('should extract displayName property', () => {
    expect(strategy.extract({ displayName: 'Display Name' })).toBe('Display Name');
  });
});

describe('JsonObjectStrategy', () => {
  const strategy = new JsonObjectStrategy();

  it('should handle objects', () => {
    expect(strategy.canHandle({ foo: 'bar' })).toBe(true);
    expect(strategy.canHandle([])).toBe(true);
  });

  it('should not handle null', () => {
    expect(strategy.canHandle(null)).toBe(false);
  });

  it('should not handle primitives', () => {
    expect(strategy.canHandle('test')).toBe(false);
    expect(strategy.canHandle(123)).toBe(false);
  });

  it('should extract as JSON string', () => {
    expect(strategy.extract({ foo: 'bar' })).toBe('{"foo":"bar"}');
    expect(strategy.extract([1, 2, 3])).toBe('[1,2,3]');
  });
});

describe('PrimitiveFieldStrategy', () => {
  const strategy = new PrimitiveFieldStrategy();

  it('should handle any value', () => {
    expect(strategy.canHandle('test')).toBe(true);
    expect(strategy.canHandle(123)).toBe(true);
    expect(strategy.canHandle(true)).toBe(true);
    expect(strategy.canHandle(null)).toBe(true);
  });

  it('should extract as string', () => {
    expect(strategy.extract('test')).toBe('test');
    expect(strategy.extract(123)).toBe('123');
    expect(strategy.extract(true)).toBe('true');
  });
});

describe('createDefaultExtractionStrategies', () => {
  it('should create array of strategies in correct order', () => {
    const strategies = createDefaultExtractionStrategies();

    expect(strategies).toHaveLength(5);
    expect(strategies[0]).toBeInstanceOf(NullFieldStrategy);
    expect(strategies[1]).toBeInstanceOf(NamePropertyStrategy);
    expect(strategies[2]).toBeInstanceOf(DisplayNamePropertyStrategy);
    expect(strategies[3]).toBeInstanceOf(JsonObjectStrategy);
    expect(strategies[4]).toBeInstanceOf(PrimitiveFieldStrategy);
  });
});
