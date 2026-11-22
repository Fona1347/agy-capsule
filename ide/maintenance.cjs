const { execFile } = require('node:child_process');
const { resolve, basename, join } = require('node:path');

const RELEASES = 'https://api.github.com/repos/Lumidarin/agy-capsule/releases?per_page=100';
const RELEASES_PAGE = 'https://github.com/Lumidarin/agy-capsule/releases';
const IDE_ASSET = /^agy-capsule-ide-(\d+\.\d+\.\d+)\.vsix$/;
const versionParts = value => /^\d+\.\d+\.\d+$/.test(value || '') ? value.split('.').map(Number) : null;
const compare = (a, b) => { const x = versionParts(a), y = versionParts(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]); return 0; };

async function checkIdeRelease(currentVersion, fetchImpl = fetch) {
  if (!versionParts(currentVersion)) return { status: 'error', reason: 'localVersion' };
  try {
    const response = await fetchImpl(RELEASES, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'agy-capsule-ide' }, redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { status: 'error', reason: response.status === 403 || response.status === 429 ? 'rateLimit' : 'http' };
    const releases = await response.json();
    if (!Array.isArray(releases)) return { status: 'error', reason: 'response' };
    const candidates = releases.filter(r => !r.draft && !r.prerelease).flatMap(r => (r.assets || []).flatMap(a => {
      const match = IDE_ASSET.exec(a.name || '');
      if (!match || a.state !== 'uploaded' || !Number.isSafeInteger(a.size) || a.size <= 0) return [];
      // A desktop App tag/version is deliberately not used to version the IDE.
      const expected = 'https://github.com/Lumidarin/agy-capsule/releases/download/';
      if (typeof a.browser_download_url !== 'string' || !a.browser_download_url.startsWith(expected)) return [];
      const assetUrl = new URL(a.browser_download_url);
      const assetPath = '/Lumidarin/agy-capsule/releases/download/' + encodeURIComponent(r.tag_name) + '/' + encodeURIComponent(a.name);
      if (assetUrl.origin !== 'https://github.com' || assetUrl.username || assetUrl.password || assetUrl.search || assetUrl.hash || assetUrl.pathname !== assetPath) return [];
      return [{ version: match[1], assetUrl: assetUrl.href, releaseUrl: RELEASES_PAGE + '/tag/' + encodeURIComponent(r.tag_name) }];
    })).sort((a, b) => compare(b.version, a.version));
    const newest = candidates[0];
    if (!newest) return { status: 'unpublished', currentVersion };
    return { status: compare(newest.version, currentVersion) > 0 ? 'available' : 'current', currentVersion, ...newest };
  } catch { return { status: 'error', reason: 'network' }; }
}

