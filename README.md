# SkillHub

![beta](https://img.shields.io/badge/status-beta_v0.1-orange) ![platform](https://img.shields.io/badge/platform-Windows_10_11_x64-blue) ![privacy](https://img.shields.io/badge/data-local_only-green)

**简体中文** · [English](#english)

> 📮 欢迎关注作者的微信公众号「海绵朋克」。更多 AI 开发实践和思考会在公众号分享。

<p align="center">
  <img src="docs/wechat-hmpunk.jpg" alt="微信公众号：海绵朋克" width="220" />
</p>

**SkillHub** 是一个跨 AI coding agent 的「扩展资源中转台」：把 skills、MCP 收敛到本机一个中心库，再分发同步到多个 agent —— **ZCode、Claude Code、Codex、WorkBuddy、Kimi Code、豆包（DoubaoWork）**。

> ⚠️ 其中 **Kimi Code** 为本版本发布当日临时补充的适配（skills 经 `~/.agents/skills` 共享层分发，由 Kimi 内置网关自动收集），成熟度暂不及其他 agent；MCP 需在 Kimi 应用内配置。

一个桌面应用，管住所有 agent 的扩展资源：不用再手动复制粘贴 skill 目录、不用逐个 agent 改配置。

## 下载安装

支持系统：**Windows 10 / 11（x64）**。前往 [Releases 页面](https://github.com/YeeKuson/SkillHub/releases/latest) 下载：

| 下载 | 适合 | 说明 |
|---|---|---|
| `SkillHub_0.1.0_x64_zh-CN.msi` | 大多数用户（推荐） | 标准安装向导，自动处理运行依赖；安装后首次启动会自动预填 3 个示例 skill |
| `SkillHub_0.1.0-beta_x64_portable.zip` | 免安装用户 | 解压即用；运行所需文件（exe + CLI 内核 + 预填 skill）全部在内 |

> ⚠️ 需要系统已安装 [Node.js](https://nodejs.org/)（18 及以上，LTS 即可）——当前 beta 版的内核通过它运行，后续版本计划内嵌运行时免除此依赖。

## 快速上手

1. 打开 SkillHub，首次启动会自动预填 3 个示例 skill（architecture-first-coding、skill-mentor、html-exhibition）。
2. 右上角「Agent 管理」确认你的 agent 已被识别（默认探测各 agent 的用户目录，识别不到可手动定位配置文件夹）。
3. 在 skill 气泡卡的开关上点击，即可把资源同步/启停到对应 agent；「测试连接」可对 MCP 做协议握手验证。
4. 点击气泡卡片可查看详情：简介、来源、各 agent 独立开关。

### 导入规则

- **GitHub / Gitee 链接**：支持仓库主页、`/tree/分支/`、`/blob/` 链接，自动向下最多 4 层查找 `SKILL.md`；多 skill 仓库可全部入库。
- **本地文件夹**：指向 skill 文件夹（内含 `SKILL.md`）或其上层目录均可。
- **zip 压缩包**：直接选择 zip，自动解压扫描。
- `SKILL.md` 是 skill 的必备清单（YAML 头需含 `name` 与 `description`）。

### MCP 说明（重要）

MCP 的跨端同步受各 agent 机制限制，**不如 skill 即装即用**：同步后可能需要重启对应 agent，部分服务还需认证配置才能连通。正式使用**建议直接在 agent 中单独配置**；本平台的同步、启停与连通性测试仅作参考与辅助。

## 隐私与安全

- 全部功能**本地运行**：中心库位于 `~/.skillhub`，不上传任何数据到任何服务器。
- MCP 密钥使用占位符机制：真实值只存本机 `secrets.json`，永不进入配置与分发内容。
- 对外网络请求仅限：显式添加 skill 时的代码仓库克隆、MCP 连通性测试（默认拒绝内网地址，可用参数放开）。

## 界面语言

界面默认中文，右上角 **EN** 按钮可切换英文。

---

## English

**SkillHub** is a desktop hub for AI coding agents: it consolidates skills and MCP servers into one local library, then syncs them across **ZCode, Claude Code, Codex, WorkBuddy, Kimi Code and DoubaoWork**.

> ⚠️ **Kimi Code** support was added on this release day as a provisional adapter (skills are distributed via the `~/.agents/skills` shared layer, collected automatically by Kimi's built-in gateway); it is less mature than the other agents, and MCP must be configured inside the Kimi app.

No more copying skill folders by hand or editing each agent's config — manage everything from one place with per-agent toggles.

**简体中文** · [English](#english)（top of page）

### Download

Supported OS: **Windows 10 / 11 (x64)**. Get it from the [Releases page](https://github.com/YeeKuson/SkillHub/releases/latest):

| Download | Best for | Notes |
|---|---|---|
| `SkillHub_0.1.0_x64_zh-CN.msi` | Most users (recommended) | Standard installer; 3 sample skills are pre-filled on first launch |
| `SkillHub_0.1.0-beta_x64_portable.zip` | Portable use | Extract & run; the exe, CLI kernel and sample skills are all included |

> ⚠️ Requires [Node.js](https://nodejs.org/) 18+ installed on the system — the beta kernel runs through it; a future release will bundle the runtime.

### Quick start

1. Launch SkillHub — 3 sample skills (architecture-first-coding, skill-mentor, html-exhibition) are pre-filled on first run.
2. Open the **Agents** panel (top-right) to confirm your agents are detected (user-profile folders are probed by default; you can locate a config folder manually).
3. Click the toggles on a skill card to sync/enable it per agent; use **Test connection** to handshake-verify an MCP server.
4. Click a card for details: description, source, and per-agent toggles.

### Import rules

- **GitHub / Gitee links**: repo home, `/tree/branch/` or `/blob/` links; `SKILL.md` is searched up to 4 levels deep; multi-skill repos are fully listed.
- **Local folder**: point at the skill folder (containing `SKILL.md`) or any of its parents.
- **zip archive**: pick a zip directly — it is extracted and scanned automatically.
- `SKILL.md` is the required manifest (YAML header with `name` and `description`).

### MCP note (important)

Cross-agent MCP wiring is limited by each agent's mechanism and is **not as seamless as skills**: a restart may be required and some services need credentials. For production use, **configure MCP directly inside your agent**; the sync, toggles and connectivity tests here are for reference only.

### Privacy & security

- Everything runs **locally**: the hub lives at `~/.skillhub` and no data is uploaded anywhere.
- MCP secrets use placeholders: real values stay in a local `secrets.json` and never enter configs or distributed content.
- Outbound requests are limited to repo clones during explicit skill imports, and MCP connectivity tests (private addresses are refused by default).

### UI language

The UI defaults to Chinese; the **EN** button (top-right) switches to English.

---

📮 Follow the author on WeChat: **海绵朋克** (AI development notes & practices) — QR code at the top.
