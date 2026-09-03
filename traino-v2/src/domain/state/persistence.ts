/**
 * Generic versioned-localStorage loader shared by ProfileContext and
 * LogContext. Every persisted store follows the same contract:
 *
 *   read raw string -> parse -> identify dataVersion -> migrate
 *   sequentially to the current version -> validate -> return
 *
 * If any step fails (missing, corrupt JSON, no migration path, fails
 * validation after migrating), we fail SAFE: return the caller's fallback
 * rather than ever handing a partially-migrated or invalid shape to the
 * rest of the app, which could otherwise silently drive bad coaching
 * decisions (NaN calories, an undefined sport, etc).
 */

export interface Migration {
  /** The version this migration upgrades FROM (its output is fromVersion + 1). */
  fromVersion: number;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

export interface LoadResult<T> {
  data: T;
  usedFallback: boolean;
  reason?: string;
}

interface Envelope {
  dataVersion: number;
  data: Record<string, unknown>;
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).dataVersion === 'number' &&
    typeof (value as Record<string, unknown>).data === 'object' &&
    (value as Record<string, unknown>).data !== null
  );
}

export function loadVersioned<T>(options: {
  storageKey: string;
  currentVersion: number;
  migrations: Migration[];
  validate: (data: unknown) => data is T;
  fallback: () => T;
  /** Reads/adapts data written before this store had any version envelope at all
   * (a legacy key, or a bare un-enveloped object). Return null if nothing legacy exists. */
  readLegacy?: () => { dataVersion: number; data: Record<string, unknown> } | null;
}): LoadResult<T> {
  const { storageKey, currentVersion, migrations, validate, fallback, readLegacy } = options;

  let envelope: Envelope | null = null;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isEnvelope(parsed)) {
        envelope = parsed;
      }
    }
  } catch {
    return { data: fallback(), usedFallback: true, reason: 'corrupt JSON in storage' };
  }

  if (!envelope && readLegacy) {
    try {
      const legacy = readLegacy();
      if (legacy) envelope = legacy;
    } catch {
      // legacy read itself failed — fall through to "no data" below.
    }
  }

  if (!envelope) {
    return { data: fallback(), usedFallback: true, reason: 'no stored data' };
  }

  let version = envelope.dataVersion;
  let data = envelope.data;

  while (version < currentVersion) {
    const step = migrations.find((m) => m.fromVersion === version);
    if (!step) {
      return { data: fallback(), usedFallback: true, reason: `no migration path from version ${version}` };
    }
    try {
      data = step.migrate(data);
    } catch {
      return { data: fallback(), usedFallback: true, reason: `migration from version ${version} threw` };
    }
    version += 1;
  }

  if (!validate(data)) {
    return { data: fallback(), usedFallback: true, reason: 'failed validation after migration' };
  }

  return { data, usedFallback: false };
}

export function saveVersioned(storageKey: string, currentVersion: number, data: unknown): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ dataVersion: currentVersion, data }));
  } catch {
    // localStorage unavailable (private mode, quota) — state still holds for this session.
  }
}