// Runs only after an explicit repair command; default roots are the current
// user's locations, never CommonStartMenu/CommonDesktop or App shortcuts.
function shortcutScript() {
  return `
$ErrorActionPreference = 'Stop'
$wanted = [IO.Path]::GetFullPath($env:AGY_IDE_EXE)
if ((Split-Path -Leaf $wanted) -cne 'Antigravity IDE.exe' -or -not [IO.File]::Exists($wanted)) { throw 'IDE executable not found' }
$roots = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('StartMenu'), (Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'))
if ($env:AGY_IDE_TEST_ROOTS) { $roots = @($env:AGY_IDE_TEST_ROOTS | ConvertFrom-Json) }
$shell = New-Object -ComObject WScript.Shell
$total = 0; $updated = 0; $failed = 0; $missing = 0; $manualAddress = 0
foreach ($root in ($roots | Select-Object -Unique)) {
  if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
  $errors = @()
  $files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.lnk' -ErrorAction SilentlyContinue -ErrorVariable errors)
  $failed += $errors.Count
  foreach ($file in $files) {
    try {
      $link = $shell.CreateShortcut($file.FullName)
      if (-not $link.TargetPath -or [IO.Path]::GetFullPath($link.TargetPath) -ine $wanted) { continue }
      $total++
      $argsBefore = [string]$link.Arguments
      # Never enable a debug port when an existing bind address is non-loopback.
      # Preserve it for the user to change deliberately, including separate-value flags.
      $addressFlags = [regex]::Matches($argsBefore, '(?i)(^|\\s)--remote-debugging-address(?=\\s|=|$)')
      $addresses = [regex]::Matches($argsBefore, '(?i)(^|\\s)--remote-debugging-address(?:=|\\s+)([^\\s]+)')
      $unsafeAddress = $addressFlags.Count -ne $addresses.Count
      foreach ($address in $addresses) {
        $value = $address.Groups[2].Value.Trim([char[]]@([char]34, [char]39))
        if ($value -notin @('127.0.0.1', 'localhost', '::1', '[::1]')) { $unsafeAddress = $true }
      }
      if ($unsafeAddress) { $manualAddress++; continue }
      $argsAfter = $argsBefore
      if ($argsAfter -notmatch '(^|\\s)--remote-debugging-port(?:=\\S*)?(?=\\s|$)') { $argsAfter += ' --remote-debugging-port=0' }
      if ($argsAfter -notmatch '(^|\\s)--remote-debugging-address(?:=\\S*)?(?=\\s|$)') { $argsAfter += ' --remote-debugging-address=127.0.0.1' }
      if ($argsAfter -ceq $argsBefore) { continue }
      $missing++
      if ($env:AGY_IDE_SCAN_ONLY -eq '1') { continue }
      $link.Arguments = $argsAfter.Trim()
      if ([string]$link.Arguments -cne $argsAfter.Trim()) { throw 'Shortcut arguments truncated' }
      $link.Save()
      $saved = $shell.CreateShortcut($file.FullName)
      if ([string]$saved.Arguments -cne $argsAfter.Trim()) { throw 'Shortcut verification failed' }
      $updated++; $missing--
    } catch { $failed++ }
  }
}
@{ total = $total; updated = $updated; failed = $failed; missing = $missing; manualAddress = $manualAddress } | ConvertTo-Json -Compress
`;
}

async function repairIdeShortcuts({ executablePath, execFileImpl = execFile, platform = process.platform, scanOnly = false, roots } = {}) {
  if (platform !== 'win32') return { status: 'unsupported', total: 0, updated: 0, failed: 0 };
  if (basename(executablePath || '') !== 'Antigravity IDE.exe') return { status: 'error', reason: 'executable' };
  const script = Buffer.from(shortcutScript(), 'utf16le').toString('base64');
  return new Promise(resolveResult => {
    execFileImpl(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', script], {
        windowsHide: true, timeout: 12000, encoding: 'utf8', env: { ...process.env, AGY_IDE_EXE: executablePath,
          AGY_IDE_SCAN_ONLY: scanOnly ? '1' : '', AGY_IDE_TEST_ROOTS: roots ? JSON.stringify(roots) : '' },
      }, (err, stdout) => {
        if (err) return resolveResult({ status: 'error', reason: 'scan' });
        try { const data = JSON.parse(String(stdout).replace(/^\uFEFF/, '')); resolveResult({ status: data.failed || data.manualAddress ? 'partial' : data.missing ? 'missing' : data.total ? 'ok' : 'notFound', ...data }); }
        catch { resolveResult({ status: 'error', reason: 'response' }); }
      });
  });
}

