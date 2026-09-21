import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { t, applyI18nStatic, toggleLabel, setLang, currentLang, resourceDesc } from "./i18n";

interface AgentInfo {
  id: string;
  label: string;
  installed?: boolean;
}

interface SkillRow {
  name: string;
  description: string;
  source: { type: string; url?: string; ref?: string; subpath?: string; from?: string };
  addedAt: string;
  agents: Record<string, string>;
}

interface McpRow {
  name: string;
  transport: string;
  url?: string;
  command?: string;
  description?: string;
  agents: Record<string, string>;
}

interface PluginRow {
  id: string;
  version?: string;
  description?: string;
  agents: Record<string, string>;
}

type DetailKind = "skill" | "mcp" | "plugin";

interface StatusData {
  hub: { root: string; count: number };
  agents: AgentInfo[];
  skills: SkillRow[];
  foreign: Record<string, string[]>;
  mcp: {
    agents: (AgentInfo & { note?: string })[];
    servers: McpRow[];
    foreign: Record<string, string[]>;
  };
  plugins: {
    agents: (AgentInfo & { note?: string; canAutoInstall?: boolean })[];
    plugins: PluginRow[];
    foreign: Record<string, string[]>;
  };
}

let data: StatusData | null = null;
let lastAgentIds: string[] | null = null; // 上次已安装 agent 集合，用于检测新装 agent
let lastRenderSig = ""; // 上次渲染的 status 原文签名：轮询无变化时不重渲染，避免动画重播闪烁
let detailOpen: { kind: DetailKind; name: string } | null = null;

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

/** agent 展示元数据（官方 logo 由 extract-agent-icons.ps1 从本机安装目录提取） */
const AGENT_META: Record<string, { label: string; logo: string }> = {
  zcode: { label: "ZCode", logo: "/agents/zcode.png" },
  claude: { label: "Claude Code", logo: "/agents/claude.png" },
  codex: { label: "Codex", logo: "/agents/codex.png" },
  workbuddy: { label: "WorkBuddy", logo: "/agents/workbuddy.png" },
  kimi: { label: "Kimi Code", logo: "/agents/kimi.png" },
  doubao: { label: "豆包", logo: "/agents/doubao.png" },
};

const STATE: Record<string, string> = {
  match: "已启用",
  diff: "内容不同",
  missing: "未安装",
  disabled: "已禁用",
  pending: "待应用内安装",
};

/** 状态名按当前语言显示 */
function stateText(state: string): string {
  const key = `state.${STATE[state] ? state : "missing"}`;
  return t(key);
}

