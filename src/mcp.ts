/**
 * MCP 同步内核：中心库存「规范模型」，按 agent 序列化写回。
 * 规则（见 docs/agent-config-survey.md 与 src/mcp.ts 顶部各 agent 注释）：
 * - 密钥一律 ${SKILLHUB_VAR:NAME} 占位符，写回时从 ~/.skillhub/secrets.json 展开为真实值；
 * - 写回前快照备份整个目标配置文件到中心库 backups；
 * - ZCode schema 严格（未知键整个 server 被静默丢弃），序列化必须字段白名单；
 * - 豆包无本地 MCP 配置文件，不参与 MCP 同步。
 */
import * as os from 'os';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { assertWithin, backupFile, stableStringify, writeTextAtomic } from './util';
import { resolveHubRoot } from './hub';
import { resolveAgentHome } from './settings';

// ---------- 规范模型 ----------

export type McpTransport = 'stdio' | 'http' | 'sse';

export interface McpDef {
  name: string;
  transport: McpTransport;
  /** stdio 必填 */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** http/sse 必填 */
  url?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  description?: string;
  addedAt: string;
  source?: { type: 'agent'; from: string } | { type: 'manual' };
  /** 被 SkillHub 主动禁用的 agent 集合（仅无原生禁用字段的 agent 需要，如 claude 撤条目后） */
  disabled?: Record<string, boolean>;
}

/** MCP server 名要进 JSON 键名与 TOML 段名，白名单比 skill 名更紧（无空格/括号） */
const MCP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isValidMcpName(name: string): boolean {
  return MCP_NAME_RE.test(name) && !name.includes('..');
}

export function validateMcpDef(def: McpDef): string[] {
  const errs: string[] = [];
  if (!def.name || !isValidMcpName(def.name)) errs.push(`name 非法（只允许字母数字 . _ -，且不以 - . 开头）: ${def.name}`);
  if (def.transport === 'stdio') {
    if (!def.command) errs.push('stdio 型必须有 command');
  } else if (def.transport === 'http' || def.transport === 'sse') {
    if (!def.url) errs.push(`${def.transport} 型必须有 url`);
  } else {
    errs.push(`transport 必须是 stdio/http/sse: ${def.transport}`);
  }
  return errs;
}

// ---------- 占位符 ----------

const HUB_PLACEHOLDER = (n: string) => '${SKILLHUB_VAR:' + n + '}';
const HUB_PLACEHOLDER_RE = /\$\{SKILLHUB_VAR:([A-Za-z0-9_]+)\}/g;

/** 密钥值表：~/.skillhub/secrets.json（本地文件，永不入 git、永不分发） */
export function loadSecrets(hubRoot: string): Record<string, string> {
  const f = path.join(hubRoot, 'secrets.json');
  if (!fs.existsSync(f)) return {};
  try {
    const v = JSON.parse(fs.readFileSync(f, 'utf8'));
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch (e) {
    throw new Error(`secrets.json 损坏: ${(e as Error).message}`);
  }
}

/** 递归展开字符串字段中的 ${SKILLHUB_VAR:NAME}；缺值抛错，调用方应跳过该 agent 而不是写半配置 */
export function expandPlaceholders<T>(v: T, secrets: Record<string, string>): T {
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') {
      return x.replace(HUB_PLACEHOLDER_RE, (_, n: string) => {
        if (!(n in secrets)) throw new Error(`占位符 ${HUB_PLACEHOLDER(n)} 没有对应值，请在 secrets.json 中提供 "${n}"`);
        return secrets[n];
      });
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') {
      return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, walk(val)]));
    }
    return x;
  };
  return walk(v) as T;
}

/** 收编方向：agent 端自己的 ${ENV} 占位符（如 WorkBuddy 的 ${DNB_ACCESS_TOKEN}）统一转成中心库占位符 */
export function adoptAgentPlaceholder(v: string): string {
  return v.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, n: string) => HUB_PLACEHOLDER(n));
}

// ---------- 中心库存储（~/.skillhub/mcp/<name>.json，目录即索引） ----------

export class McpStore {
  constructor(readonly dir: string) {}

  static async open(dir: string): Promise<McpStore> {
    await fsp.mkdir(dir, { recursive: true });
    return new McpStore(dir);
  }

  private fileOf(name: string): string {
    return assertWithin(this.dir, `${name}.json`);
  }