function createMaintenance({ vscode, context, getPrefs = () => ({}), executablePath, fetchImpl, now = Date.now } = {}) {
  const zh = vscode.env.language.toLowerCase().startsWith('zh');
  const text = (en, cn) => zh ? cn : en;
  let checked, checkedAt = 0, checking, notified = false, failures = 0, disposed = false, announcedVersion;
  let everOk = context.globalState.get('agyCapsule.cdpEverOk', false);
  const installVsix = () => vscode.commands.executeCommand('workbench.extensions.action.installVSIX');
  async function repairShortcuts() {
    const result = await repairIdeShortcuts({ executablePath: executablePath || resolve(vscode.env.appRoot, '..', '..', 'Antigravity IDE.exe') });
    const message = result.manualAddress ? text('An IDE shortcut already binds debugging to a non-loopback address. It was not changed and no debugging port was added. Change its --remote-debugging-address to 127.0.0.1 manually, then retry.', 'IDE 快捷方式已有非本机调试绑定地址。未改动该快捷方式，也未补调试端口。请先手动把 --remote-debugging-address 调整为 127.0.0.1，再重试。') : result.status === 'ok'
      ? text(`IDE shortcuts checked: ${result.total}; updated: ${result.updated}. Quit and reopen IDE from the shortcut to enable input capsules.`, `已检查 ${result.total} 个 IDE 快捷方式，补齐 ${result.updated} 个。完全退出 IDE 后从快捷方式重开即可恢复输入框胶囊。`)
      : text('Could not repair all user IDE shortcuts. Start Antigravity IDE with --remote-debugging-port=0 --remote-debugging-address=127.0.0.1.', '没有修复全部用户 IDE 快捷方式。可带 --remote-debugging-port=0 --remote-debugging-address=127.0.0.1 启动 IDE。');
    await vscode.window.showInformationMessage(message);
    return result;
  }
  async function loadUpdate(manual) {
    if (!checked || now() - checkedAt >= (manual ? 5000 : 6 * 60 * 60_000)) {
      checking ??= checkIdeRelease(context.extension.packageJSON.version, fetchImpl).then(result => { checked = result; checkedAt = now(); return result; }).finally(() => { checking = null; });
      await checking;
    }
    return checked;
  }
  async function downloadUpdate() {
    const result = await loadUpdate(true);
    if (disposed) return result;
    if (result.status === 'available') await vscode.env.openExternal(vscode.Uri.parse(result.assetUrl));
    else await vscode.window.showInformationMessage(text('No newer published IDE VSIX is available to download.', '未找到可下载的新版 IDE VSIX 包。'));
    return result;
  }
  async function checkUpdates({ manual = false } = {}) {
    if (!manual && (getPrefs().notifyUpdates === false || (vscode.ExtensionMode?.Test !== undefined && context.extensionMode === vscode.ExtensionMode.Test))) return null;
    await loadUpdate(manual);
    if (disposed || (!manual && (checked.status !== 'available' || announcedVersion === checked.version))) return checked;
    if (!manual) announcedVersion = checked.version;
    const install = text('Install VSIX…', '安装 VSIX…'), release = text('Release notes', '版本说明'), download = text('Download VSIX', '下载 VSIX');
    const messages = {
      available: text(`agy-capsule IDE ${checked.version} is available.`, `agy-capsule IDE ${checked.version} 已发布。`),
      current: text(`No newer published IDE package was found (installed ${checked.currentVersion}).`, `没有找到比本机 ${checked.currentVersion} 更新的已发布 IDE 包。`),
      unpublished: text(`No IDE VSIX release is published yet. Installed ${checked.currentVersion}; desktop App versions are not IDE updates.`, `尚未发现已发布的 IDE VSIX 包。本机为 ${checked.currentVersion}；桌面 App 版本不能当成 IDE 更新。`),
      error: text('IDE update check failed. The installed version was not changed.', 'IDE 更新检查失败，未改动已安装版本。'),
    };
    const action = await vscode.window.showInformationMessage(messages[checked.status], ...(checked.status === 'available' ? [download, install, release] : manual ? [install] : []));
    if (action === install) await installVsix();
    else if (action === download) await vscode.env.openExternal(vscode.Uri.parse(checked.assetUrl));
    else if (action === release) await vscode.env.openExternal(vscode.Uri.parse(checked.releaseUrl));
    return checked;
  }
  function observeCdp(state) {
    if (disposed) return;
    if (state === 'ok') { failures = 0; if (!everOk) { everOk = true; void context.globalState.update('agyCapsule.cdpEverOk', true); } return; }
    if (!['missing', 'unreachable'].includes(state)) { failures = 0; return; }
    if (++failures < 3 || !everOk || notified || getPrefs().notifyCdpRestart === false) return;
    notified = true;
    const fix = text('Repair IDE shortcut', '修复 IDE 快捷方式');
    void vscode.window.showInformationMessage(text('agy-capsule: IDE input capsules lost their local debugging connection. Sidebar statistics remain available.', 'agy-capsule：IDE 输入框胶囊的本机调试连接已断开，侧栏统计仍可使用。'), ...(process.platform === 'win32' ? [fix] : [])).then(action => { if (!disposed && action === fix) return repairShortcuts(); });
  }
  return { observeCdp, checkUpdates, downloadUpdate, installVsix, repairShortcuts, dispose() { disposed = true; } };
}
module.exports = { checkIdeRelease, repairIdeShortcuts, createMaintenance, shortcutScript };
