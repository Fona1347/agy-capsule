import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { createDesktopPet, desktopPetTurnState } from '../agy-capsule/sidecars/agy_capsule/desktop_pet.mjs';
import { DEFAULT_SETTINGS, normalizeSettings } from '../agy-capsule/sidecars/agy_capsule/settings.mjs';

test('desktop pet is opt-in and uses recorded state before the active-step fallback', () => {
  assert.equal(DEFAULT_SETTINGS.showDesktopPet, false);
  assert.equal(normalizeSettings({ showDesktopPet: 'true' }).showDesktopPet, false);
  assert.equal(desktopPetTurnState('', null), 'idle');
  assert.equal(desktopPetTurnState('selected', null), 'unknown');
  assert.equal(desktopPetTurnState('selected', { turnSpeed: { hasActiveStep: true } }), 'running');
  assert.equal(desktopPetTurnState('selected', {
    turnMetrics: { state: 'queued' }, turnSpeed: { hasActiveStep: true },
  }), 'queued');
});

test('pet targets the displayed project, tracks its new chat, and closes with the sidecar', async t => {
  const first = '11111111-1111-1111-1111-111111111111';
  const second = '22222222-2222-2222-2222-222222222222';
  const created = '33333333-3333-3333-3333-333333333333';
  const states = new Map([[first, 'running'], [second, 'failed'], [created, 'queued']]);
  let showDesktopPet = false;
  const context = { conversationId: first, projectId: 'project-a' };
  const child = new EventEmitter();
  const received = [];
  child.stdin = new Writable({ write(data, encoding, cb) { received.push(JSON.parse(String(data))); cb(); } });
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let launches = 0;
  const sends = [], opens = [];
  let resolveCreation;
  const pendingCreation = new Promise(resolve => { resolveCreation = resolve; });
  const pet = createDesktopPet({
    getPrefs: () => ({ showDesktopPet, settingsLanguage: 'zh-CN' }),
    getContext: () => context,
    getTurn: id => ({ turnMetrics: { state: states.get(id) } }),
    newConversation: (...args) => { sends.push(args); return pendingCreation; },
    openConversation: async (...args) => { opens.push(args); return true; },
    disable: () => { showDesktopPet = false; },
    spawnChild: (file, args, opts) => {
      launches++;
      assert.match(file, /powershell\.exe$/i);
      assert.deepEqual(opts.stdio, ['pipe', 'pipe', 'pipe']);
      assert.equal(Object.keys(opts.env).some(key => key.startsWith('ANTIGRAVITY_')), false);
      return child;
    },
    systemRoot: 'C:/Windows',
  });
  t.after(() => { pet.stop(); child.stdout.end(); child.stderr.end(); });
  pet.sync();
  assert.equal(launches, 0);
  showDesktopPet = true;
  pet.sync();
  pet.sync();
  assert.equal(launches, 1);
  assert.deepEqual(received, [{ state: 'running', projectId: 'project-a', canOpen: true, pinned: false, language: 'zh-CN' }]);
  function action(data) { child.stdout.write(JSON.stringify(data) + '\n'); }
  context.projectId = 'project-b';
  action({ action: 'send', projectId: 'project-a', message: 'wrong project' });
  assert.equal(sends.length, 0);
  assert.ok(received.some(msg => msg.result === 'projectChanged'));
  action({ action: 'send', projectId: 'project-b', message: ' --model example\n中文' });
  action({ action: 'send', projectId: 'project-b', message: 'double click' });
  assert.deepEqual(sends, [['--model example\n中文', 'project-b']]);
  context.conversationId = second;
  resolveCreation({ conversation_id: created });
  await setImmediate();
  assert.equal(received.at(-2).result, 'sent');
  assert.equal(received.at(-1).state, 'queued');
  assert.equal(received.at(-1).pinned, true);
  states.set(created, 'completed');
  pet.sync();
  assert.equal(received.at(-1).state, 'completed');
  action({ action: 'open' });
  await setImmediate();
  assert.deepEqual(opens, [[created, first]]);
  action({ action: 'follow' });
  assert.equal(received.at(-1).state, 'failed');
  action({ action: 'hide' });
  assert.equal(showDesktopPet, false);
  assert.equal(child.stdin.writableEnded, true);
  action({ action: 'send', projectId: 'project-b', message: 'window closed' });
  assert.equal(sends.length, 1);
});