  async list(): Promise<McpDef[]> {
    if (!fs.existsSync(this.dir)) return [];
    const out: McpDef[] = [];
    for (const e of await fsp.readdir(this.dir, { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(await fsp.readFile(path.join(this.dir, e.name), 'utf8')) as McpDef);
      } catch {
        // 单个定义文件损坏不炸整个列表，跳过（list 只读）
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(name: string): Promise<McpDef | undefined> {
    const f = this.fileOf(name);
    if (!fs.existsSync(f)) return undefined;
    return JSON.parse(await fsp.readFile(f, 'utf8')) as McpDef;
  }

  async save(def: McpDef): Promise<void> {
    await writeTextAtomic(this.fileOf(def.name), JSON.stringify(def, null, 2) + '\n');
  }

  async remove(name: string): Promise<boolean> {
    const f = this.fileOf(name);
    if (!fs.existsSync(f)) return false;
    await fsp.rm(f, { force: true });
    return true;
  }
}

// ---------- 各 agent 目标形状（字段白名单序列化） ----------

/**
 * ZCode: ~/.zcode/cli/config.json → mcp.servers（嵌套）。
 * stdio: type/command/args/cwd/env/enabled/timeoutMs；http/sse: type/url/headers/enabled/timeoutMs。
 * schema 严格：未知键 → 整个 server 被静默丢弃；配置文件不展开 ${...} 模板。
 */
function zcodeServerOf(def: McpDef): Record<string, unknown> {
  if (def.transport === 'stdio') {
    const o: Record<string, unknown> = { type: 'stdio', command: def.command };
    if (def.args?.length) o.args = def.args;
    if (def.env && Object.keys(def.env).length) o.env = def.env;
    if (def.timeoutMs) o.timeoutMs = def.timeoutMs;
    return o;
  }
  const o: Record<string, unknown> = { type: def.transport, url: def.url };
  if (def.headers && Object.keys(def.headers).length) o.headers = def.headers;
  if (def.timeoutMs) o.timeoutMs = def.timeoutMs;
  return o;
}

/** Claude Code: ~/.claude.json 顶层 mcpServers。stdio 官方形态不带 type；http/sse 带 type。无 timeout 字段。 */
function claudeServerOf(def: McpDef): Record<string, unknown> {
  if (def.transport === 'stdio') {
    const o: Record<string, unknown> = { command: def.command };
    if (def.args?.length) o.args = def.args;
    if (def.env && Object.keys(def.env).length) o.env = def.env;
    return o;
  }
  const o: Record<string, unknown> = { type: def.transport, url: def.url };
  if (def.headers && Object.keys(def.headers).length) o.headers = def.headers;
  return o;
}

/** WorkBuddy: connectors\<uuid>\mcp.json → mcpServers，键名 "connector:<名>"，type 用 streamableHttp，timeout 毫秒。 */
function workbuddyServerOf(def: McpDef): Record<string, unknown> {
  if (def.transport === 'stdio') {
    const s: Record<string, unknown> = { type: 'stdio', command: def.command };
    if (def.args?.length) s.args = def.args;
    if (def.env && Object.keys(def.env).length) s.env = def.env;
    if (def.timeoutMs) s.timeout = def.timeoutMs;
    return s;
  }
  const o: Record<string, unknown> = { type: def.transport === 'http' ? 'streamableHttp' : def.transport, url: def.url };
  if (def.headers && Object.keys(def.headers).length) o.headers = def.headers;
  if (def.timeoutMs) o.timeout = def.timeoutMs;
  return o;
}

// ---------- agent 端条目 → 规范模型（收编/import 与状态比较用） ----------

export interface InstalledMcp {
  name: string;
  /** 无法规范化的条目为 null（status 显示 diff，import 跳过） */
  def: McpDef | null;
  raw: unknown;
  disabled?: boolean;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function strMap(v: unknown): Record<string, string> | undefined {
  const r = rec(v);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(r)) out[k] = String(val);
  return Object.keys(out).length ? out : undefined;
}

/** agent 端原始条目 → 规范模型；只提取已知字段，未知字段丢弃（返回时由调用方提示） */
export function normalizeEntry(name: string, raw: unknown, typeOf: (raw: Record<string, unknown>) => McpTransport | null): McpDef | null {
  const r = rec(raw);
  const transport = typeOf(r);
  if (!transport) return null;
  const def: McpDef = { name, transport, addedAt: '' };
  if (typeof r.command === 'string') def.command = r.command;
  if (Array.isArray(r.args)) def.args = r.args.map(String);
  if (r.env !== undefined) def.env = strMap(r.env);
  if (r.headers !== undefined) def.headers = strMap(r.headers);
  if (typeof r.url === 'string') def.url = r.url;
  if (typeof r.timeoutMs === 'number') def.timeoutMs = r.timeoutMs;
  if (typeof r.timeout === 'number') def.timeoutMs = r.timeout; // workbuddy 毫秒字段名
  return validateMcpDef(def).length === 0 ? def : null;
}

// ---------- Codex config.toml：TOML 手术（保段增删改，不动文件其余部分） ----------

function tomlStr(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function codexBlockOf(name: string, def: McpDef): string {
  const lines: string[] = [`[mcp_servers.${name}]`];
  if (def.transport === 'stdio') {
    lines.push(`command = ${tomlStr(def.command ?? '')}`);
    lines.push(`args = [${(def.args ?? []).map((a) => tomlStr(a)).join(', ')}]`);
    const env = def.env ?? {};
    if (Object.keys(env).length) {
      lines.push('');
      lines.push(`[mcp_servers.${name}.env]`);
      for (const [k, v] of Object.entries(env)) lines.push(`${k} = ${tomlStr(v)}`);
    }
  } else {
    lines.push(`url = ${tomlStr(def.url ?? '')}`);
  }
  return lines.join('\n') + '\n';
}

/** 极简 TOML 值解析：双引号/单引号字符串、数字、布尔、单行数组。解析失败抛错。 */
export function parseTomlValue(s: string): unknown {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) return JSON.parse(t);
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
  if (t.startsWith('[') && t.endsWith(']')) {
    const inner = t.slice(1, -1).trim();
    if (!inner) return [];
    const items: unknown[] = [];
    const re = /("[^"]*"|'[^']*'|[^,]+)/g;
    for (const m of inner.match(re) ?? []) {
      const piece = m.trim();
      if (piece) items.push(parseTomlValue(piece));
    }
    return items;
  }
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
  throw new Error(`无法解析的 TOML 值: ${s}`);
}

interface TomlSpan {
  key: string; // 段名（root 后第一段，引号已剥离）
  start: number; // 段头行号（含）
  end: number; // 结束行号（不含，指向下一个段头或文件尾）
}

const TOML_HEADER_RE = /^\[([^\]]+)\]\s*$/;

function tomlHeaderName(header: string): { path: string[] } | null {
  const m = header.match(TOML_HEADER_RE);
  if (!m) return null;
  const path: string[] = [];
  const re = /"[^"]*"|[^.]+/g;
  for (const piece of m[1].match(re) ?? []) path.push(piece.replace(/^"|"$/g, ''));
  return { path };
}

/** 找出 [<root>.<key>] 及其子表的行区间（按出现顺序）；供 mcp_servers 与 plugins 两类段手术复用 */
export function findTomlSpans(lines: string[], root: string): TomlSpan[] {
  const spans: TomlSpan[] = [];
  let current: TomlSpan | null = null;
  lines.forEach((line, i) => {
    const h = tomlHeaderName(line);
    if (h && h.path[0] === root && h.path.length >= 2) {
      if (current) current.end = i;
      current = { key: h.path[1], start: i, end: lines.length };
      spans.push(current);
    } else if (h && current) {
      current.end = i;
      current = null;
    }
  });
  return spans;
}

function findTomlServerSpans(lines: string[]): TomlSpan[] {
  return findTomlSpans(lines, 'mcp_servers');
}

function parseCodexServers(text: string): Map<string, { def: McpDef | null; unknownFields: string[]; disabled: boolean }> {
  const lines = text.split(/\r?\n/);
  const out = new Map<string, { def: McpDef | null; unknownFields: string[]; disabled: boolean }>();
  for (const span of findTomlServerSpans(lines)) {
    const def: McpDef = { name: span.key, transport: 'stdio', addedAt: '' };
    const unknown: string[] = [];
    let inEnv = false;
    let disabled = false;
    const env: Record<string, string> = {};
    for (let i = span.start; i < span.end; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      const h = tomlHeaderName(line);
      if (h) {
        inEnv = h.path.length === 3 && h.path[2] === 'env';
        continue;
      }
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const rawVal = line.slice(eq + 1);
      try {
        const val = parseTomlValue(rawVal);
        if (inEnv) env[key] = String(val);
        else if (key === 'command') def.command = String(val);
        else if (key === 'args') def.args = (val as unknown[]).map(String);
        else if (key === 'url') {
          def.url = String(val);
          def.transport = 'http';
        } else if (key === 'enabled') disabled = val === false;
        else unknown.push(key);
      } catch {
        unknown.push(key);
      }
    }
    if (Object.keys(env).length) def.env = env;
    out.set(span.key, { def: validateMcpDef(def).length === 0 ? def : null, unknownFields: unknown, disabled });
  }
  return out;
}

/** 对 config.toml 做「段替换/段插入」；返回新文本。name 已通过白名单校验（无引号需求）。 */
function upsertTomlServer(text: string, name: string, def: McpDef): string {
  const block = codexBlockOf(name, def);
  const lines = text.split(/\r?\n/);
  const spans = findTomlServerSpans(lines).filter((s) => s.key === name);
  if (spans.length > 0) {
    const first = spans[0];
    const last = spans[spans.length - 1];
    const replaced = [...lines.slice(0, first.start), ...block.split('\n').slice(0, -1), ...lines.slice(last.end)];
    return replaced.join('\n');
  }
  const allSpans = findTomlServerSpans(lines);
  const insertAt = allSpans.length > 0 ? allSpans[allSpans.length - 1].end : firstHeaderLine(lines) ?? lines.length;
  const blockLines = block.split('\n').slice(0, -1);
  const out = [...lines.slice(0, insertAt), '', ...blockLines, ...lines.slice(insertAt)];
  return out.join('\n').replace(/^\n+/, '');
}

function removeTomlServer(text: string, name: string): { text: string; removed: boolean } {
  const lines = text.split(/\r?\n/);
  const spans = findTomlServerSpans(lines).filter((s) => s.key === name);
  if (spans.length === 0) return { text, removed: false };
  const drop = new Set<number>();
  for (const s of spans) for (let i = s.start; i < s.end; i++) drop.add(i);
  const out = lines.filter((_, i) => !drop.has(i));
  // 去掉删除后残留的连续空行（最多保留一个）
  const cleaned: string[] = [];
  for (const l of out) {
    if (l.trim() === '' && cleaned.length && cleaned[cleaned.length - 1].trim() === '') continue;
    cleaned.push(l);
  }
  while (cleaned.length && cleaned[cleaned.length - 1].trim() === '') cleaned.pop();
  return { text: cleaned.join('\n') + '\n', removed: true };
}

function firstHeaderLine(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) if (TOML_HEADER_RE.test(lines[i])) return i;
  return null;
}

