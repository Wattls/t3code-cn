# T3 Code CN · 简体中文社区版

基于 [pingdotgg/t3code](https://github.com/pingdotgg/t3code) 的简体中文社区分叉，保留官方功能，并维护中文界面、macOS 原生菜单和相关修复。本项目由社区维护，不是 T3 Tools 官方发行版。

- **代码与反馈**：[Dealyoung/t3code-cn](https://github.com/Dealyoung/t3code-cn)
- **安装包发布入口**：[GitHub Releases](https://github.com/Dealyoung/t3code-cn/releases)
- **当前基础**：官方 `v0.1.6`，提交 `2359643cffa6ba9ee84d6f2694b935de54a8013e`
- **当前中文构建**：`0.1.6-zh-test.12`，macOS Apple Silicon，测试发布
- **汉化参考**：[ZhiweiXiao98/t3code](https://github.com/ZhiweiXiao98/t3code)，来源与许可证见 [NOTICE.zh-CN.md](./NOTICE.zh-CN.md)

## 中文版包含什么

设置、会话列表、输入框、模型选择、权限、Git/PR、文件预览等界面的简体中文翻译；支持简体中文、English 和跟随系统，并保存语言选择。macOS 应用菜单、编辑菜单与会话右键菜单会跟随当前语言。

已修复会话复制、稍后处理、自动收起等右键子菜单未随语言切换的问题，以及源码打包缺少 Clerk / T3 Connect 公开配置、导致账号入口被隐藏的问题。

本版补齐浏览器批注工具栏、设置下拉框、快捷键命令和动态提示的翻译。网页引用的内部标记显示为“来源”上标；缺少来源网址时提示链接未提供，流式输出中未完成的标记会隐藏，复制文本使用可读占位文字。重新打开历史消息即可生效，无需重新生成或改写记录。

**账号登录页面保持官方英文，使用原版 Clerk 服务和 `t3code://` 协议。** 模型名称、协议值、代码、路径、用户内容以及提供商返回的原始错误不强制翻译。

## 安装与数据

在 [Releases](https://github.com/Dealyoung/t3code-cn/releases) 下载 `T3-Code-CN-arm64.dmg`，校验同一发布中的 `SHA256SUMS.txt`，退出中文 App 后覆盖安装。后续更新沿用同一个中文 App 和固定安装包名称。当前构建使用本机本地证书签名，没有 Apple Developer ID 签名或 Apple 公证。

应用名称暂为 `T3 Code CN Test (Beta)`，与官方版分开保存数据：

| 内容                | 中文版位置                                     |
| ------------------- | ---------------------------------------------- |
| T3 数据             | `~/.t3-zh-test`                                |
| macOS Chromium 配置 | `~/Library/Application Support/t3code-zh-test` |

安装包不包含任何用户数据库、账号凭据、对话或项目文件；不会自动迁移官方版的历史记录。模型提供商仍需在自己的电脑上安装并认证。

两版使用相同的登录回调协议；同时安装时，浏览器登录可能返回 macOS 当前指定的 App。当前发布的本人登录、第三方登录回跳及远程连接仍待进一步验证，详见 [验证说明](./docs/community-cn.md)。

## 从源码构建

先安装项目要求的 Node、Vite+、pnpm，以及官方桌面构建所需的 Rust 和 macOS 工具链，然后运行：

```bash
vp i
sh scripts/build-cn.sh
```

脚本从 `.env.example` 准备官方公开登录配置，构建并校验 DMG，最终只保留固定名称的 `release-cn/T3-Code-CN-arm64.dmg`。以后再次构建会覆盖该安装包，源码历史由 Git 保存。已有 `.env` 或 `.env.local` 时会保留，并检查必需的公开配置。

此构建脚本目前针对 macOS Apple Silicon；其他平台尚未完成中文社区版的打包验收。更多构建、修复与维护范围见 [中文社区维护说明](./docs/community-cn.md)。

本分叉继续跟进官方稳定版本。官方稳定 macOS 发行版确认接入简体中文界面和语言选择后，将暂停重复移植，保留本仓库、历史提交和已发布版本。

---

## 上游项目介绍（英文）

T3 Code is an "agent harness control surface". It enables control of the agents on your machine with a best-in-class mobile app ([iOS](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824), [Android](https://play.google.com/store/apps/details?id=com.t3tools.t3code)), [web app](https://app.t3.codes) and [Electron-based desktop app](https://t3.codes).

Works with your subscriptions on Claude Code, Codex, Cursor, Grok Build, OpenCode, Google Antigravity, and fx. If they're set up on your computer, T3 Code can control them.

## "Wait, what are you selling me?"

Nothing. We built T3 Code because we wanted the best possible development experience with agents. We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar.

We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork and build the editor that you want.

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, Cursor, Grok Build, OpenCode, Antigravity, and fx. Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `agent login`
> - Grok Build: install [Grok Build CLI](https://x.ai/cli) and run `grok login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`
> - Antigravity: enable it in Settings, then use **Install Antigravity** and **Sign in with Google**. No CLI is required.
> - fx: install [fx](https://fx.sh) and run `fx login` on the machine running the T3 Code server ([setup guide](./docs/user/providers-fx.md))

### Command line

```bash
curl -fsSL https://t3.codes/install.sh | sh
```

On Windows, in PowerShell:

```powershell
irm https://t3.codes/install.ps1 | iex
```

Then run `t3` to start the server and open the local web app. `t3 service install` keeps it running in the background, `t3 update` moves to a newer release, and `t3 --help` has the full reference.

To try it once without installing, run `npx t3@latest` instead.

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### Windows (`scoop`)

```bash
scoop install extras/t3code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Debian, Ubuntu (`.deb`)

Download the `.deb` from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), then:

```bash
sudo apt install ./T3-Code-*.deb
```

#### Arch Linux (AUR)

Stable:

```bash
yay -S t3code-bin
```

Nightly:

```bash
yay -S t3code-nightly-bin
```

The AUR packaging is maintained in this repository under [`packaging/aur`](./packaging/aur).

#### Nix (nixpkgs)

```bash
nix profile add github:NixOS/nixpkgs/nixos-unstable#t3code
```

The package is maintained in [nixpkgs](https://github.com/NixOS/nixpkgs/tree/nixos-unstable/pkgs/by-name/t3/t3code)
and includes the desktop app (`t3code-desktop`) and the `t3` command.
See [Nix installation](./docs/user/install.md#nix-nixpkgs) for NixOS configuration and updates.

## Some notes

We are very very early in this project. Expect bugs.

We are (mostly) not accepting contributions yet. Small fixes may be considered. Big features will not be.

## Documentation

Full docs live in [docs/](./docs). There's no docs site yet.

- [FAQ](./docs/user/faq.md)
- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Project settings](./docs/user/project-settings.md)
- [Appearance preferences](./docs/user/appearance.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Connect Claude Code, Codex, ChatGPT and other agents over MCP](./docs/user/outside-agents.md)
- [Keeping app and server in sync](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- Multiple accounts: [Codex](./docs/user/providers-codex.md) · [Claude](./docs/user/providers-claude.md)
- [Run T3 Code as a background service](./docs/user/background-service.md)

Building from source? Start at [docs/internals/overview.md](./docs/internals/overview.md).

## If you REALLY want to contribute still.... read this first

### Install `vp`

T3 Code uses Vite+ so you'll need to install the global `vp` command-line tool.

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

Checkout their getting started guide for more information: https://viteplus.dev/guide/

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before reporting a bug or opening a PR.

Have a feature request? Start an [Ideas discussion](https://github.com/pingdotgg/t3code/discussions/categories/ideas).

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