const ACTION_TEXT: Record<string, string> = {
  installed: "已安装",
  updated: "已更新（旧版已备份）",
  current: "已是最新",
  skipped: "跳过",
  "agent-missing": "agent 未找到",
  error: "出错",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function log(text: string): void {
  const el = $("#log");
  el.textContent = el.textContent ? `${el.textContent}\n${text.trim()}` : text.trim();
  el.scrollTop = el.scrollHeight;
}

async function runCli(args: string[]): Promise<string> {
  return await invoke<string>("run_cli", { args });
}

function setBusy(busy: boolean): void {
  document.body.classList.toggle("busy", busy);
}

function tryParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---------- emoji 头像与卡片色相 ----------

const EMOJI_RULES: [RegExp, string][] = [
  [/git|push|仓库|repo/i, "🚀"],
  [/browser|网页|浏览器|web|前端/i, "🌐"],
  [/doc|文档|论文|paper|写作|翻译/i, "📄"],
  [/ai|llm|gpt|模型|model|深度|学习/i, "🤖"],
  [/data|数据库|sql|统计/i, "🗄️"],
  [/mail|邮件/i, "📧"],
  [/search|搜索|检索/i, "🔍"],
  [/video|视频|剪辑|直播/i, "🎬"],
  [/image|图|画|设计|图标/i, "🎨"],
  [/secur|安全|扫描|防护/i, "🛡️"],
  [/cloud|云|部署/i, "☁️"],
  [/test|测试|验证/i, "🧪"],
  [/pay|支付|财|金融|电商/i, "💰"],
  [/calendar|日历|日程|时间/i, "📅"],
  [/note|笔记|记忆|知识/i, "📝"],
  [/chat|聊天|消息|社交/i, "💬"],
  [/music|音频|音乐/i, "🎵"],
  [/slide|演示|幻灯|ppt/i, "📊"],
  [/skill|技能|新手|视角/i, "🧩"],
  [/mcp|server|服务|接口/i, "🔌"],
  [/code|编程|开发|重构/i, "💻"],
  [/map|地图|导航|航空|飞行/i, "✈️"],
];

const EMOJI_FALLBACK = ["🧩", "⚡", "🌟", "🔧", "📦", "🎯", "🧠", "🛠️", "✨", "🚀"];

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pickEmoji(name: string, desc: string): string {
  const hay = `${name} ${desc}`;
  for (const [re, emoji] of EMOJI_RULES) if (re.test(hay)) return emoji;
  return EMOJI_FALLBACK[strHash(name) % EMOJI_FALLBACK.length];
}

/** 卡片 accent 色相：资源名 hash 派生，避开主蓝（223±18）保证区分度 */
function accentHue(name: string): number {
  const h = strHash(name) % 360;
  const d = Math.abs(h - 223.6);
  return d < 18 ? (h + 40) % 360 : h;
}

// ---------- 详情浮层 ----------

function detailRow(): { row: SkillRow | McpRow | PluginRow; kind: DetailKind } | null {
  if (!detailOpen || !data) return null;
  if (detailOpen.kind === "skill") {
    const row = data.skills.find((s) => s.name === detailOpen!.name);
    return row ? { row, kind: "skill" } : null;
  }
  if (detailOpen.kind === "mcp") {
    const row = data.mcp.servers.find((s) => s.name === detailOpen!.name);
    return row ? { row, kind: "mcp" } : null;
  }
  const row = data.plugins.plugins.find((s) => s.id === detailOpen!.name);
  return row ? { row, kind: "plugin" } : null;
}

function openDetail(kind: DetailKind, name: string): void {
  detailOpen = { kind, name };
  renderDetail();
  $("#detail-mask").classList.remove("hidden");
  $("#detail-close").focus();
  void loadDetailExtra();
}

/** 详情的详细段：CLI detail 命令异步加载（skill=SKILL.md 正文节选；mcp=全字段脱敏 + 握手获取服务自述） */
async function loadDetailExtra(): Promise<void> {
  if (!detailOpen) return;
  const { kind, name } = detailOpen;
  const extraEl = $("#detail-extra");
  const serverEl = $("#detail-server");
  serverEl.hidden = true;
  extraEl.innerHTML = `<div class="detail-loading">${t("detail.loading")}</div>`;
  try {
    const raw = await runCli(["detail", kind, name, "--json"]);
    const d = tryParse<DetailPayload>(raw);
    if (!d || detailOpen?.name !== name || detailOpen?.kind !== kind) return; // 期间切换/关闭
    if (kind === "skill") {
      extraEl.innerHTML = `<h4 class="detail-sub">${t("detail.body.title")}</h4><div class="detail-body">${esc(d.body || t("detail.body.none"))}${(d.body?.length ?? 0) >= 2500 ? "\n\n… SKILL.md" : ""}</div>`;
    } else {
      const bits: string[] = [];
      if (d.timeoutMs) bits.push(fieldRow(t("field.timeout"), `${d.timeoutMs} ms`));
      if (d.args?.length) bits.push(fieldRow(t("field.args"), d.args.join(" ")));
      if (d.headerKeys?.length) bits.push(fieldRow("Headers", d.headerKeys.join("、")));
      if (d.envKeys?.length) bits.push(fieldRow("Env", d.envKeys.join("、")));
      if (d.body) bits.push(`<div class="field-row"><span class="field-k">说明</span><span class="field-v">${esc(d.body)}</span></div>`);
      extraEl.innerHTML = bits.length ? `<h4 class="detail-sub">${t("detail.moreParams")}</h4><div class="detail-fields inner">${bits.join("")}</div>` : "";
      // MCP 没有 SKILL.md 式的本地介绍——通过握手向服务端获取自述（名称/版本/功能说明）
      serverEl.hidden = false;
      serverEl.className = "detail-server";
      serverEl.innerHTML = `<div class="detail-loading">${t("detail.serverLoading")}</div>`;
      const tRaw = await runCli(["mcp", "test", name, "--json"]);
      if (detailOpen?.name !== name) return;
      const testRes = tryParse<{ results: { ok: boolean; message: string; server?: { name?: string; version?: string; instructions?: string } }[] }>(tRaw);
      const tr = testRes?.results[0];
      if (tr?.ok && tr.server) {
        const head = `<b>${esc(tr.server.name ?? name)}</b>${tr.server.version ? ` <span class="muted">v${esc(tr.server.version)}</span>` : ""}`;
        const intro = tr.server.instructions
          ? `<div class="server-instructions">${esc(tr.server.instructions)}</div><div class="muted" style="margin-top:6px">${t("detail.serverNote")}</div>`
          : `<div class="muted" style="margin-top:6px">${t("detail.serverNoInstructions")}</div>`;
        serverEl.innerHTML = head + intro;
      } else {
        serverEl.className = "detail-server no";
        serverEl.innerHTML = `<div class="muted">${t("detail.serverFail")}${esc(tr?.message ?? "")}。${t("detail.serverTail")}</div>`;
      }
    }
  } catch {
    extraEl.innerHTML = "";
    serverEl.hidden = true;
  }
}

interface DetailPayload {
  kind: "skill" | "mcp";
  name: string;
  description?: string;
  body?: string;
  transport?: string;
  url?: string;
  command?: string;
  args?: string[];
  timeoutMs?: number;
  headerKeys?: string[];
  envKeys?: string[];
  addedAt?: string;
}

function closeDetail(): void {
  $("#detail-mask").classList.add("hidden");
  detailOpen = null;
}

function renderDetail(): void {
  const found = detailRow();
  if (!found) {
    closeDetail();
    return;
  }
  const { row, kind } = found;
  const agents =
    kind === "skill"
      ? { list: data!.agents.filter((a) => a.installed !== false), states: (row as SkillRow).agents }
      : kind === "mcp"
        ? { list: data!.mcp.agents.filter((a) => a.installed !== false), states: (row as McpRow).agents }
        : { list: data!.plugins.agents.filter((a) => a.installed !== false), states: (row as PluginRow).agents };

  const key = kind === "plugin" ? (row as PluginRow).id : (row as SkillRow | McpRow).name;
  const desc = kind === "plugin" ? (row as PluginRow).description ?? "" : (row as SkillRow | McpRow).description ?? "";
  const descShown = kind === "plugin" ? desc : resourceDesc(key, desc);
  $("#detail-mask").style.setProperty("--accent-h", String(accentHue(key)));
  $("#detail-avatar").textContent = pickEmoji(key, descShown);

  const titleEl = $("#detail-title");
  titleEl.textContent = key;
  $("#detail-desc").textContent = descShown || "（没有简介）";
  $("#detail-test").hidden = kind !== "mcp"; // 连通性测试仅对 MCP 有意义
  $("#detail-test-result").hidden = true;

  const fields = $("#detail-fields");
  fields.innerHTML =
    kind === "skill"
      ? sourceField((row as SkillRow).source) + fieldRow("入库时间", ((row as SkillRow).addedAt || "").slice(0, 10))
        : kind === "mcp"
          ? fieldRow("类型", (row as McpRow).transport) +
            fieldRow((row as McpRow).transport === "stdio" ? "命令" : "URL", (row as McpRow).transport === "stdio" ? (row as McpRow).command ?? "" : (row as McpRow).url ?? "")
        : fieldRow("市场", (row as PluginRow).id.split("@")[1] ?? "") + fieldRow("版本", (row as PluginRow).version ?? "");

  $("#detail-agents").innerHTML = agents.list
    .map((a) => agentChip(kind, key, a.id, agents.states[a.id] ?? "missing", true))
    .join("");
  $("#detail-delete").dataset.name = key;
  $("#detail-delete").dataset.kind = kind;
}

function fieldRow(k: string, v: string): string {
  return v ? `<div class="field-row"><span class="field-k">${esc(k)}</span><span class="field-v">${esc(v)}</span></div>` : "";
}

function sourceField(s: SkillRow["source"]): string {
  const text =
    s.type === "github"
      ? `${s.url ?? "github"}${s.ref ? `@${s.ref}` : ""}${s.subpath ? `:${s.subpath}` : ""}`
      : s.type === "agent"
        ? `来自 ${s.from ?? "agent"}`
        : "本地路径";
  return fieldRow("来源", text);
}

// ---------- 气泡卡片渲染 ----------

function agentChip(kind: DetailKind, name: string, agentId: string, state: string, large = false): string {
  const meta = AGENT_META[agentId] ?? { label: agentId, logo: "" };
  const logo = meta.logo ? `<img class="agent-logo" src="${meta.logo}" alt="${esc(meta.label)}" title="${esc(meta.label)}" onerror="this.style.visibility='hidden'">` : "";
  const label = large ? `<span class="chip-name">${esc(meta.label)}</span>` : "";
  return `<span class="agent-chip${large ? " large" : ""}" title="${esc(meta.label)}：${stateText(state)}">${logo}${label}${toggleBtn(state, kind, name, agentId)}</span>`;
}

/** 滑动开关按钮（44px 触控热区，轨道为伪元素） */
function toggleBtn(state: string, kind: DetailKind, name: string, agent: string): string {
  const visual = state === "disabled" ? "off" : state === "missing" ? "dot" : state === "pending" ? "pending" : state === "diff" ? "on warn" : "on";
  const hint =
    state === "missing"
      ? t("toggle.hint.install")
      : state === "pending"
        ? t("toggle.hint.pending")
        : state === "disabled"
          ? t("toggle.hint.enable")
          : state === "diff"
            ? t("toggle.hint.diff")
            : t("toggle.hint.disable");
  return `<button class="toggle ${visual}" data-act="toggle" data-kind="${kind}" data-state="${state}" data-name="${esc(name)}" data-agent="${esc(agent)}" title="${esc(hint)}（${esc(metaOf(agent))}·${stateText(state)}）" aria-label="${esc(metaOf(agent))} ${esc(name)} 开关"><span class="knob"></span></button>`;
}

function metaOf(agentId: string): string {
  return AGENT_META[agentId]?.label ?? agentId;
}

function skillBubble(s: SkillRow, agents: AgentInfo[]): HTMLElement {
  const card = document.createElement("div");
  card.className = "bubble";
  card.dataset.detailKind = "skill";
  card.dataset.detailName = s.name;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.style.setProperty("--accent-h", String(accentHue(s.name)));
  const descShown = resourceDesc(s.name, s.description);
  card.innerHTML = `
    <div class="bubble-head">
      <span class="bubble-avatar">${pickEmoji(s.name, descShown)}</span>
      <span class="bubble-title" title="${esc(descShown)}">${esc(s.name)}</span>
    </div>
    <div class="bubble-desc">${esc(descShown || "（没有简介）")}</div>
    <div class="bubble-agents">${agents.map((a) => agentChip("skill", s.name, a.id, s.agents[a.id] ?? "missing")).join("")}</div>`;
  return card;
}

function mcpBubble(s: McpRow, agents: AgentInfo[]): HTMLElement {
  const card = document.createElement("div");
  card.className = "bubble";
  card.dataset.detailKind = "mcp";
  card.dataset.detailName = s.name;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.style.setProperty("--accent-h", String(accentHue(s.name)));
  const target = s.transport === "stdio" ? s.command ?? "" : s.url ?? "";
  const descShown = resourceDesc(s.name, s.description ?? "");
  card.innerHTML = `
    <div class="bubble-head">
      <span class="bubble-avatar">${pickEmoji(s.name, descShown || target)}</span>
      <span class="bubble-title" title="${esc(target)}">${esc(s.name)}</span>
      <span class="bubble-badge">${esc(s.transport)}</span>
    </div>
    <div class="bubble-desc">${esc(descShown || target || "（没有简介）")}</div>
    <div class="bubble-agents">${agents.map((a) => agentChip("mcp", s.name, a.id, s.agents[a.id] ?? "missing")).join("")}</div>`;
  return card;
}

function render(): void {
  if (!data) return;
  $("#hub-path").textContent = `${data.hub.root}（${data.hub.count} skills / ${data.mcp.servers.length} MCP）`;
  // 无已安装 agent 时显示引导横幅
  const anyAgent = data.agents.some((a) => a.installed !== false);
  $("#no-agent-banner").hidden = anyAgent;

  // 只展示用户实际安装了的 agent；后期新装的 agent 由自动监测补上
  const installedAgents = data.agents.filter((a) => a.installed !== false);
  const installedMcpAgents = data.mcp.agents.filter((a) => a.installed !== false);

  const skillGrid = $("#skill-cards");
  skillGrid.innerHTML = "";
  if (data.skills.length === 0) {
    skillGrid.innerHTML = `<div class="grid-empty">${t("grid.skills.empty")}</div>`;
  }
  for (const s of data.skills) skillGrid.appendChild(skillBubble(s, installedAgents));

  const mcpGrid = $("#mcp-cards");
  mcpGrid.innerHTML = "";
  if (data.mcp.servers.length === 0) {
    mcpGrid.innerHTML = `<div class="grid-empty">${t("grid.mcp.empty")}</div>`;
  }
  for (const s of data.mcp.servers) mcpGrid.appendChild(mcpBubble(s, installedMcpAgents));

  // 未入库区：有内容才显示对应卡片
  $("#foreign-card-skills").hidden = !renderForeignList("#foreign", data.foreign, "skill");
  $("#foreign-card-mcp").hidden = !renderForeignList("#mcp-foreign", data.mcp.foreign, "mcp");

  // 详情浮层若开着，同步重绘（开关切换/删除后保持连续）
  if (detailOpen) renderDetail();
}

function renderForeignList(sel: string, foreign: Record<string, string[]>, kind: "skill" | "mcp"): boolean {
  const el = $(sel);
  const entries = Object.entries(foreign).filter(([, names]) => names.length > 0);
  const act = kind === "mcp" ? "mcp-import" : "import";
  if (entries.length === 0) {
    el.innerHTML = "";
    return false;
  }
  el.innerHTML = entries
    .map(([agent, names]) => {
      const meta = AGENT_META[agent] ?? { label: agent, logo: "" };
      const logo = meta.logo ? `<img class="agent-logo" src="${meta.logo}" alt="" onerror="this.style.visibility='hidden'">` : "";
      return `
    <div class="foreign-group">
      <div class="foreign-group-head">
        <span class="fg-agent">${logo}<b>${esc(meta.label)}</b><span class="muted">${t("foreign.has", { n: names.length })}</span></span>
        <button data-act="${act}-all" data-agent="${esc(agent)}">${t("foreign.all")}</button>
      </div>
      <div class="bubble-grid foreign-grid">
        ${names
          .map((n) => {
            const hue = accentHue(n);
            return `<div class="bubble mini-bubble" style="--accent-h:${hue}">
          <span class="bubble-avatar sm">${pickEmoji(n, n)}</span>
          <span class="bubble-title">${esc(n)}</span>
          <button class="mini" data-act="${act}" data-agent="${esc(agent)}" data-name="${esc(n)}">${t("foreign.adopt")}</button>
        </div>`;
          })
          .join("")}
      </div>
    </div>`;
    })
    .join("");
  return true;
}

// ---------- 数据刷新与自动监测 ----------

async function refresh(): Promise<void> {
  try {
    const raw = await runCli(["status", "--json"]);
    // 数据无变化时跳过重渲染：轮询期间 innerHTML 重建会重播卡片入场动画（表现为周期性闪烁）
    if (raw === lastRenderSig) return;
    lastRenderSig = raw;
    data = JSON.parse(raw) as StatusData;
    render();
    const ids = data.agents.filter((a) => a.installed !== false).map((a) => a.id);
    if (lastAgentIds !== null) {
      const added = ids.filter((x) => !lastAgentIds!.includes(x));
      const removed = lastAgentIds.filter((x) => !ids.includes(x));
      if (added.length) log(`✓ 检测到新安装的 agent：${added.join("、")}，已加入矩阵`);
      if (removed.length) log(`- 检测到 agent 移除：${removed.join("、")}，已从矩阵隐藏`);
    }
    lastAgentIds = ids;
  } catch (e) {
    log(`刷新失败: ${e}`);
  }
}

const REFRESH_INTERVAL_MS = 15000;
window.setInterval(() => {
  if (document.body.classList.contains("busy")) return;
  if (!$("#modal-mask").classList.contains("hidden")) return;
  if (document.hidden) return;
  void refresh();
}, REFRESH_INTERVAL_MS);

// ---------- 勾选弹层（同步/删除的 agent 勾选） ----------

interface ModalItem {
  id: string;
  label: string;
  checked: boolean;
  note?: string;
}

function showCheckboxModal(title: string, items: ModalItem[]): Promise<string[] | null> {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement as HTMLElement | null;
    $("#modal-title").textContent = title;
    const body = $("#modal-body");
    body.innerHTML = "";
    for (const it of items) {
      const label = document.createElement("label");
      label.className = "modal-body-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = it.checked;
      cb.dataset.id = it.id;
      label.appendChild(cb);
      const span = document.createElement("span");
      span.textContent = it.label;
      label.appendChild(span);
      if (it.note) {
        const n = document.createElement("span");
        n.className = "muted";
        n.textContent = it.note;
        label.appendChild(n);
      }
      body.appendChild(label);
    }
    const mask = $("#modal-mask");
    mask.classList.remove("hidden");
    (body.querySelector<HTMLInputElement>("input") ?? $("#modal-ok")).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done(null);
    };
    document.addEventListener("keydown", onKey);
    const done = (val: string[] | null) => {
      mask.classList.add("hidden");
      document.removeEventListener("keydown", onKey);
      $("#modal-ok").onclick = null;
      $("#modal-cancel").onclick = null;
      prevFocus?.focus();
      resolve(val);
    };
    $("#modal-ok").onclick = () => {
      done([...body.querySelectorAll<HTMLInputElement>("input:checked")].map((c) => c.dataset.id as string));
    };
    $("#modal-cancel").onclick = () => done(null);
  });
}

