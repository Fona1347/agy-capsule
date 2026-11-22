import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkIdeRelease, createMaintenance, repairIdeShortcuts } from '../ide/maintenance.cjs';
const asset = (version, tag = 'ide-' + version) => ({ name: `agy-capsule-ide-${version}.vsix`, state: 'uploaded', size: 30000,
  browser_download_url: `https://github.com/Lumidarin/agy-capsule/releases/download/${tag}/agy-capsule-ide-${version}.vsix` });
const fetchRelease = releases => async () => ({ ok: true, json: async () => releases });
test('IDE updates use stable IDE asset versions, never desktop release tags', async () => {
  assert.equal((await checkIdeRelease('0.1.6', fetchRelease([{ tag_name: 'v9.9.9', assets: [] }]))).status, 'unpublished');
  const result = await checkIdeRelease('0.1.6', fetchRelease([{ tag_name: 'v1.4.11', assets: [asset('0.1.7', 'v1.4.11'), asset('0.1.5', 'v1.4.11')] }]));
  assert.equal(result.status, 'available'); assert.equal(result.version, '0.1.7');
  assert.match(result.assetUrl, /agy-capsule-ide-0.1.7.vsix$/);
  assert.equal((await checkIdeRelease('0.1.8', fetchRelease([{ tag_name: 'ide-0.1.7', assets: [asset('0.1.7')] }]))).status, 'current');
});
test('draft, external, desktop and invalid IDE assets are ignored', async () => {
  const result = await checkIdeRelease('0.1.6', fetchRelease([{ draft: true, assets: [asset('9.9.9')] },
    { tag_name: 'v1', assets: [{ ...asset('9.9.8'), browser_download_url: 'https://evil.invalid/agy-capsule-ide-9.9.8.vsix' },
      { ...asset('9.9.7'), browser_download_url: 'https://github.com/Lumidarin/agy-capsule/releases/download/a/wrong.vsix' }, { name: 'App.vsix' }] }]));
  assert.equal(result.status, 'unpublished');
});
test('update failure is not reported as current or unpublished', async () => {
  assert.deepEqual(await checkIdeRelease('0.1.6', async () => { throw Error('offline'); }), { status: 'error', reason: 'network' });
});
function harness(everOk = false, notify = true) {
  const calls = [], state = new Map([['agyCapsule.cdpEverOk', everOk]]);
  const vscode = { env: { language: 'en', appRoot: 'C:/IDE/resources/app', openExternal: async u => calls.push(['open', u]) }, Uri: { parse: x => x },
    commands: { executeCommand: async x => calls.push(['command', x]) }, window: { showInformationMessage: async (...args) => { calls.push(['notice', ...args]); return undefined; } } };
  const context = { globalState: { get: (k, d) => state.has(k) ? state.get(k) : d, update: async (k, v) => state.set(k, v) }, extension: { packageJSON: { version: '0.1.6' } } };
  return { calls, vscode, context, make: opts => createMaintenance({ vscode, context, getPrefs: () => ({ notifyCdpRestart: notify }), ...opts }) };
}
test('no first-install nag; only previously healthy debugging failures alert once', () => {
  const h = harness(); const m = h.make(); ['missing','missing','missing'].forEach(m.observeCdp); assert.equal(h.calls.length, 0);
  m.observeCdp('ok'); ['missing','missing','missing','missing'].forEach(m.observeCdp);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][0], 'notice');
  assert.equal(h.calls[0].some(x => typeof x === 'object'), false, 'non-modal notice, no modal option');
});
test('disabled restart notices and disposed maintenance do not alert', () => {
  const h = harness(true, false), m = h.make(); ['unreachable','unreachable','unreachable'].forEach(m.observeCdp); assert.equal(h.calls.length, 0);
  m.dispose(); m.observeCdp('ok'); assert.equal(h.calls.length, 0);
});
test('manual check explains unpublished IDE package and native installation is delegated', async () => {
  const h = harness(), m = h.make({ fetchImpl: fetchRelease([{ tag_name: 'v3.0.0', assets: [] }]) });
  assert.equal((await m.checkUpdates({ manual: true })).status, 'unpublished'); assert.match(h.calls[0][1], /No IDE VSIX release/);
  await m.installVsix(); assert.deepEqual(h.calls[1], ['command', 'workbench.extensions.action.installVSIX']);
});
test('Windows repair modifies only exact IDE target in isolated shortcut fixture', { skip: process.platform !== 'win32' }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'capsule-maint-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const ide = join(root, 'Antigravity IDE.exe'), app = join(root, 'Antigravity.exe'), links = join(root, 'links'); mkdirSync(links);
  writeFileSync(ide, 'fixture'); writeFileSync(app, 'fixture');
  const ps = `$s=New-Object -ComObject WScript.Shell; $a=$s.CreateShortcut($env:LINK_IDE);$a.TargetPath=$env:EXE_IDE;$a.Arguments='--profile Work --user-data-dir="C:\\Profile With Spaces"';$a.Save();$b=$s.CreateShortcut($env:LINK_APP);$b.TargetPath=$env:EXE_APP;$b.Arguments='--keep-this';$b.Save()`;
  const env = { ...process.env, LINK_IDE: join(links, 'IDE.lnk'), EXE_IDE: ide, LINK_APP: join(links, 'App.lnk'), EXE_APP: app };
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const appBefore = readFileSync(env.LINK_APP), ideBefore = readFileSync(env.LINK_IDE);
  const scan = await repairIdeShortcuts({ executablePath: ide, roots: [links], scanOnly: true }); assert.equal(scan.total, 1); assert.equal(scan.status, 'missing'); assert.equal(scan.missing, 1); assert.deepEqual(readFileSync(env.LINK_IDE), ideBefore);
  const fixed = await repairIdeShortcuts({ executablePath: ide, roots: [links] }); assert.equal(fixed.updated, 1); assert.equal(fixed.failed, 0); assert.equal(fixed.missing, 0);
  assert.deepEqual(readFileSync(env.LINK_APP), appBefore);
  const read = `$s=New-Object -ComObject WScript.Shell;($s.CreateShortcut($env:LINK_IDE)).Arguments`;
  const args = execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(read, 'utf16le').toString('base64')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
  assert.match(args, /^--profile Work --user-data-dir="C:\\Profile With Spaces"/); assert.match(args, /--remote-debugging-port=0/); assert.match(args, /--remote-debugging-address=127.0.0.1/);
  assert.equal((await repairIdeShortcuts({ executablePath: ide, roots: [links] })).updated, 0);
});

