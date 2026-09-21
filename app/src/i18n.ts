/** i18n：界面中英双语。默认中文，localStorage 持久化，右上角按钮切换。
 *  范围为桌面 UI 文案；日志区中 CLI 子进程的输出（中文）不翻译，属如实反馈。 */

export type Lang = "zh" | "en";

const DICT: Record<string, { zh: string; en: string }> = {
  "app.sub": { zh: "扩展资源中转台", en: "Extension Resource Hub" },
  "btn.agentPanel": { zh: "Agent 管理", en: "Agents" },
  "btn.refresh": { zh: "刷新", en: "Refresh" },
  "tab.skills": { zh: "Skills", en: "Skills" },
  "tab.mcp": { zh: "MCP", en: "MCP" },
  "btn.add": { zh: "添加", en: "Add" },
  "chk.addAll": { zh: "多 skill 全部入库", en: "Import all skills in repo" },
  "btn.pickZip": { zh: "选择 zip…", en: "Pick zip…" },
  "ph.addInput": {
    zh: "粘贴 GitHub/Gitee 链接，或本地文件夹 / zip 压缩包路径，回车添加入库",
    en: "Paste a GitHub/Gitee link, or a local folder / zip path, then press Enter to import",
  },
  "help.title": { zh: "导入规则", en: "Import rules" },
  "help.li1": {
    zh: "<b>GitHub / Gitee 链接</b>：支持仓库主页、<code>/tree/分支/</code>、<code>/blob/</code> 链接。从链接位置<b>向下最多 4 层</b>自动查找 SKILL.md；仓库含多个 skill 时会全部列出。",
    en: "<b>GitHub / Gitee links</b>: repo home, <code>/tree/branch/</code> or <code>/blob/</code> links are supported. SKILL.md is looked up <b>up to 4 levels deep</b> from the link location; multiple skills are all listed.",
  },
  "help.li2": {
    zh: "<b>本地导入（推荐 zip）</b>：点「选择 zip…」直接选压缩包，自动解压扫描；也可以把 zip 或<b>解压后的 skill 文件夹</b>路径粘贴到输入框（文件夹指向含 SKILL.md 的目录或其上层均可）。",
    en: "<b>Local import (zip recommended)</b>: click “Pick zip…” to choose an archive, which is extracted and scanned automatically. You may also paste a zip or an <b>extracted skill folder</b> path (the folder containing SKILL.md, or any of its parents).",
  },
  "help.li3": {
    zh: "<b>扫描范围</b>：从填入位置向下最多 4 层查找 SKILL.md，仓库含多个 skill 时会全部列出。",
    en: "<b>Scan scope</b>: SKILL.md is searched up to 4 levels below the given location; multiple skills are all listed.",
  },
  "help.li4": {
    zh: "<b>SKILL.md 是必备清单</b>：文件头需含 <code>name</code> 与 <code>description</code>；没有该文件的目录不会被识别为 skill。若提示扫描不到，请复制 skill 子目录的完整链接，或先下载/解压到本地再导入。",
    en: "<b>SKILL.md is required</b>: its YAML header must contain <code>name</code> and <code>description</code>; directories without it are not recognized as skills. If nothing is found, copy the full sub-directory link, or download/extract locally first.",
  },
  "legend.skills": {
    zh: "开关：绿=启用　灰=禁用　空心=未安装（点击安装并启用，覆盖前自动备份）",
    en: "Toggle: green=enabled, gray=disabled, hollow=not installed (click to install & enable; auto-backup before overwrite)",
  },
  "foreign.skills.title": { zh: "未入库的 skill", en: "Skills not in hub" },
  "foreign.mcp.title": { zh: "未入库的 MCP", en: "MCP not in hub" },
  "mcp.note.title": { zh: "提示", en: "Note" },
  "mcp.note.body": {
    zh: "MCP 的跨端链接方式受各 agent 机制限制，<b>不如 skill 即装即用</b>——同步后可能需要重启对应 agent、部分服务还需认证配置才能连通。正式使用<b>建议直接在 agent 中单独配置</b>，本平台的同步、启停与连通性测试仅作参考与辅助。",
    en: "Cross-agent MCP wiring is limited by each agent's mechanism and is <b>not as seamless as skills</b> — a restart may be required and some services need credentials. For production use, <b>configure MCP directly inside your agent</b>; the sync, toggles and connectivity tests here are for reference only.",
  },
  "ph.mcpPaste": {
    zh: "粘贴 MCP 配置 JSON（各官网提供的 mcpServers 格式，可批量）或 http/https 服务 URL，自动识别",
    en: "Paste MCP config JSON (mcpServers format, batch supported) or an http/https server URL — auto-detected",
  },
  "ph.mcpName": { zh: "名称（URL 导入时可选）", en: "Name (optional for URL import)" },
  "btn.mcpAdd": { zh: "识别并添加", en: "Detect & add" },
  "legend.mcpAdd": {
    zh: "支持：① 各官网的 mcpServers JSON 配置（含命令行/请求头/密钥占位符，可批量）② 服务 URL（自动生成名称）③ 从下方各 agent 现有配置收编。stdio 型命令行服务同样支持。",
    en: "Supports: ① mcpServers JSON from vendor sites (commands/headers/secret placeholders, batch) ② server URL (auto-named) ③ adopting existing config from agents below. stdio command-line servers are supported too.",
  },
  "legend.mcp": {
    zh: "claude 端启用时自动写入工具免确认授权；豆包无本地 MCP 配置，不参与",
    en: "Enabling for claude also writes tool pre-authorization; doubao has no local MCP config and is excluded",
  },
  "log.title": { zh: "日志", en: "Log" },
  "modal.cancel": { zh: "取消", en: "Cancel" },
  "modal.ok": { zh: "确定", en: "OK" },
  "detail.test": { zh: "测试连接", en: "Test connection" },
  "detail.delete": { zh: "删除该资源…", en: "Delete…" },
  "detail.mcpNote": {
    zh: "提示：MCP 同步仅供参考——正式使用建议直接在 agent 中单独配置。",
    en: "Note: MCP sync is for reference — configure MCP directly in your agent for production use.",
  },
  "agents.title": { zh: "Agent 管理", en: "Agent manager" },
  "agents.hint": {
    zh: "自动识别 C 盘用户目录；识别不到可手动定位",
    en: "Auto-detects the user-profile folders; locate manually if not found",
  },
  "btn.panelRefresh": { zh: "刷新", en: "Refresh" },
  "badge.ok": { zh: "已识别", en: "Detected" },
  "badge.okCustom": { zh: "已识别（自定义）", en: "Detected (custom)" },
  "badge.no": { zh: "未识别", en: "Not detected" },
  "btn.locate": { zh: "定位", en: "Locate" },
  "btn.clearLocate": { zh: "恢复自动识别", en: "Reset to auto" },
  "ph.locate": {
    zh: "填写该 agent 的配置文件夹，如 C:\\Users\\你\\",
    en: "Enter the agent's config folder, e.g. C:\\Users\\you\\",
  },
  "banner.noAgent": {
    zh: "未检测到已安装的 agent——安装任意受支持的 agent 后，此处会自动刷新出对应开关；也可在右上角「Agent 管理」中手动定位。",
    en: "No installed agent detected — once you install any supported agent the toggles appear here automatically, or locate it manually in the Agents panel (top-right).",
  },
  "grid.skills.empty": {
    zh: "中心库还没有 skill：在上方粘贴链接添加，或用 CLI 的 import 收编各 agent 已装的 skill",
    en: "No skills in the hub yet: paste a link above, or adopt skills installed in your agents via CLI import",
  },
  "grid.mcp.empty": {
    zh: "还没有 MCP 定义：在上方添加，或用 CLI 的 mcp import 收编各 agent 现有配置",
    en: "No MCP definitions yet: add one above, or adopt existing MCP config from your agents via CLI",
  },
  "seed.done": { zh: "已预填 {n} 个示例 skill，可在矩阵中同步到各 agent", en: "{n} sample skills pre-filled into the hub — sync them to your agents from the matrix" },
  "toggle.hint.install": { zh: "未安装，点击安装并启用", en: "Not installed — click to install & enable" },
  "toggle.hint.pending": { zh: "期望已同步，待应用内安装", en: "Sync expected — install inside the app" },
  "toggle.hint.enable": { zh: "已禁用，点击恢复启用", en: "Disabled — click to enable" },
  "toggle.hint.disable": { zh: "启用中，点击停用", en: "Enabled — click to disable" },
  "toggle.hint.diff": { zh: "启用中（内容与中心库不同），点击停用", en: "Enabled (differs from hub) — click to disable" },
  "state.match": { zh: "已启用", en: "Enabled" },
  "state.diff": { zh: "内容不同", en: "Differs" },
  "state.missing": { zh: "未安装", en: "Not installed" },
  "state.disabled": { zh: "已禁用", en: "Disabled" },
  "state.pending": { zh: "待应用内安装", en: "Pending in-app install" },
  "detail.loading": { zh: "加载详细说明…", en: "Loading details…" },
  "detail.serverLoading": { zh: "正在向服务端获取介绍…", en: "Fetching intro from the server…" },
  "detail.serverNote": { zh: "以上介绍由服务端在握手时提供", en: "Intro provided by the server during handshake" },
  "detail.serverNoInstructions": { zh: "该服务未提供功能自述（instructions），以上仅为服务名与版本。", en: "This server did not provide instructions; only its name and version are shown." },
  "detail.serverFail": { zh: "无法从服务端获取介绍：", en: "Could not fetch intro from the server: " },
  "detail.serverTail": { zh: "该 MCP 的功能说明请在配置来源处查看。", en: "See the config source for details about this MCP." },
  "detail.subAgents": { zh: "各 agent 开关", en: "Per-agent toggles" },
  "detail.moreParams": { zh: "更多参数", en: "More parameters" },
  "detail.body.title": { zh: "详细说明", en: "Details" },
  "detail.body.none": { zh: "（该 skill 的 SKILL.md 没有正文说明）", en: "(this skill's SKILL.md has no body)" },
  "field.timeout": { zh: "超时", en: "Timeout" },
  "field.args": { zh: "参数", en: "Args" },
  "detail.testTimeout": {
    zh: "连接测试超时（9 秒无响应）——服务可能不可达或过慢；CLI 进程仍在后台完成检测，可稍后在日志查看。",
    en: "Connection test timed out (no response in 9s) — the server may be unreachable or slow; the CLI probe finishes in the background, check the log later.",
  },
  "detail.testFailed": { zh: "测试失败", en: "Test failed" },
  "foreign.all": { zh: "全部收编", en: "Adopt all" },
  "foreign.adopt": { zh: "收编", en: "Adopt" },
  "foreign.has": { zh: "有 {n} 个未入库", en: "{n} not in hub" },
  "agents.error": { zh: "读取识别状态失败: ", en: "Failed to read agent status: " },
  "lang.title": { zh: "中文 / English", en: "中文 / English" },
};