// ---------- 操作 ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (r: any) => string;

async function runAndLog(args: string[], okText: AnyFn): Promise<void> {
  const raw = await runCli(args);
  const r = tryParse<{ results: unknown[] }>(raw);
  if (r) log(r.results.map((x) => okText(x)).join("\n") || raw);
  else log(raw);
  await refresh();
}

async function syncAllAgents(kind: "skill" | "mcp", name: string): Promise<void> {
  const agents = kind === "mcp" ? data!.mcp.agents : data!.agents;
  const prefix = kind === "mcp" ? ["mcp"] : [];
  const items = agents
    .filter((a) => a.installed !== false)
    .map((a) => ({ id: a.id, label: a.id, checked: kind === "mcp" || a.id !== "doubao", note: a.id === "doubao" ? "实验" : undefined }));
  const picked = await showCheckboxModal(`把「${name}」同步到哪些 agent？`, items);
  if (!picked || picked.length === 0) return;
  setBusy(true);
  try {
    await runAndLog([...prefix, "sync", name, "--to", picked.join(","), "--json"], (x: { agent: string; skill?: string; server?: string; action: string; message?: string }) =>
      `  [${x.agent}] ${x.skill ?? x.server ?? name} ${x.message ?? ACTION_TEXT[x.action] ?? x.action}`,
    );
  } catch (err) {
    log(`同步失败: ${err}`);
  }
  setBusy(false);
}

