import { beforeEach, describe, expect, it } from 'vitest';
import { loadVersioned, saveVersioned, type Migration } from './persistence';

const KEY = 'test.store';

interface Shape {
  count: number;
}

function isShape(value: unknown): value is Shape {
  return typeof value === 'object' && value !== null && typeof (value as Shape).count === 'number';
}

beforeEach(() => {
  localStorage.clear();
});

describe('loadVersioned / saveVersioned — persisted-data versioning', () => {
  it('round-trips data written by saveVersioned at the current version', () => {
    saveVersioned(KEY, 1, { count: 5 });
    const result = loadVersioned<Shape>({
      storageKey: KEY,
      currentVersion: 1,
      migrations: [],
      validate: isShape,
      fallback: () => ({ count: 0 }),
    });
    expect(result).toEqual({ data: { count: 5 }, usedFallback: false });
  });

  it('fails safe to the fallback when nothing is stored yet', () => {
    const result = loadVersioned<Shape>({
      storageKey: KEY,
      currentVersion: 1,
      migrations: [],
      validate: isShape,
      fallback: () => ({ count: 0 }),
    });
    expect(result).toEqual({ data: { count: 0 }, usedFallback: true, reason: 'no stored data' });
  });

  it('regression: fails safe to the fallback on corrupt JSON rather than throwing', () => {
    localStorage.setItem(KEY, '{not valid json');
    const result = loadVersioned<Shape>({
      storageKey: KEY,
      currentVersion: 1,
      migrations: [],
      validate: isShape,
      fallback: () => ({ count: 0 }),
    });
    expect(result.usedFallback).toBe(true);
    expect(result.reason).toBe('corrupt JSON in storage');
    expect(result.data).toEqual({ count: 0 });
  });

  it('applies a sequential migration chain v1 -> v2 -> v3', () => {
    localStorage.setItem(KEY, JSON.stringify({ dataVersion: 1, data: { count: 1 } }));
    const migrations: Migration[] = [
      { fromVersion: 1, migrate: (d) => ({ ...d, count: (d.count as number) + 1 }) }, // -> v2
      { fromVersion: 2, migrate: (d) => ({ ...d, count: (d.count as number) * 10 }) }, // -> v3
    ];
    const result = loadVersioned<Shape>({
      storageKey: KEY,
      currentVersion: 3,
      migrations,
      validate: isShape,
      fallback: () => ({ count: -1 }),
    });
    expect(result).toEqual({ data: { count: 20 }, usedFallback: false }); // (1 + 1) * 10
  });

  it('fails safe when a migration step is missing from the chain', () => {
    localStorage.setItem(KEY, JSON.stringify({ dataVersion: 1, data: { count: 1 } }));
    const result = loadVersioned<Shape>({
      storageKey: KEY,
      currentVersion: 3,
      migrations: [{ fromVersion: 1, migrate: (d) => d }], // no step from v2 -> v3
      validate: isShape,
      fallback: () => ({ count: -1 }),
    });
    expect(result.usedFallback).toBe(true);
    expect(result.reason).toContain('no migration path from version 2');
  });

  it('fails safe when a migration function throws', () => {
    localStorage.setItem(KEY, JSON.stringify({ dataVersion: 1, data: { count: 1 } }));
    const migrations: Migration[] = [
      {
        fromVersion: 1,
        migrate: () => {
          throw new Error('boom');
        },
      },
    ];
    const result = loadVersioned<Shape>({
      storageKey: KEY,
      currentVersion: 2,
      migrations,
      validate: isShape,
      fallback: () => ({ count: -1 }),
    });
    expect(result.usedFallback).toBe(true);
    expect(result.reason).toContain('migration from version 1 threw');
  });

  it('fails safe when the migrated data does not pass validation, rather than loading invalid coaching data', () => {
    localStorage.setItem(KEY, JSON.stringify({ dataVersion: 1, data: { wrongField: 'oops' } }));
    const result = loadVersioned<Shape>({
      storageKey: KEY,
      currentVersion: 1,
      migrations: [],
      validate: isShape,
      fallback: () => ({ count: -1 }),
    });
    expect(result.usedFallback).toBe(true);
    expect(result.reason).toBe('failed validation after migration');
    expect(result.data).toEqual({ count: -1 });
  });

  it('reads legacy (pre-versioning) data via the readLegacy adapter when no envelope exists', () => {
    localStorage.setItem('legacy.key', JSON.stringify({ count: 42 }));
    const result = loadVersioned<Shape>({
      storageKey: KEY,
      currentVersion: 1,
      migrations: [],
      validate: isShape,
      fallback: () => ({ count: -1 }),
      readLegacy: () => {
        const raw = localStorage.getItem('legacy.key');
        return raw ? { dataVersion: 1, data: JSON.parse(raw) } : null;
      },
    });
    expect(result).toEqual({ data: { count: 42 }, usedFallback: false });
  });
});
