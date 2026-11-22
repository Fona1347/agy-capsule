# Linux 安装指南 / Linux Installation Guide

[中文](#中文) | [English](#english)

## 中文

本指南包含在 Linux 上使用 agy-capsule 的全部步骤：下载、安装插件、让底栏胶囊显示出来、启用插件，以及之后的更新、卸载和排查。

> **想让 AI 代装？** 在 Antigravity 里新开一个对话，发这句话给它：
>
> ```text
> 请按 https://github.com/Lumidarin/agy-capsule/blob/main/docs/linux-install.md 帮我安装 agy-capsule。
> ```
>
> 它会替你完成第 1～3 步。之后你只需要自己完成[第 4 步](#第-4-步启用插件)。AI 没法替你重启 Antigravity，因为它自己就运行在 Antigravity 里。

### 给 AI 助手的说明

如果你是替用户安装的 AI 助手，请按以下要求操作：

1. 准备最新版代码：
   - 用户已有 agy-capsule 的 git 文件夹时，只有同时满足以下条件才复用它：`git remote get-url origin` 指向 `https://github.com/Lumidarin/agy-capsule`、当前在 `main` 分支、`git status --porcelain` 没有输出。满足就运行 `git pull --ff-only origin main`，再确认 `git rev-parse HEAD` 与 `git rev-parse FETCH_HEAD` 输出相同；不同说明本地有额外提交，改用下一条的新目录，不要重置用户的分支。
   - 不满足，或者没有现成的文件夹，就把仓库 `git clone` 到一个新的空目录（例如 `~/agy-capsule`，已被占用就换个名字）。不要改动用户原来的文件夹。
   - 没有 git 的话，重新下载 main 分支的 zip 并解压到新目录。不要使用「下载」里已有的旧解压文件夹，那可能是旧版。
   - 拿不到最新代码时就停下，把报错告诉用户，不要用旧代码安装。
2. 在这个文件夹里运行 `sh install.sh`，确认输出里有「已安装/更新 agy-capsule」。
3. 给 Antigravity 启动项加上 `--remote-debugging-port=0`（不要使用 `sudo`，不要改动系统目录文件）：
   - 先查找现有的 Antigravity `.desktop` 文件（检查 `${XDG_DATA_HOME:-$HOME/.local/share}/applications`、`~/Desktop`、`/usr/share/applications` 和 `/usr/local/share/applications`）：
     - **用户目录里已有 `.desktop` 文件**：直接在其 `Exec=` 行里加上 `--remote-debugging-port=0`（已有就不要重复添加；行尾有 `%U`、`%F` 等占位符时加在它们前面）。除非用户明确要求保留原快捷方式另建一个，否则直接改原文件即可。
     - **只有系统目录里有 `.desktop` 文件**（如 `/usr/share/applications/...`）：把它**同名复制**到 `${XDG_DATA_HOME:-$HOME/.local/share}/applications/`，再给副本的 `Exec=` 行加上 `--remote-debugging-port=0`。同名用户文件会自动覆盖应用菜单里的原图标，不会多出一个重复图标，也不会被软件更新覆盖。
     - **找不到任何 `.desktop` 文件**（例如直接解压压缩包运行，或平时从终端启动）：先询问用户是想新建一个应用菜单图标（由用户决定文件名和显示名，不指定时可用 `antigravity.desktop` / `Antigravity`），还是只在终端启动时带参数或配 shell 别名；确认可执行文件的实际路径后再创建，不要猜测路径，也不要擅自硬编码固定名称。
   - 完成后把修改或新建的 `.desktop` 文件路径、`Exec=` 内容以及还原方式如实告诉用户。
4. 不要修改插件文件、Antigravity 安装目录、系统目录文件（不要自行用 `sudo`）和 Antigravity 的设置，也不要自行安装其他软件。
5. 不要退出或重启 Antigravity。完成后，用用户的语言告诉他接下来要自己做第 4 步。如果哪一步失败了，就把报错原样告诉用户。

### 自己安装

下面的第 1～4 步是给自己动手安装的人看的。让 AI 代装的话，只需要自己完成第 4 步。

### 第 1 步：下载

两种方式任选一种：

- **用 git**（以后更新最方便）：打开终端，运行
  ```sh
  git clone https://github.com/Lumidarin/agy-capsule.git ~/agy-capsule
  ```
- **下载压缩包**：打开[仓库主页](https://github.com/Lumidarin/agy-capsule)，点绿色的 **Code → Download ZIP**，然后解压。

### 第 2 步：运行安装脚本

在终端进入 agy-capsule 目录并运行安装脚本：

```sh
cd ~/agy-capsule
sh install.sh
```

用压缩包下载的话，把 `~/agy-capsule` 换成你的实际解压目录。看到「已安装/更新 agy-capsule 到 …」就说明装好了，插件默认装在 `~/.gemini/config/plugins/agy-capsule`。

### 第 3 步：给启动方式加上调试参数（让底栏胶囊显示）

输入框下方的底栏胶囊，需要 Antigravity 带上 `--remote-debugging-port=0` 参数启动才能显示。不做这一步，侧栏统计照样能用，只是底栏胶囊不会出现。

Linux 下可以直接修改或覆盖原本的快捷方式，不需要强制另建一个。按你的实际情况选一种：

#### 情况一：已有应用菜单或桌面图标（推荐直接改原快捷方式）

- **快捷方式在用户目录**（`~/.local/share/applications/` 或 `~/Desktop/`）：
  直接用文本编辑器打开对应的 `.desktop` 文件（或在桌面环境里右键图标 →「属性」/ 用菜单编辑器修改），在 `Exec=` 行里加上 `--remote-debugging-port=0`（如果行尾有 `%U`、`%F` 等占位符，加在它们前面）：

  ```ini
  Exec=/path/to/Antigravity --remote-debugging-port=0 %U
  ```

- **快捷方式在系统目录**（例如 `/usr/share/applications/`）：
  不建议用 `sudo` 直接改系统文件，因为软件包更新后会把改动还原。把它**同名复制**到当前用户的应用目录，再按上面的方法给副本的 `Exec=` 行加上 `--remote-debugging-port=0`：

  ```sh
  mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  cp /usr/share/applications/<原来的文件名>.desktop "${XDG_DATA_HOME:-$HOME/.local/share}/applications/"
  ```

  用户目录里的同名 `.desktop` 会自动覆盖应用菜单里的系统默认项：原图标和名称保持不变，不会多出一个重复图标，更新也不会覆盖它。想还原时，删掉用户目录里的这个副本即可。

> **想保留原图标、另外再建一个？** 复制或新建 `.desktop` 文件时，使用你自己喜欢的文件名，并把里面的 `Name=` 改成自定义名字即可。

#### 情况二：没有现成的 `.desktop` 快捷方式（例如直接解压压缩包运行）

两种方式任选一种：

- **新建一个 `.desktop` 快捷方式**：在 `${XDG_DATA_HOME:-$HOME/.local/share}/applications/`（默认是 `~/.local/share/applications/`）里新建一个 `.desktop` 文件，文件名和 `Name=` 都可以按自己的习惯自定义，把 `Exec=` 里的路径换成你机器上 `Antigravity` 可执行文件的完整路径（路径含空格时保留双引号）：

  ```ini
  [Desktop Entry]
  Type=Application
  Name=Antigravity
  Exec="/path/to/Antigravity" --remote-debugging-port=0
  Terminal=false
  ```

  如果菜单没有立刻更新，可以运行 `update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications"`（或重新登录桌面）。

- **从终端启动**：启动时带上参数即可（也可以在 `~/.bashrc` 或 `~/.zshrc` 里设一个 alias）：

  ```sh
  /path/to/Antigravity --remote-debugging-port=0
  ```

### 第 4 步：启用插件

1. **完全退出** Antigravity（确认后台进程也已退出，不只是关掉窗口）。
2. 用第 3 步配置好的快捷方式或终端命令重新打开 Antigravity。
3. 在 Antigravity 的 **Plugins** 面板里启用 **agy-capsule**。
4. 在对话顶部点 **… → Extensions → agy-capsule**，打开侧栏。

### 怎么确认成功

- 侧栏能看到上下文和 token 统计。
- 输入框下方出现底栏胶囊，侧栏顶部没有「底栏胶囊未启用」的提示。
- 底栏胶囊没出现时，可以在终端查看调试端口文件作为排查线索。第一行的数字可能来自上一次启动，不能证明这次已经打开；判断是否成功仍以底栏胶囊是否出现为准：

  ```sh
  cat "${XDG_CONFIG_HOME:-$HOME/.config}/Antigravity/DevToolsActivePort"
  ```

### 更新与卸载

- **更新**：在侧栏点 **检查更新 → 更新** 即可一键更新。手动更新时，用 git 下载的在 agy-capsule 目录里运行 `git pull`，再运行 `sh update.sh`；用压缩包下载的重新下载并解压，然后在新目录里运行 `sh update.sh`。插件会自动重启，不用重新启用；从不支持自动重载的旧版首次更新时，需手动重启插件一次。
- **卸载**：在 agy-capsule 目录里运行 `sh uninstall.sh`。插件设置会保留。如果之前改动或新建了 `.desktop` 文件，去掉添加的参数或删掉对应的用户副本即可还原。

### 遇到问题

- **Plugins 面板里找不到插件**：在终端运行 `ls ~/.gemini/config/plugins`，输出里应该有 `agy-capsule`；没有的话重新运行一次 `sh install.sh`。
- **侧栏正常，底栏胶囊不显示**：确认 Antigravity 已完全退出，再从带 `--remote-debugging-port=0` 的快捷方式或命令打开。检查 `.desktop` 文件里的 `Exec=` 是否拼写正确；必要时运行 `update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications"` 刷新菜单缓存。
- **侧栏打不开或一片空白**：请[提交 issue](https://github.com/Lumidarin/agy-capsule/issues)，附上日志文件 `~/.gemini/antigravity/sidecar_data/agy-capsule/agy_capsule/logs/sidecar.log`，以及发行版和 Antigravity 版本。
- **侧栏顶部有提示**：按提示操作即可。解决不了的话，提 issue 时附上提示的截图。

### 注意事项

- **不经过带参数入口的启动不会生效**：例如没有 Antigravity 窗口运行时点 `antigravity://` 链接，或自动更新后重启没带参数，底栏胶囊都不会加载。底栏胶囊消失时，完全退出 Antigravity 再从带参数的入口重新打开即可，不需要更新插件。
- **安全说明**：调试端口只监听本机。用 `--remote-debugging-port=0` 时，系统会自动分配一个空闲的本机端口，不会占用固定端口。端口打开期间，本机上的其他程序也可以通过它控制 Antigravity 窗口，请只在你信任的个人电脑上使用。

---

## English

This guide covers everything needed to use agy-capsule on Linux: downloading, installing the plugin, showing the footer capsule, enabling the plugin, and later updating, uninstalling and troubleshooting.

> **Want an AI to install it?** Start a new conversation in Antigravity and send it this:
>
> ```text
> Please install agy-capsule for me following https://github.com/Lumidarin/agy-capsule/blob/main/docs/linux-install.md
> ```
>
> It will handle steps 1–3. Then you only need to do [Step 4](#step-4-enable-the-plugin) yourself. The AI can't restart Antigravity for you, because it runs inside Antigravity.

### For AI assistants

If you are an AI assistant installing this for the user:

1. Get the latest code:
   - Reuse an existing agy-capsule git folder only if all of these hold: `git remote get-url origin` points to `https://github.com/Lumidarin/agy-capsule`, the current branch is `main`, and `git status --porcelain` prints nothing. If so, run `git pull --ff-only origin main`, then check that `git rev-parse HEAD` and `git rev-parse FETCH_HEAD` print the same commit. If they differ, the local branch has extra commits: use a new folder as in the next item instead, and don't reset the user's branch.
   - Otherwise, or if there is no existing folder, `git clone` the repository into a new empty folder (for example `~/agy-capsule`; pick another name if it's taken). Don't touch the user's existing folder.
   - If git isn't available, download and unzip a fresh copy of the main branch zip into a new folder. Don't reuse an old unzipped folder in Downloads; it may be outdated.
   - If you can't get the latest code, stop and show the user the error. Don't install from old code.
2. In that folder, run `sh install.sh` and confirm the output says "Installed/updated agy-capsule".
3. Add `--remote-debugging-port=0` to the user's Antigravity launcher (without `sudo`, and without editing system directories):
   - First look for existing Antigravity `.desktop` files in `${XDG_DATA_HOME:-$HOME/.local/share}/applications`, `~/Desktop`, `/usr/share/applications`, and `/usr/local/share/applications`:
     - **User-level `.desktop` file exists**: edit its `Exec=` line(s) in place to add `--remote-debugging-port=0` (skip if already present; insert before trailing field codes like `%U` or `%F`). Edit the existing shortcut directly unless the user explicitly asks to keep it untouched and create a separate one.
     - **Only a system `.desktop` file exists** (for example under `/usr/share/applications/`): copy it with the **exact same filename** to `${XDG_DATA_HOME:-$HOME/.local/share}/applications/`, then add `--remote-debugging-port=0` to the copy's `Exec=` line(s). A same-name user entry overrides the system launcher cleanly without `sudo`, without adding a duplicate menu icon, and without being overwritten by package updates.
     - **No `.desktop` file exists** (for example, extracted tarball or terminal launch): ask the user whether they want a new `.desktop` launcher (and what name they prefer, defaulting to `antigravity.desktop` / `Antigravity` if they have no preference) or prefer passing the flag from the terminal / a shell alias. Verify the actual executable path before creating a file — don't guess paths or force a hardcoded name.
   - Report the exact `.desktop` path edited or created, its `Exec=` line, and how to revert it.
4. Don't modify the plugin files, the Antigravity installation folder, system directories (don't run `sudo`), or Antigravity's settings, and don't install any other software.
5. Don't quit or restart Antigravity. When you're done, tell the user, in their language, to do Step 4 themselves. If any step fails, show the user the error as-is.

### Install it yourself

Steps 1–4 below are for installing it yourself. If an AI installs it for you, you only need to do Step 4.

### Step 1: Download

Pick one:

- **With git** (easiest to update later): open a terminal and run
  ```sh
  git clone https://github.com/Lumidarin/agy-capsule.git ~/agy-capsule
  ```
- **As a zip**: on the [repository page](https://github.com/Lumidarin/agy-capsule), click the green **Code → Download ZIP**, then extract it.

### Step 2: Run the installer

In a terminal, go to the agy-capsule folder and run:

```sh
cd ~/agy-capsule
sh install.sh
```

If you downloaded a zip, replace `~/agy-capsule` with your extracted folder. "Installed/updated agy-capsule at …" means it worked. The plugin installs to `~/.gemini/config/plugins/agy-capsule` by default.

### Step 3: Add the debugging flag to your launcher (for the footer capsule)

The footer capsule under the input box only appears when Antigravity starts with `--remote-debugging-port=0`. Without this step the sidebar stats still work; only the footer capsule is missing.

On Linux you can edit or override your existing shortcut directly — there's no need to create a separate icon unless you want one. Pick whichever matches your setup:

#### Case 1: You already have an app menu or desktop shortcut (recommended)

- **User shortcut** (in `~/.local/share/applications/` or `~/Desktop/`):
  Open the `.desktop` file in a text editor (or use your desktop environment's shortcut Properties / menu editor) and add `--remote-debugging-port=0` to its `Exec=` line (before `%U`, `%F`, etc. if present):

  ```ini
  Exec=/path/to/Antigravity --remote-debugging-port=0 %U
  ```

- **System shortcut** (for example in `/usr/share/applications/`):
  Avoid editing it with `sudo`, since package updates will overwrite system files. Instead, copy it with the **same filename** into your user applications directory and add `--remote-debugging-port=0` to the copy's `Exec=` line:

  ```sh
  mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  cp /usr/share/applications/<existing-name>.desktop "${XDG_DATA_HOME:-$HOME/.local/share}/applications/"
  ```

  A same-name `.desktop` file in your user directory automatically overrides the system entry in the application menu: it keeps the original icon and name, avoids duplicate menu items, and survives package updates. Delete that user copy anytime to revert.

> **Prefer a separate shortcut?** When copying or creating the `.desktop` file, pick whatever filename and `Name=` you like.

#### Case 2: No `.desktop` shortcut yet (for example, extracted tarball)

Pick one:

- **Create a `.desktop` shortcut**: in `${XDG_DATA_HOME:-$HOME/.local/share}/applications/` (default `~/.local/share/applications/`), create a `.desktop` file with any filename and `Name=` you like, replacing the path in `Exec=` with the full path to your `Antigravity` executable (keep double quotes if the path has spaces):

  ```ini
  [Desktop Entry]
  Type=Application
  Name=Antigravity
  Exec="/path/to/Antigravity" --remote-debugging-port=0
  Terminal=false
  ```

  If the application menu doesn't update right away, run `update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications"` (or log out and back in).

- **Launch from a terminal**: pass the flag directly (or add a shell alias in `~/.bashrc` or `~/.zshrc`):

  ```sh
  /path/to/Antigravity --remote-debugging-port=0
  ```

### Step 4: Enable the plugin

1. **Quit Antigravity completely** (make sure no background process remains, not just closing the window).
2. Reopen Antigravity using the shortcut or terminal command from Step 3.
3. Enable **agy-capsule** in Antigravity's **Plugins** panel.
4. Open **… → Extensions → agy-capsule** from the conversation header to show the sidebar.

### How to verify

- The sidebar shows context and token stats.
- The footer capsule appears under the input box, and there is no "Footer capsule is off" banner at the top of the sidebar.
- If the footer capsule doesn't appear, the command below is a troubleshooting clue. The number on the first line is the port recorded in the file, which may come from an earlier launch, so it doesn't prove the port is open now; the capsule appearing is what confirms success:

  ```sh
  cat "${XDG_CONFIG_HOME:-$HOME/.config}/Antigravity/DevToolsActivePort"
  ```

### Updating and uninstalling

- **Update**: choose **Check updates → Update** in the sidebar. To update manually, run `git pull` in the agy-capsule folder and then `sh update.sh` (or download and extract a fresh zip and run `sh update.sh` there). The plugin restarts itself; there's no need to enable it again. The first update from an older version without automatic reload needs one manual plugin restart.
- **Uninstall**: run `sh uninstall.sh` in the agy-capsule folder. Your preferences are kept. To undo the launcher change, remove the flag from your `.desktop` file or delete the user override copy you created.

### Troubleshooting

- **The plugin isn't in the Plugins panel**: run `ls ~/.gemini/config/plugins` in a terminal and check that `agy-capsule` is listed; if not, run `sh install.sh` again.
- **Sidebar works, but the footer capsule doesn't appear**: make sure Antigravity was quit completely and reopened from the shortcut or command with `--remote-debugging-port=0`. Check the `Exec=` line of your `.desktop` file for typos, and run `update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications"` if your menu hasn't refreshed.
- **The sidebar won't open or is blank**: please [open an issue](https://github.com/Lumidarin/agy-capsule/issues) and attach the log file `~/.gemini/antigravity/sidecar_data/agy-capsule/agy_capsule/logs/sidecar.log`, along with your Linux distribution and Antigravity version.
- **The sidebar shows a notice**: follow what it says. If that doesn't fix it, attach a screenshot of the notice to your issue.

### Notes

- **Launches that bypass your configured launcher won't carry the flag**: for example, opening an `antigravity://` link when no window is running, or restarting without the flag after an update. If the capsule disappears, quit Antigravity completely and reopen it from your configured launcher. No plugin update is needed.
- **Security**: the debugging port listens on localhost only. With `--remote-debugging-port=0` the OS picks a free local port, so no fixed port is taken. While it's open, other programs on this computer can also control Antigravity windows; use it only on a computer you trust.