async function removeGeneric(kind: "skill" | "mcp", name: string): Promise<void> {
  const agents = kind === "mcp" ? data!.mcp.agents : data!.agents;
  const prefix = kind === "mcp" ? ["mcp"] : [];
  const items: ModalItem[] = agents
    .filter((a) => a.installed !== false)
    .map((a) => ({ id: a.id, label: a.id, checked: kind === "mcp" || a.id !== "doubao", note: a.id === "doubao" ? "实验" : undefined }));
  items.push({ id: "__hub__", label: "中心库（hub）", checked: true });
  const picked = await showCheckboxModal(`从哪些位置移除「${name}」？（移除前自动备份）`, items);
  if (!picked || picked.length === 0) return;
  const agentIds = picked.filter((x) => x !== "__hub__");
  const removeHub = picked.includes("__hub__");
  if (!confirm(`确认移除「${name}」？\nagent：${agentIds.join("、") || "无"}\n中心库：${removeHub ? "删除" : "保留"}`)) return;
  setBusy(true);
  try {
    if (agentIds.length > 0) {
      await runAndLog([...prefix, "rm", name, "--from", agentIds.join(","), "--yes", "--json"], (x: { target: string; skill?: string; server?: string; backup?: string }) =>
        `✓ [${x.target}] ${x.skill ?? x.server ?? name} 已移除${x.backup ? "（备份已存）" : ""}`,
      );
    }
    if (removeHub) {
      await runAndLog([...prefix, "rm", name, "--hub-only", "--yes", "--json"], (x: { skill?: string; server?: string }) =>
        `✓ [hub] ${x.skill ?? x.server ?? name} 已移除`,
      );
    }
  } catch (err) {
    log(`删除失败: ${err}`);
  }
  setBusy(false);
}

