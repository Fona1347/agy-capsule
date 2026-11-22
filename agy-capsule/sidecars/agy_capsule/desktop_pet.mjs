import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./desktop_pet.ps1', import.meta.url));
export const isConversationId = value => typeof value === 'string' &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
export const isProjectId = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);

export function desktopPetTurnState(id, snapshot) {
  if (!id) return 'idle';
  const state = snapshot?.turnMetrics?.state;
  if (['queued', 'running', 'completed', 'failed', 'interrupted'].includes(state)) return state;
  if (snapshot?.turnSpeed?.hasActiveStep) return 'running';
  return 'unknown';
}

function conversationIdOf(result) {
  return [result, result?.conversationId, result?.conversation_id, result?.cascadeId, result?.cascade_id,
    result?.trajectoryId, result?.trajectory_id, result?.id, result?.conversation?.id,
    result?.conversation?.conversationId, result?.response?.conversationId].find(isConversationId);
}

export function createDesktopPet({
  getPrefs, getContext, getTurn, newConversation, openConversation, disable,
  spawnChild = spawn, systemRoot = process.env.SystemRoot, log = console.error,
}) {
  let child = null;
  let attempted = false;
  let stopped = false;
  let pendingSend = false;
  let tracked = null;
  let lastState = '';

  function write(message) {
    if (child?.stdin.writable) child.stdin.write(JSON.stringify(message) + '\n');
  }

  async function onLine(owner, line) {
    if (child !== owner || stopped || !getPrefs().showDesktopPet || line.length > 40_000) return;
    let data;
    try { data = JSON.parse(line); } catch { return; }
    if (data?.action === 'hide') {
      disable();
      sync();
      return;
    }
    if (data?.action === 'follow' && !pendingSend) {
      tracked = null;
      sync();
      return;
    }
    if (data?.action === 'open' && !pendingSend) {
      const id = tracked?.id || getContext().conversationId;
      const opened = isConversationId(id) && await openConversation(id, tracked?.anchor).catch(() => false);
      if (child === owner) write({ result: opened ? 'opened' : 'openUnavailable' });
      return;
    }
    if (data?.action !== 'send' || pendingSend) return;
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    const { projectId, conversationId } = getContext();
    if (!message || message.length > 4000) { write({ result: 'invalidPrompt' }); return; }
    // A click is bound to the project the pet displayed when the user pressed Send.
    if (!isProjectId(projectId) || data.projectId !== projectId) {
      write({ result: 'projectChanged' });
      sync();
      return;
    }
    pendingSend = true;
    let result;
    try {
      const id = conversationIdOf(await newConversation(message, projectId));
      if (id) tracked = { id, anchor: conversationId };
      result = id ? 'sent' : 'unconfirmed';
    } catch {
      result = 'unconfirmed';
    } finally {
      pendingSend = false;
    }
    if (child === owner) write({ result });
    sync();
  }

  function start() {
    attempted = true;
    if (!systemRoot) return;
    const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(SystemRoot|windir|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|PATH|PATHEXT)$/i.test(key)));
    const owner = child = spawnChild(powershell, [
      '-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', script,
    ], { cwd: systemRoot, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const input = createInterface({ input: owner.stdout });
    input.on('line', line => {
      void onLine(owner, line).catch(() => log('[agy-capsule] desktop pet action failed'));
    });
    owner.stdin.on('error', () => {}); // Closing the desktop window can break a pending write.
    owner.stderr.resume(); // Consume helper diagnostics without logging user input or paths.
    owner.once('error', () => log('[agy-capsule] could not start desktop pet'));
    owner.once('close', code => {
      input.close();
      if (child !== owner) return;
      child = null;
      if (code) log('[agy-capsule] desktop pet exited; toggle its setting to restart it');
    });
    lastState = '';
  }

  function close() {
    const owner = child;
    child = null;
    owner?.stdin.end(); // EOF also closes the helper when the sidecar is killed.
  }

  function sync() {
    const prefs = getPrefs();
    if (stopped || !prefs.showDesktopPet) {
      close();
      attempted = false;
      return;
    }
    if (!child && !attempted) {
      try { start(); } catch { log('[agy-capsule] could not start desktop pet'); }
    }
    if (!child) return;
    const { conversationId, projectId } = getContext();
    const id = tracked?.id || conversationId;
    let turn;
    try { if (id) turn = getTurn(id); } catch { /* A temporarily unavailable snapshot is unknown. */ }
    const state = {
      state: desktopPetTurnState(id, turn),
      projectId: isProjectId(projectId) ? projectId : '',
      canOpen: isConversationId(id),
      pinned: !!tracked,
      language: prefs.settingsLanguage,
    };
    const key = JSON.stringify(state);
    if (key === lastState) return;
    lastState = key;
    write(state);
  }

  return { sync, stop() { stopped = true; close(); } };
}
