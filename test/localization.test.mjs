import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalizationStore } from '../agy-capsule/sidecars/agy_capsule/localization.mjs';
import { createSettingsStore } from '../agy-capsule/sidecars/agy_capsule/settings.mjs';

test('Host localization is opt-in and dictionary overrides persist independently of the toggle', t => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-localization-'));
  const file = join(dir, 'localization.sqlite');
  const first = createLocalizationStore(file);
  const second = createLocalizationStore(file);
  const settings = createSettingsStore(join(dir, 'settings.json'));
  t.after(() => { first.close(); second.close(); rmSync(dir, { recursive: true, force: true }); });

  assert.equal(settings.read().localizeHost, false);
  settings.update({ localizeHost: 'true' });
  assert.equal(settings.read().localizeHost, false);
  assert.equal(existsSync(file), false, 'constructing the store does not create the database');
  assert.deepEqual(first.handle({ action: 'save', source: ' ', translation: 'invalid' }), { error: 'invalid-translation' });
  assert.deepEqual(first.handle({ action: 'save', source: 'x'.repeat(1001), translation: 'invalid' }), { error: 'invalid-translation' });
  assert.equal(existsSync(file), false);

  const original = new Map(JSON.parse(second.getPayload()));
  assert.equal(original.get('Settings'), '设置');
  assert.ok(original.size > 4000);
  settings.update({ localizeHost: true });
  assert.equal(settings.read().localizeHost, true);

  assert.deepEqual(first.handle({ action: 'save', source: ' Settings ', translation: ' 偏好 ' }).entry,
    { source: 'Settings', translation: '偏好', customized: true });
  second.handle({ action: 'save', source: '__proto__', translation: '本地词条' });
  first.handle({ action: 'save', source: 'New label', translation: 'New label' });
  settings.update({ localizeHost: false });

  const updated = new Map(JSON.parse(second.getPayload()));
  assert.equal(updated.get('Settings'), '偏好');
  assert.equal(updated.get('__proto__'), '本地词条');
  assert.equal(updated.get('New label'), 'New label');
  assert.deepEqual(first.handle({ action: 'reset', source: 'Settings' }).entry,
    { source: 'Settings', translation: '设置', customized: false });
  assert.equal(second.handle({ action: 'reset', source: '__proto__' }).entry, null);
  assert.equal(new Map(JSON.parse(first.getPayload())).has('__proto__'), false);
  assert.equal(new Map(JSON.parse(second.getPayload())).get('Settings'), '设置');
});
