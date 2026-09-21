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