/** 矩阵格子的滑动开关：未安装=安装并启用；启用中=停用；已禁用=恢复启用 */
async function toggleCellAction(ds: DOMStringMap): Promise<void> {
  const kind = (ds.kind ?? "skill") as "skill" | "mcp";
  const name = ds.name ?? "";
  const agent = ds.agent ?? "";
  const state = ds.state ?? "missing";
  const prefix = kind === "mcp" ? ["mcp"] : [];
  let args: string[];
  if (state === "missing" || state === "pending") {
    args = [...prefix, "sync", name, "--to", agent, "--json"];
  } else if (state === "disabled") {
    args = [...prefix, "enable", name, "--to", agent, "--json"];
  } else {
    args = [...prefix, "disable", name, "--to", agent, "--json"];
  }
  setBusy(true);
  try {
    await runAndLog(args, (x: { agent?: string; skill?: string; server?: string; action: string; message?: string }) => {
      if (x.message) return `  [${agent}] ${name} ${x.message}`;
      const what = x.skill ?? x.server ?? name;
      return `  [${x.agent ?? agent}] ${what} ${ACTION_TEXT[x.action] ?? x.action ?? ""}`;
    });
  } catch (err) {
    log(`切换失败: ${err}`);
  }
  setBusy(false);
}

// ---------- Agent 管理面板 ----------

