# Windows 桌宠原型

1. 在 `feat/windows-desktop-pet` 分支运行 `update.bat`。如果之前没安装过，运行 `install.bat`，并在 Antigravity 的插件界面启用 agy-capsule。
2. 在 Antigravity 桌面端打开一个项目和一条对话。在 agy-capsule 侧栏的 **设置 → 功能** 打开 **桌宠（Windows）**。桌宠会出现在主显示器，拖住棱镜可以移动。
3. 点击棱镜展开输入框，确认显示的项目 ID，输入第一条消息并点 **新建对话**。多行输入支持 Ctrl+Enter 发送。若看不到项目 ID，先在项目内打开侧栏。如果宿主版本仍未提供项目 ID，可以在 `~/.gemini/config/config.json` 的 `sidecars["agy-capsule/agy_capsule"].projectId` 设置固定项目 ID，然后重启 Antigravity。
4. 切到其他软件或最小化 Antigravity，观察「排队中 → 正在工作 → 已完成」，然后点 **打开对话**。打开具体会话使用现有的桌面调试连接。在已有对话中打开桌宠时，它先跟随选中的对话。从桌宠发起新话题后，它会继续跟踪刚创建的会话，点 **跟随当前对话** 可切回来。
5. **隐藏** 会关闭桌宠并关掉设置。退出 Antigravity 后悬浮窗也应一起退出。

原型一次显示一条会话的总体状态。Windows 原生窗口、新建对话返回值和最小化后唤回会话都需要用实际的 Antigravity 桌面端验证。

## 替换素材

素材放在安装目录的 `agy-capsule/sidecars/agy_capsule/pet-assets/`。也可以放到分支里的同名目录，再运行 `update.bat`。放好后关闭并重新启用桌宠。

- 使用透明 PNG，建议 160 × 160 像素。每帧使用相同画布和锚点，显示区域为 80 × 80 逻辑像素。
- 静帧命名为 `idle.png`、`running.png` 等。动画按 `running-01.png`、`running-02.png` 的顺序加载，约 12 FPS。
- 可用的状态是 `idle`、`unknown`、`queued`、`running`、`completed`、`failed`、`interrupted`。运行和排队动画循环，结束状态播放一遍后停住，空闲和等待状态使用静帧。
- 状态没有素材时用 `idle.png`。两者都没有时显示内置棱镜。