const LANG_KEY = "skillhub-lang";

export function currentLang(): Lang {
  const v = localStorage.getItem(LANG_KEY);
  return v === "en" ? "en" : "zh";
}

export function setLang(lang: Lang): void {
  localStorage.setItem(LANG_KEY, lang);
}

export function t(key: string, params?: Record<string, string | number>): string {
  const entry = DICT[key];
  let s = entry ? entry[currentLang()] : key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function langLabel(): string {
  return currentLang() === "zh" ? "中文" : "EN";
}

/** 预填/内置资源的双语简介：界面语言切换时联动显示。
 *  仅覆盖已知资源；未收录的资源如实显示作者原文（不联网翻译，守隐私承诺）。 */
const DESC_DB: Record<string, { zh: string; en: string }> = {
  "architecture-first-coding": {
    zh: "消除 AI 编程中的人机认知分歧。从零写代码：引导 AI 通过提问帮人类把想法表达清楚，边写边对齐认知。接手已有项目：检查确定性并自记，用大白话给人类解释项目，修改时边补约束边保持对齐。Load when: 新建项目、阅读陌生代码、重构、加功能、或需要确保人和 AI 理解一致时。",
    en: "Eliminates the human-AI understanding gap in coding. Greenfield: the AI asks questions to surface your intent and stays aligned while writing. Brownfield: audits determinism, explains the project in plain language, and keeps alignment by adding constraints while modifying. Load when: new projects, reading unfamiliar code, refactoring, adding features, or whenever human-AI alignment matters.",
  },
  "skill-mentor": {
    zh: "评估、审计、诊断、讲解和优化 Agent Skill，并检查 Skill 消费目录的合法性、冲突、断链与安全风险。用户提到快速检测、简单看看、校验、培养、优化、分析、深度审计、全面重构、Skill 评分、Skill 安全、Skill 调试或 Skill 治理时使用。也用于创建或改进 Skill 质量规范。",
    en: "Evaluates, audits, diagnoses, explains and optimizes Agent Skills, and checks consumer skill directories for validity, conflicts, broken links and security risks. Use when the user mentions quick checks, validation, mentoring, optimization, deep audits, refactoring, skill scoring, security, debugging or governance. Also for creating or improving skill quality specs.",
  },
  "html-exhibition": {
    zh: "把项目、产品、想法、研究成果或复盘内容制作成可直接打开的 HTML 演示网页或现场幻灯片。用户提到“做演示、项目展示、网页汇报、HTML slides、答辩、路演、翻页笔、演讲者模式、把项目讲出来”时使用。先理解事实并组织叙事，再按场合选择滚动阅读或逐页演讲、单文件或模块化结构、默认品牌主题或 34 套设计模板。不要用于只需普通配色建议、静态平面插画、原生移动端视觉稿或与该设计语言无关的通用前端任务。",
    en: "Turns projects, products, ideas, research or retrospectives into self-contained HTML presentation pages or live slide decks. Use for demos, project showcases, web reports, HTML slides, defenses, roadshows, clickers, presenter mode. Understands the facts and narrative first, then picks scroll vs stage delivery, single-file vs modular structure, and the default theme or one of 34 design templates. Not for plain color advice, static illustrations, native mobile mockups, or generic frontend tasks unrelated to this design language.",
  },
  "lingdong-skill": {
    zh: "从用户给定的主色或现有品牌色出发，创建、改造并验证“灵动”前端设计系统、网页界面和可交互 HTML 原型，强调暖色毛玻璃、状态连续变形、分级反馈、主色派生阴影、无障碍与响应式。用户提到灵动风格、动态岛式任务胶囊、任务进度连续性、从主色生成设计 token、完整单页 HTML 或将这些规则接入现有前端项目时使用。不要用于只需普通配色建议、静态平面插画、原生移动端视觉稿或与该设计语言无关的通用前端任务。",
    en: "Creates, retrofits and validates a “Lingdong” (dynamic-glass) frontend design system, web UI and interactive HTML prototypes from a brand color, emphasizing warm glassmorphism, continuous state morphing, tiered feedback, primary-derived shadows, accessibility and responsiveness. Use for dynamic-glass styling, dynamic-island task capsules, task progress continuity, design tokens from a primary color, full single-page HTML, or applying these rules to an existing frontend.",
  },
  "rookie-skill": {
    zh: "让 LLM 切换到「纯新人 / 小白视角」去思考、回答和写作。面向第一次使用 agent 的小白：不假设前置知识、说人话、优先让 agent 替用户动手、渐进式深度、暴露真实卡点。不自动触发——用户明确说出「小白视角 / 从 0 开始 / 当我是小白」等提示词时启用，「退出新手视角」时停用。",
    en: "Switches the LLM into a “complete beginner” perspective for thinking, answering and writing. For first-time agent users: no prior knowledge assumed, plain language, let the agent do the work, progressive depth, surface real stumbling blocks. Not auto-triggered — enabled by explicit cues like “beginner mode / start from zero”, disabled by “expert mode / normal answer”.",
  },
  "algorithmic-art": {
    zh: "使用 p5.js 进行带种子随机与交互式参数探索的算法艺术创作。当用户需要用代码创作艺术、生成艺术、算法艺术、流场或粒子系统时使用。创作原创算法艺术而非复制现有艺术家作品，以避免版权问题。",
    en: "Creating algorithmic art using p5.js with seeded randomness and interactive parameter exploration. Use when users request creating art using code, generative art, algorithmic art, flow fields, or particle systems. Create original algorithmic art rather than copying existing artists' work to avoid copyright violations.",
  },
  "training-ci-curves": {
    zh: "从重复的机器学习或强化学习实验中生成带置信区间的论文级训练曲线图。适用于从 TensorBoard 日志、CSV/JSON/NumPy 文件、混合运行目录等实验输出中提取指标、对齐多次运行、计算均值与置信区间，并绘制论文可直接使用的 reward、accuracy、TFCR、loss 等训练曲线。",
    en: "Create publication-style training curve figures with confidence intervals from repeated machine learning or reinforcement learning runs. Use when Codex needs to extract training metrics from TensorBoard logs, CSV/JSON/NumPy files, mixed run folders, or other experiment outputs, align repeated runs, compute mean and confidence intervals, and plot paper-ready reward, accuracy, TFCR, loss, or similar training curves.",
  },
  "scys-mcp": {
    zh: "生财有术（SCYS）社区 MCP 服务——提供社区内容检索与查询能力。",
    en: "SCYS community MCP server — community content search and lookup.",
  },
  deepwiki: {
    zh: "DeepWiki — 为 GitHub 仓库生成 AI 文档，支持结构化目录、内容查看与仓库问答。",
    en: "DeepWiki — AI-powered documentation for GitHub repositories: wiki structure, contents, and Q&A.",
  },
  context7: {
    zh: "Context7 — 库/框架的最新版本文档查询 MCP（经 npx 本地运行）。",
    en: "Context7 — up-to-date library/framework documentation MCP (runs locally via npx).",
  },
};

/** MCP 兜底描述：无内置译文且无有效描述时，按类型生成双语结构化说明 */
export function mcpFallbackDesc(name: string, fallback: string, transport: string): string {
  const entry = DESC_DB[name];
  if (entry) return entry[currentLang()];
  if (fallback && !/^(来自|from )/.test(fallback)) return fallback; // 用户自填的有效描述
  const zh = transport === "stdio" ? "本机命令行 MCP 服务" : transport.toUpperCase() + " 型 MCP 服务";
  const en = transport === "stdio" ? "Local command-line MCP server" : transport.toUpperCase() + " MCP server";
  return currentLang() === "zh" ? zh : en;
}

/** 资源简介的双语覆盖：有内置译文按界面语言返回；没有则返回 null（调用方显示数据原文） */
export function resourceDesc(name: string, fallback: string): string {
  const entry = DESC_DB[name];
  if (!entry) return fallback;
  return entry[currentLang()] || fallback;
}

/** 下一个切换目标（按钮显示的文案） */
export function toggleLabel(): string {
  return currentLang() === "zh" ? "EN" : "中文";
}

/** 遍历静态节点：data-i18n=textContent、data-i18n-html=innerHTML、data-i18n-ph=placeholder */
export function applyI18nStatic(): void {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as string);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml as string);
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh as string);
  });
  document.title = currentLang() === "zh" ? "SkillHub" : "SkillHub";
}