interface AgentListRow {
  id: string;
  label: string;
  installed: boolean;
  home: string;
  homeSource: "custom" | "default";
}

async function loadAgentPanel(): Promise<void> {
  const body = $("#agent-panel-body");
  try {
    const rows = (tryParse<{ agents: AgentListRow[] }>(await runCli(["agent", "list", "--json"])) ?? { agents: [] }).agents;
    body.innerHTML = rows
      .map((r) => {
        const meta = AGENT_META[r.id] ?? { label: r.label, logo: "" };
        const logo = meta.logo ? `<img class="agent-logo" src="${meta.logo}" alt="" onerror="this.style.visibility='hidden'">` : "";
        const badge = r.installed
          ? `<span class="ap-badge ok">${t(r.homeSource === "custom" ? "badge.okCustom" : "badge.ok")}</span>`
          : `<span class="ap-badge no">${t("badge.no")}</span>`;
        const locate =
          r.installed
            ? r.homeSource === "custom"
              ? `<button class="mini" data-ap-act="clear" data-agent="${esc(r.id)}">${t("btn.clearLocate")}</button>`
              : ""
            : `<div class="ap-locate">
                 <input type="text" class="ap-input" placeholder="${esc(t("ph.locate"))}" data-agent="${esc(r.id)}">
                 <button class="mini" data-ap-act="locate" data-agent="${esc(r.id)}">${t("btn.locate")}</button>
               </div>`;
        return `<div class="ap-row">
          ${logo}
          <div class="ap-info"><b>${esc(meta.label)}</b><div class="ap-path" title="${esc(r.home)}">${esc(r.home)}</div></div>
          ${badge}
        </div>${locate}`;
      })
      .join("");
  } catch (e) {
    body.innerHTML = `<div class="ap-error">${esc(String(e))}</div>`;
  }
}

async function agentLocate(agentId: string, dir: string | null): Promise<void> {
  const args = dir === null ? ["agent", "locate", agentId, "--clear", "--json"] : ["agent", "locate", agentId, dir, "--json"];
  setBusy(true);
  try {
    const raw = await runCli(args);
    const r = tryParse<{ results: { name: string; message: string }[] }>(raw);
    log(r ? r.results.map((x) => `${x.name}：${x.message}`).join("\n") : raw);
    await Promise.all([loadAgentPanel(), refresh()]);
  } catch (err) {
    log(`定位失败: ${err}`);
  }
  setBusy(false);
}