/**
 * Codex enabled 开关（行级手术）：enabled 键属于 [mcp_servers.<name>] 主表，
 * 必须在下一个段头（含子表头）之前。禁用 = 插入/改值 `enabled = false`；启用 = 删掉该行（官方语义：省略即启用）。
 * 不做整段重写，避免丢失桌面端自写的本机字段（startup_timeout_sec 等）。
 */
function codexSetEnabledLine(text: string, name: string, disabled: boolean): { text: string; changed: boolean } {
  const lines = text.split(/\r?\n/);
  const span = findTomlServerSpans(lines).find((s) => s.key === name);
  if (!span) return { text, changed: false };
  let sectionEnd = lines.length;
  for (let i = span.start + 1; i < lines.length; i++) {
    if (TOML_HEADER_RE.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }
  const enabledRe = /^enabled\s*=/;
  let found = -1;
  for (let i = span.start + 1; i < sectionEnd; i++) {
    if (enabledRe.test(lines[i].trim())) {
      found = i;
      break;
    }
  }
  if (disabled) {
    if (found >= 0) {
      if (/=\s*false\s*$/.test(lines[found].trim())) return { text, changed: false };
      lines[found] = 'enabled = false';
    } else {
      lines.splice(span.start + 1, 0, 'enabled = false');
    }
    return { text: lines.join('\n'), changed: true };
  }
  if (found < 0) return { text, changed: false };
  lines.splice(found, 1);
  return { text: lines.join('\n'), changed: true };
}

// ---------- MCP agent 适配器 ----------

export interface McpAgentAdapter {
  id: string;
  label: string;
  note?: string;
  /** agent 是否已安装（主配置目录存在）；未安装的 agent 在 UI 上不展示 */
  installed(): Promise<boolean>;
  /** 该 agent 当前实际在用的 MCP 配置文件（用于备份与诊断；不存在则空） */
  configPaths(): Promise<string[]>;
  readInstalled(): Promise<InstalledMcp[]>;
  /** def 必须已完成占位符展开；写回前备份 */
  syncOne(def: McpDef, backupsDir: string): Promise<{ action: 'installed' | 'updated' | 'current'; backup?: string }>;
  removeOne(name: string, backupsDir: string): Promise<{ removed: boolean; backup?: string }>;
  /**
   * 禁用/启用一个 server。
   * 有原生开关字段的翻字段（条目保留在配置里）；没有的（claude）撤条目/重写条目。
   * disabled=false 时视为「写入启用形态」：条目不在则用 def 重新安装。
   * needsHubMark=true 表示 agent 端读不出禁用状态，需要中心库 def.disabled 标记配合。
   */
  setDisabled(def: McpDef, disabled: boolean, backupsDir: string): Promise<{ action: 'disabled' | 'enabled' | 'noop'; message?: string; needsHubMark?: boolean }>;
}

function readJson(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  return rec(JSON.parse(fs.readFileSync(file, 'utf8')));
}

async function syncJsonServer(
  file: string,
  getMap: (cfg: Record<string, unknown>) => Record<string, unknown>,
  setMap: (cfg: Record<string, unknown>, m: Record<string, unknown>) => void,
  key: string,
  expect: Record<string, unknown>,
  backupsDir: string,
  agentId: string,
): Promise<{ action: 'installed' | 'updated' | 'current'; backup?: string }> {
  const cfg = readJson(file);
  const servers = getMap(cfg);
  if (stableStringify(servers[key]) === stableStringify(expect)) return { action: 'current' };
  let backup: string | undefined;
  if (fs.existsSync(file)) backup = await backupFile(file, backupsDir, agentId, 'mcp-config');
  const next = { ...servers, [key]: expect };
  setMap(cfg, next);
  await writeTextAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
  return { action: key in servers ? 'updated' : 'installed', backup };
}

async function removeJsonServer(
  file: string,
  getMap: (cfg: Record<string, unknown>) => Record<string, unknown>,
  setMap: (cfg: Record<string, unknown>, m: Record<string, unknown>) => void,
  key: string,
  backupsDir: string,
  agentId: string,
): Promise<{ removed: boolean; backup?: string }> {
  if (!fs.existsSync(file)) return { removed: false };
  const cfg = readJson(file);
  const servers = getMap(cfg);
  if (!(key in servers)) return { removed: false };
  const backup = await backupFile(file, backupsDir, agentId, 'mcp-config');
  const next = { ...servers };
  delete next[key];
  setMap(cfg, next);
  await writeTextAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
  return { removed: true, backup };
}

function zcodeConfigFile(): string {
  // 自定义 home（Agent 管理面板手动定位）优先；claude 的 .claude.json 与 settings.json 始终在系统用户主目录（Claude Code 固定行为）
  return path.join(resolveAgentHome(resolveHubRoot(), 'zcode').home, 'cli', 'config.json');
}

const zcodeGet = (cfg: Record<string, unknown>) => rec(rec(cfg.mcp).servers);

function claudeConfigFile(): string {
  return path.join(os.homedir(), '.claude.json');
}

/** Claude 对 MCP server 的工具级审批在 settings.json 的 permissions.allow（mcp__<名> 预授权整个 server） */
function claudeSettingsFile(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

/** 增/删 claude 的 mcp__<name> 预授权规则；只动 permissions.allow，不读不打印 env 等敏感段 */
async function claudeAllowRule(name: string, add: boolean, backupsDir: string): Promise<void> {
  const f = claudeSettingsFile();
  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(f)) {
    cfg = rec(JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  const perms = rec(cfg.permissions);
  const allow = Array.isArray(perms.allow) ? (perms.allow as unknown[]).map(String) : [];
  const rule = `mcp__${name}`;
  const has = allow.includes(rule);
  if (add && has) return;
  if (!add && !has) return;
  const backup = fs.existsSync(f) ? await backupFile(f, backupsDir, 'claude', 'settings-permissions') : undefined;
  void backup;
  const nextAllow = add ? [...allow, rule] : allow.filter((x) => x !== rule);
  const nextPerms = { ...perms, allow: nextAllow };
  if (nextAllow.length === 0 && !('ask' in nextPerms) && !('deny' in nextPerms)) {
    delete cfg.permissions; // 整组为空则移除，不留空壳
  } else {
    cfg.permissions = nextPerms;
  }
  await writeTextAtomic(f, JSON.stringify(cfg, null, 2) + '\n');
}

async function workbuddyMcpFiles(): Promise<string[]> {
  const dir = path.join(resolveAgentHome(resolveHubRoot(), 'workbuddy').home, 'connectors');
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const f = path.join(dir, e.name, 'mcp.json');
    if (fs.existsSync(f)) out.push(f);
  }
  return out;
}

function codexConfigFile(): string {
  return path.join(resolveAgentHome(resolveHubRoot(), 'codex').home, 'config.toml');
}

export function transportFromType(r: Record<string, unknown>): McpTransport | null {
  const t = typeof r.type === 'string' ? r.type.toLowerCase() : undefined;
  if (t === 'stdio') return 'stdio';
  if (t === 'http' || t === 'streamablehttp' || t === 'streamable-http') return 'http';
  if (t === 'sse') return 'sse';
  if (!t && typeof r.command === 'string') return 'stdio'; // claude stdio 不带 type
  if (!t && typeof r.url === 'string') return 'http';
  return null;
}

export const MCP_AGENTS: McpAgentAdapter[] = [
  {
    id: 'zcode',
    label: 'ZCode',
    async installed() {
      return fs.existsSync(path.join(os.homedir(), '.zcode'));
    },
    async configPaths() {
      const f = zcodeConfigFile();
      return fs.existsSync(f) ? [f] : [];
    },
    async readInstalled() {
      const f = zcodeConfigFile();
      if (!fs.existsSync(f)) return [];
      const servers = zcodeGet(readJson(f));
      return Object.entries(servers).map(([name, raw]) => ({
        name,
        raw,
        def: normalizeEntry(name, raw, transportFromType),
        disabled: rec(raw).enabled === false,
      }));
    },
    async syncOne(def, backupsDir) {
      return syncJsonServer(zcodeConfigFile(), zcodeGet, (cfg, m) => {
        cfg.mcp = { ...rec(cfg.mcp), servers: m };
      }, def.name, zcodeServerOf(def), backupsDir, 'zcode');
    },
    async removeOne(name, backupsDir) {
      return removeJsonServer(zcodeConfigFile(), zcodeGet, (cfg, m) => {
        cfg.mcp = { ...rec(cfg.mcp), servers: m };
      }, name, backupsDir, 'zcode');
    },
    async setDisabled(def, disabled, backupsDir) {
      if (!disabled) {
        const r = await this.syncOne(def, backupsDir); // 启用形态不含 enabled 键，覆盖写入即恢复
        return { action: 'enabled', message: `已启用（${r.action === 'current' ? '已是启用状态' : '已写入'}）` };
      }
      const f = zcodeConfigFile();
      if (!fs.existsSync(f)) return { action: 'noop', message: '未找到 zcode 配置文件' };
      const servers = zcodeGet(readJson(f));
      if (!(def.name in servers)) return { action: 'noop', message: '未安装，无法禁用' };
      const cur = rec(servers[def.name]);
      if (cur.enabled === false) return { action: 'noop', message: '已是禁用状态' };
      await backupFile(f, backupsDir, 'zcode', 'mcp-config');
      const next = { ...servers, [def.name]: { ...cur, enabled: false } };
      const cfg = readJson(f);
      cfg.mcp = { ...rec(cfg.mcp), servers: next };
      await writeTextAtomic(f, JSON.stringify(cfg, null, 2) + '\n');
      return { action: 'disabled' };
    },
  },
  {
    id: 'claude',
    label: 'Claude Code',
    async installed() {
      return fs.existsSync(path.join(os.homedir(), '.claude'));
    },
    async configPaths() {
      const f = claudeConfigFile();
      return fs.existsSync(f) ? [f] : [];
    },
    async readInstalled() {
      const f = claudeConfigFile();
      if (!fs.existsSync(f)) return [];
      const servers = rec(readJson(f).mcpServers);
      return Object.entries(servers).map(([name, raw]) => ({
        name,
        raw,
        def: normalizeEntry(name, raw, transportFromType),
      }));
    },
    async syncOne(def, backupsDir) {
      return syncJsonServer(claudeConfigFile(), (cfg) => rec(cfg.mcpServers), (cfg, m) => {
        cfg.mcpServers = m;
      }, def.name, claudeServerOf(def), backupsDir, 'claude');
    },
    async removeOne(name, backupsDir) {
      return removeJsonServer(claudeConfigFile(), (cfg) => rec(cfg.mcpServers), (cfg, m) => {
        cfg.mcpServers = m;
      }, name, backupsDir, 'claude');
    },
    async setDisabled(def, disabled, backupsDir) {
      if (!disabled) {
        const r = await this.syncOne(def, backupsDir);
        await claudeAllowRule(def.name, true, backupsDir); // 预授权工具调用，免去首次确认
        return { action: 'enabled', needsHubMark: true, message: `已启用并写入免确认授权` };
      }
      const f = claudeConfigFile();
      if (!fs.existsSync(f)) return { action: 'noop', message: '未找到 .claude.json' };
      const cfg = readJson(f);
      const servers = rec(cfg.mcpServers);
      if (!(def.name in servers)) return { action: 'noop', message: '未安装，无法禁用' };
      const r = await removeJsonServer(claudeConfigFile(), (c) => rec(c.mcpServers), (c, m) => {
        c.mcpServers = m;
      }, def.name, backupsDir, 'claude');
      if (!r.removed) return { action: 'noop', message: '未安装，无法禁用' };
      await claudeAllowRule(def.name, false, backupsDir);
      return { action: 'disabled', needsHubMark: true };
    },
  },
  {
    id: 'codex',
    label: 'Codex',
    note: 'http 型走 config.toml 的 url 字段（本机无先例，首次同步后请在 Codex 内确认）',
    async installed() {
      return fs.existsSync(path.join(os.homedir(), '.codex'));
    },
    async configPaths() {
      const f = codexConfigFile();
      return fs.existsSync(f) ? [f] : [];
    },
    async readInstalled() {
      const f = codexConfigFile();
      if (!fs.existsSync(f)) return [];
      const parsed = parseCodexServers(fs.readFileSync(f, 'utf8'));
      return [...parsed.entries()].map(([name, { def, disabled }]) => ({ name, raw: null, def, disabled }));
    },
    async syncOne(def, backupsDir) {
      if (def.transport === 'sse') throw new Error('Codex 的 config.toml 只支持 stdio 与 http(url) 型，不支持 sse');
      const f = codexConfigFile();
      const text = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      const exists = parseCodexServers(text).has(def.name);
      const next = upsertTomlServer(text, def.name, def);
      if (next === text) return { action: 'current' };
      const backup = fs.existsSync(f) ? await backupFile(f, backupsDir, 'codex', 'mcp-config') : undefined;
      await writeTextAtomic(f, next);
      return { action: exists ? 'updated' : 'installed', backup };
    },
    async removeOne(name, backupsDir) {
      const f = codexConfigFile();
      if (!fs.existsSync(f)) return { removed: false };
      const text = fs.readFileSync(f, 'utf8');
      const { text: next, removed } = removeTomlServer(text, name);
      if (!removed) return { removed: false };
      const backup = await backupFile(f, backupsDir, 'codex', 'mcp-config');
      await writeTextAtomic(f, next);
      return { removed: true, backup };
    },
    async setDisabled(def, disabled, backupsDir) {
      const f = codexConfigFile();
      if (!fs.existsSync(f)) return { action: 'noop', message: '未找到 config.toml' };
      const text = fs.readFileSync(f, 'utf8');
      if (!parseCodexServers(text).has(def.name)) {
        if (!disabled) {
          const r = await this.syncOne(def, backupsDir); // 未安装：启用 = 安装
          return { action: 'enabled', message: `未安装过，已按启用形态安装` };
        }
        return { action: 'noop', message: '未安装，无法禁用' };
      }
      const { text: next, changed } = codexSetEnabledLine(text, def.name, disabled);
      if (!changed) return { action: 'noop', message: disabled ? '已是禁用状态' : '已是启用状态' };
      await backupFile(f, backupsDir, 'codex', 'mcp-config');
      await writeTextAtomic(f, next);
      return { action: disabled ? 'disabled' : 'enabled' };
    },
  },
  {
    id: 'workbuddy',
    label: 'WorkBuddy',
    note: '键名带 connector: 前缀；timeout 为毫秒；应用可能重写下发条目，改完需在应用内确认',
    async installed() {
      return fs.existsSync(path.join(os.homedir(), '.workbuddy'));
    },
    async configPaths() {
      return workbuddyMcpFiles();
    },
    async readInstalled() {
      const files = await workbuddyMcpFiles();
      const merged = new Map<string, InstalledMcp>();
      for (const f of files) {
        const servers = rec(readJson(f).mcpServers);
        for (const [key, raw] of Object.entries(servers)) {
          const name = key.startsWith('connector:') ? key.slice('connector:'.length) : key;
          merged.set(name, {
            name,
            raw,
            def: normalizeEntry(name, raw, transportFromType),
            disabled: rec(raw).disabled === true,
          });
        }
      }
      return [...merged.values()];
    },
    async syncOne(def, backupsDir) {
      const files = await workbuddyMcpFiles();
      if (files.length === 0) throw new Error('未找到 connectors 目录（WorkBuddy 未初始化账号）');
      let action: 'installed' | 'updated' | 'current' = 'current';
      let backup: string | undefined;
      for (const f of files) {
        const r = await syncJsonServer(
          f,
          (cfg) => rec(cfg.mcpServers),
          (cfg, m) => {
            cfg.mcpServers = m;
          },
          `connector:${def.name}`,
          workbuddyServerOf(def),
          backupsDir,
          'workbuddy',
        );
        if (r.action !== 'current') action = r.action;
        backup = r.backup ?? backup;
      }
      return { action, backup };
    },
    async removeOne(name, backupsDir) {
      const files = await workbuddyMcpFiles();
      let removed = false;
      let backup: string | undefined;
      for (const f of files) {
        const r = await removeJsonServer(
          f,
          (cfg) => rec(cfg.mcpServers),
          (cfg, m) => {
            cfg.mcpServers = m;
          },
          `connector:${name}`,
          backupsDir,
          'workbuddy',
        );
        if (r.removed) removed = true;
        backup = r.backup ?? backup;
      }
      return { removed, backup };
    },
    async setDisabled(def, disabled, backupsDir) {
      if (!disabled) {
        const r = await this.syncOne(def, backupsDir); // 启用形态不含 disabled 键，覆盖即恢复
        return { action: 'enabled', message: '已启用' };
      }
      const files = await workbuddyMcpFiles();
      if (files.length === 0) return { action: 'noop', message: '未找到 connectors 目录' };
      let touched = false;
      for (const f of files) {
        const cfg = readJson(f);
        const servers = rec(cfg.mcpServers);
        const key = `connector:${def.name}`;
        if (!(key in servers)) continue;
        const cur = rec(servers[key]);
        if (cur.disabled === true) continue;
        await backupFile(f, backupsDir, 'workbuddy', 'mcp-config');
        servers[key] = { ...cur, disabled: true };
        cfg.mcpServers = servers;
        await writeTextAtomic(f, JSON.stringify(cfg, null, 2) + '\n');
        touched = true;
      }
      if (!touched) return { action: 'noop', message: '未安装或已是禁用状态' };
      return { action: 'disabled' };
    },
  },
];

export function mcpAgentById(id: string): McpAgentAdapter | undefined {
  return MCP_AGENTS.find((a) => a.id === id);
}

/** 各 agent 的期望序列化形状（status 比较与测试断言用） */
export function serverShapeFor(agentId: string, def: McpDef): Record<string, unknown> | null {
  switch (agentId) {
    case 'zcode':
      return zcodeServerOf(def);
    case 'claude':
      return claudeServerOf(def);
    case 'workbuddy':
      return workbuddyServerOf(def);
    default:
      return null; // codex 是 TOML 文本块，无 JSON 形状
  }
}

/** status 矩阵：中心库定义 × agent 安装状态（missing/match/diff/disabled） */
export interface McpStatus {
  agents: { id: string; label: string; note?: string }[];
  servers: {
    name: string;
    transport: McpTransport;
    url?: string;
    command?: string;
    description?: string;
    agents: Record<string, string>;
  }[];
  foreign: Record<string, string[]>;
}

export async function mcpStatus(store: McpStore): Promise<McpStatus> {
  const defs = await store.list();
  const installed = new Map<string, Map<string, InstalledMcp>>();
  for (const a of MCP_AGENTS) {
    const m = new Map<string, InstalledMcp>();
    for (const s of await a.readInstalled()) m.set(s.name, s);
    installed.set(a.id, m);
  }
  const stateOf = (agentId: string, def: McpDef): string => {
    const inst = installed.get(agentId)?.get(def.name);
    if (!inst) return def.disabled?.[agentId] ? 'disabled' : 'missing';
    if (inst.disabled) return 'disabled';
    if (agentId === 'codex') {
      // codex：比较规范化 def 与中心库 def（展开后）的语义字段
      const cur = inst.def;
      if (!cur) return 'diff';
      const pick = (d: McpDef) =>
        stableStringify({ t: d.transport, c: d.command, a: d.args, e: d.env, u: d.url });
      return pick(cur) === pick(def) ? 'match' : 'diff';
    }
    const expect = serverShapeFor(agentId, def);
    if (!expect || !inst.def) return 'diff';
    // 双向 round-trip 比较：agent 条目规范化回目标形状 vs 中心库定义的目标形状
    const actual = serverShapeFor(agentId, { ...inst.def, timeoutMs: inst.def.timeoutMs });
    return actual && stableStringify(actual) === stableStringify(expect) ? 'match' : 'diff';
  };
  const servers = defs.map((def) => ({
    name: def.name,
    transport: def.transport,
    url: def.url,
    command: def.command,
    description: def.description,
    agents: Object.fromEntries(MCP_AGENTS.map((a) => [a.id, stateOf(a.id, def)])),
  }));
  const foreign: Record<string, string[]> = {};
  for (const a of MCP_AGENTS) {
    const have = new Set(defs.map((d) => d.name));
    foreign[a.id] = [...(installed.get(a.id)?.values() ?? [])]
      .filter((s) => !have.has(s.name) && !s.disabled)
      .map((s) => s.name);
  }
  return {
    agents: await Promise.all(
      MCP_AGENTS.map(async ({ id, label, note }) => ({ id, label, note, installed: await installedOf(id) })),
    ),
    servers,
    foreign,
  };
}

async function installedOf(agentId: string): Promise<boolean> {
  const a = mcpAgentById(agentId);
  if (!a) return false;
  try {
    return await a.installed();
  } catch {
    return false;
  }
}