test('background checks are cached and announce a release once; tests and opt-out do not fetch', async () => {
  const h = harness(); let reads = 0; const fetchImpl = async (...args) => { reads++; return fetchRelease([{ tag_name: 'ide-0.1.7', assets: [asset('0.1.7')] }])(...args); };
  const m = h.make({ fetchImpl }); await m.checkUpdates(); await m.checkUpdates(); assert.equal(reads, 1); assert.equal(h.calls.length, 1);
  await m.downloadUpdate(); assert.equal(h.calls[1][0], 'open'); assert.match(h.calls[1][1], /agy-capsule-ide-0.1.7.vsix$/);
  const disabled = h.make({ getPrefs: () => ({ notifyUpdates: false }), fetchImpl }); await disabled.checkUpdates(); assert.equal(reads, 1);
  h.context.extensionMode = 3; h.vscode.ExtensionMode = { Test: 3 }; const inTest = h.make({ fetchImpl }); await inTest.checkUpdates(); assert.equal(reads, 1);
});

test('release asset paths must match the release tag and cannot escape the repository after URL normalization', async () => {
  const version = '0.1.7', name = 'agy-capsule-ide-0.1.7.vsix';
  for (const url of [
    'https://github.com/Lumidarin/agy-capsule/releases/download/ide-0.1.7/../../../../other/releases/download/x/' + name,
    'https://github.com/Lumidarin/agy-capsule/releases/download/ide-0.1.7/%2e%2e/' + name,
    'https://github.com/Lumidarin/agy-capsule/releases/download/not-this-tag/' + name,
  ]) {
    const result = await checkIdeRelease('0.1.6', fetchRelease([{ tag_name: 'ide-0.1.7', assets: [{ ...asset(version), browser_download_url: url }] }]));
    assert.equal(result.status, 'unpublished');
  }
});
test('shortcut repair preserves non-loopback addresses and does not activate a debug port', { skip: process.platform !== 'win32' }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'capsule-bind-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const ide = join(root, 'Antigravity IDE.exe'); writeFileSync(ide, 'fixture');
  const args = ['--profile Work --remote-debugging-address=0.0.0.0', '--remote-debugging-address 192.168.1.10 --profile Work', '--remote-debugging-address=127.0.0.1 --remote-debugging-address ::', '--remote-debugging-address'];
  for (let i = 0; i < args.length; i++) {
    const file = join(root, 'unsafe-' + i + '.lnk');
    const script = '$s=New-Object -ComObject WScript.Shell;$l=$s.CreateShortcut($env:LINK_FILE);$l.TargetPath=$env:IDE_EXE;$l.Arguments=$env:IDE_ARGS;$l.Save()';
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env: { ...process.env, LINK_FILE: file, IDE_EXE: ide, IDE_ARGS: args[i] }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  const before = args.map((_, i) => readFileSync(join(root, 'unsafe-' + i + '.lnk')));
  const result = await repairIdeShortcuts({ executablePath: ide, roots: [root] });
  assert.equal(result.status, 'partial'); assert.equal(result.manualAddress, args.length); assert.equal(result.updated, 0);
  before.forEach((bytes, i) => assert.deepEqual(readFileSync(join(root, 'unsafe-' + i + '.lnk')), bytes));
});