window.addEventListener("DOMContentLoaded", async () => {
  // i18n：应用当前语言并绑定切换按钮（默认中文，localStorage 持久化）
  applyI18nStatic();
  $("#lang-toggle").textContent = toggleLabel();
  $("#lang-toggle").addEventListener("click", () => {
    setLang(currentLang() === "zh" ? "en" : "zh");
    $("#lang-toggle").textContent = toggleLabel();
    applyI18nStatic();
    if (data) render();
  });

  // Tab 分区
  document.querySelectorAll<HTMLElement>(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      const tab = t.dataset.tab ?? "skills";
      document.querySelectorAll(".tab").forEach((x) => {
        x.classList.toggle("active", x === t);
        x.setAttribute("aria-selected", x === t ? "true" : "false");
      });
      document.querySelectorAll(".tab-pane").forEach((p) => {
        p.classList.toggle("hidden", p.id !== `pane-${tab}`);
      });
    });
  });

  $("#add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#add-input") as HTMLInputElement;
    const value = input.value.trim();
    if (!value || document.body.classList.contains("busy")) return;
    const args = ["add", value];
    if (($("#add-all") as HTMLInputElement).checked) args.push("--all");
    args.push("--json");
    setBusy(true);
    try {
      const raw = await runCli(args);
      const r = tryParse<{ results: { ok: boolean; name: string; message: string }[] }>(raw);
      log(r ? r.results.map((x) => `${x.ok ? "✓" : "✗"} ${x.name} ${x.message}`).join("\n") : raw);
      input.value = "";
      await refresh();
    } catch (err) {
      log(`添加失败: ${err}`);
    }
    setBusy(false);
  });

  $("#mcp-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pasteEl = $("#mcp-paste") as HTMLTextAreaElement;
    const paste = pasteEl.value.trim();
    const nameHint = ($("#mcp-name") as HTMLInputElement).value.trim();
    if (!paste || document.body.classList.contains("busy")) return;
    setBusy(true);
    try {
      let raw: string;
      if (/^https?:\/\//i.test(paste) && !paste.startsWith("{")) {
        // 服务 URL：自动派生名称（去 www/mcp. 前缀，非法字符转横线）
        let name = nameHint;
        if (!name) {
          const host = new URL(paste).hostname;
          name = host.replace(/^(www|mcp)\./i, "").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[.-]+/, "");
        }
        raw = await runCli(["mcp", "add", name, "--url", paste, "--json"]);
      } else {
        // JSON 配置（mcpServers 包装/单个定义/数组），批量导入
        raw = await runCli(["mcp", "import-json", paste, "--json"]);
      }
      const r = tryParse<{ results: { name: string; message: string; ok?: boolean }[] }>(raw);
      log(r ? r.results.map((x) => `${x.ok === false && x.message.includes("已存在") ? "-" : x.ok === false ? "✗" : "✓"} ${x.name} ${x.message}`).join("\n") : raw);
      if (r && r.results.some((x) => x.ok !== false)) {
        pasteEl.value = "";
        ($("#mcp-name") as HTMLInputElement).value = "";
      }
      await refresh();
    } catch (err) {
      log(`MCP 添加失败: ${err}`);
    }
    setBusy(false);
  });

  document.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const actBtn = target.closest("button[data-act]") as HTMLButtonElement | null;
    const toggle = target.closest("button.toggle") as HTMLButtonElement | null;

    // 详情浮层：点背景/叉号关闭
    if (target === $("#detail-mask") || target.closest("#detail-close")) {
      closeDetail();
      return;
    }

    // 详情里的删除
    if (actBtn?.id === "detail-delete") {
      const kind = actBtn.dataset.kind === "mcp" ? "mcp" : "skill";
      await removeGeneric(kind, actBtn.dataset.name ?? "");
      return;
    }

    // 滑动开关（不冒泡开详情）
    if (toggle) {
      if (document.body.classList.contains("busy")) return;
      await toggleCellAction(toggle.dataset);
      return;
    }

    if (actBtn) {
      const act = actBtn.dataset.act;
      const name = actBtn.dataset.name ?? "";
      if (document.body.classList.contains("busy")) return;
      if (act === "sync") return void syncAllAgents("skill", name);
      if (act === "mcp-sync") return void syncAllAgents("mcp", name);
      if (act === "rm") return void removeGeneric("skill", name);
      if (act === "mcp-rm") return void removeGeneric("mcp", name);
      setBusy(true);
      try {
        if (act === "import" || act === "import-all") {
          const args =
            act === "import"
              ? ["import", actBtn.dataset.agent ?? "", name, "--json"]
              : ["import", actBtn.dataset.agent ?? "", "--all", "--json"];
          await runAndLog(args, (x: { ok: boolean; name: string; message: string }) => `${x.ok ? "✓" : "✗"} ${x.name} ${x.message}`);
        } else if (act === "mcp-import" || act === "mcp-import-all") {
          const args =
            act === "mcp-import"
              ? ["mcp", "import", actBtn.dataset.agent ?? "", name, "--json"]
              : ["mcp", "import", actBtn.dataset.agent ?? "", "--all", "--json"];
          await runAndLog(args, (x: { ok: boolean; name: string; message: string }) => `${x.ok ? "✓" : "✗"} ${x.name} ${x.message}`);
        }
      } catch (err) {
        log(`操作失败: ${err}`);
      }
      setBusy(false);
      return;
    }

    // 气泡卡片：点空白区域开详情
    const bubble = target.closest<HTMLElement>("[data-detail-kind]");
    if (bubble) {
      openDetail(bubble.dataset.detailKind as DetailKind, bubble.dataset.detailName ?? "");
      return;
    }
  });

  // Esc 关闭浮层（详情优先级低于勾选 modal——modal 自带监听）
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#modal-mask").classList.contains("hidden")) return;
    if (!$("#detail-mask").classList.contains("hidden")) closeDetail();
  });

  // 键盘可达：气泡 Enter/Space 开详情
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const bubble = (e.target as HTMLElement).closest?.("[data-detail-kind]") as HTMLElement | null;
    if (bubble) {
      e.preventDefault();
      openDetail(bubble.dataset.detailKind as DetailKind, bubble.dataset.detailName ?? "");
    }
  });

  $("#refresh").addEventListener("click", () => {
    void refresh();
  });

  // 首次启动：把安装包内置的预填 skill 写入中心库（幂等，已有则跳过；MCP 不预填）
  try {
    const seedDir = await invoke<string | null>("seed_dir");
    if (seedDir) {
      const raw = await runCli(["seed", "--dir", seedDir, "--json"]);
      const r = tryParse<{ results: { name: string; message: string }[] }>(raw);
      const added = r?.results.filter((x) => x.message.includes("已入库")).length ?? 0;
      if (added > 0) log(t("seed.done", { n: added }));
    }
  } catch {
    // seed 失败不阻塞启动（如开发模式无 seed 目录）
  }

  // Agent 管理面板：开关 + 定位操作 + 面板内刷新
  // 详情浮层：MCP 连通性测试
  $("#detail-test").addEventListener("click", async () => {
    if (!detailOpen || detailOpen.kind !== "mcp" || document.body.classList.contains("busy")) return;
    const name = detailOpen.name;
    const el = $("#detail-test-result");
    el.hidden = false;
    el.className = "test-result";
    el.textContent = "正在握手…";
    setBusy(true);
    try {
      const raw = await runCli(["mcp", "test", name, "--json"]);
      const r = tryParse<{ results: { ok: boolean; message: string }[] }>(raw);
      const msg = r?.results[0]?.message ?? raw;
      const ok = r?.results[0]?.ok === true;
      log(`[${name}] ${msg}`);
      el.className = `test-result ${ok ? "ok" : "no"}`;
      el.textContent = msg;
    } catch (err) {
      el.className = "test-result no";
      el.textContent = `测试失败: ${err}`;
    }
    setBusy(false);
  });

  $("#agent-panel-btn").addEventListener("click", () => {
    const panel = $("#agent-panel");
    const willShow = panel.classList.contains("hidden");
    panel.classList.toggle("hidden");
    if (willShow) void loadAgentPanel();
  });
  // 导入规则说明：挂 body 顶层，点感叹号时按其位置右对齐弹出；点其他位置关闭
  $("#import-help-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const pop = $("#import-help-pop");
    if (!pop.classList.contains("hidden")) {
      pop.classList.add("hidden");
      return;
    }
    const btnRect = $("#import-help-btn").getBoundingClientRect();
    pop.classList.remove("hidden");
    const popW = pop.offsetWidth;
    const left = Math.max(12, Math.min(btnRect.right - popW + 22, window.innerWidth - popW - 12));
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.min(btnRect.bottom + 8, window.innerHeight - pop.offsetHeight - 12)}px`;
  });
  $("#import-help-btn").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $("#import-help-btn").click();
    }
  });

  // 从本地选择 zip：系统文件对话框，选中路径直接走导入
  $("#pick-zip").addEventListener("click", async () => {
    if (document.body.classList.contains("busy")) return;
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Skill 压缩包（zip）", extensions: ["zip"] }],
    });
    if (!picked || typeof picked !== "string") return;
    const args = ["add", picked];
    if (($("#add-all") as HTMLInputElement).checked) args.push("--all");
    args.push("--json");
    setBusy(true);
    try {
      const raw = await runCli(args);
      const r = tryParse<{ results: { ok: boolean; name: string; message: string }[] }>(raw);
      log(r ? r.results.map((x) => `${x.ok ? "✓" : "✗"} ${x.name} ${x.message}`).join("\n") : raw);
      await refresh();
    } catch (err) {
      log(`导入失败: ${err}`);
    }
    setBusy(false);
  });
  $("#agent-panel-refresh").addEventListener("click", () => {
    void Promise.all([loadAgentPanel(), refresh()]);
  });
  $("#agent-panel").addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest("button[data-ap-act]") as HTMLButtonElement | null;
    if (!btn) return;
    const agentId = btn.dataset.agent ?? "";
    if (btn.dataset.apAct === "locate") {
      const input = $(`.ap-input[data-agent="${agentId}"]`) as HTMLInputElement;
      const dir = input.value.trim();
      if (!dir) {
        input.focus();
        return;
      }
      await agentLocate(agentId, dir);
    } else if (btn.dataset.apAct === "clear") {
      await agentLocate(agentId, null);
    }
  });
  // 点面板外关闭（Agent 管理面板与导入说明浮层）
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const panel = $("#agent-panel");
    if (!panel.classList.contains("hidden") && !t.closest("#agent-panel") && !t.closest("#agent-panel-btn")) {
      panel.classList.add("hidden");
    }
    const help = $("#import-help-pop");
    if (!help.classList.contains("hidden") && !t.closest("#import-help-pop") && !t.closest("#import-help-btn")) {
      help.classList.add("hidden");
    }
  });

  void refresh();
});
