import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const LOCALIZATION_ROUTE = '/api/localization';
export const MAX_TRANSLATION_LENGTH = 1000;

export function createLocalizationStore(filePath = join(homedir(), '.gemini', 'config', 'agy-capsule', 'localization.sqlite')) {
  let db, base, readVersion, listOverrides, upsert, remove;
  let version, entries, payload;

  function load() {
    base ??= new Map(Object.entries(JSON.parse(readFileSync(new URL('./localization.zh-CN.json', import.meta.url), 'utf8'))));
    if (db) return;
    mkdirSync(dirname(filePath), { recursive: true });
    const connection = new DatabaseSync(filePath);
    try {
      connection.exec(`
        PRAGMA busy_timeout = 3000;
        CREATE TABLE IF NOT EXISTS translations (source TEXT PRIMARY KEY, translation TEXT NOT NULL);
      `);
      readVersion = connection.prepare('PRAGMA data_version');
      listOverrides = connection.prepare('SELECT source, translation FROM translations');
      upsert = connection.prepare('INSERT INTO translations VALUES (?, ?) ON CONFLICT(source) DO UPDATE SET translation = excluded.translation');
      remove = connection.prepare('DELETE FROM translations WHERE source = ?');
      db = connection;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  function refresh() {
    load();
    const nextVersion = readVersion.get().data_version;
    if (version === nextVersion) return;
    const overrides = new Map(listOverrides.all().map(({ source, translation }) => [source, translation]));
    const merged = new Map([...base, ...overrides]);
    entries = [...merged].map(([source, translation]) => ({
      source, translation, customized: overrides.has(source),
    }));
    payload = JSON.stringify([...merged]);
    version = nextVersion;
  }

  function handle(data) {
    const action = data?.action;
    if (!action || action === 'list') {
      refresh();
      return { entries };
    }
    const source = typeof data.source === 'string' ? data.source.trim() : '';
    const translation = typeof data.translation === 'string' ? data.translation.trim() : '';
    if (!source || source.length > MAX_TRANSLATION_LENGTH ||
        (action !== 'reset' && (action !== 'save' || !translation || translation.length > MAX_TRANSLATION_LENGTH))) {
      return { error: 'invalid-translation' };
    }
    load();
    if (action === 'reset' || translation === base.get(source)) {
      remove.run(source);
      version = undefined;
      return { entry: base.has(source) ? { source, translation: base.get(source), customized: false } : null };
    }
    upsert.run(source, translation);
    version = undefined;
    return { entry: { source, translation, customized: true } };
  }

  return {
    handle,
    getPayload() {
      refresh();
      return payload;
    },
    close() {
      db?.close();
      db = undefined;
      version = undefined;
    },
  };
}
