/**
 * 插件同步内核（Phase 4）：中心库存「元数据」（name@marketplace + version + source），
 * 实体一律由各 agent 原生机制重装；禁止复制 cache 目录、installPath、cacheTransactionId 等本机字段。
 *
 * 各 agent 能力（2026-09-18 实测，见 docs/agent-config-survey.md）：
 * - claude：原生命令全集（plugin list/install/enable/disable + marketplace add/remove），全自动；
 *   已装清单 = `claude plugin list --json`（纯 JSON，含 enabled）；启停落 settings.json enabledPlugins。
 * - zcode：无安装 CLI（GUI only）。登记 installed_plugins.json（数组形）+ known_marketplaces.json（数组形）
 *   + config.json plugins.enabledPlugins（启停；只写它不会装出实体）→ 半自动：注册市场 + 期望启停，实体提示应用内装。
 * - codex：桌面版无 CLI，config.toml [plugins."id"] enabled 段 = 全部已知信息（市场段为桌面自管 local 源）→ 仅启停。
 * - workbuddy：cbc 无独立可执行，installed_plugins.json（v2，键=id 值=数组）+ known_marketplaces.json（对象形，含 isBuiltIn）
 *   → 只读收编；安装/启停在应用内。
 * - 豆包无用户插件系统，不参与。
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { assertWithin, backupFile, writeTextAtomic } from './util';
import { resolveHubRoot } from './hub';
import { findTomlSpans, parseTomlValue } from './mcp';
import { resolveAgentHome } from './settings';

const execFileP = promisify(execFile);

// ---------- 模型 ----------

export interface MarketSource {
  /** github repo（owner/repo）或 https URL */
  ref: string;
  kind: 'github' | 'url';
}

export interface MarketInfo {
  name: string;
  source: MarketSource;
  description?: string;
  addedAt: string;
  from?: string; // 收编来源 agent
}

export interface PluginDef {
  id: string; // "<name>@<marketplace>"
  name: string;
  marketplace: string;
  version?: string;
  description?: string;
  addedAt: string;
  source?: { type: 'agent'; from: string } | { type: 'manual' };
}

const PLUGIN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isValidPluginId(id: string): boolean {
  return PLUGIN_ID_RE.test(id);
}

export function parsePluginId(id: string): { name: string; marketplace: string } | null {
  if (!isValidPluginId(id)) return null;
  const at = id.indexOf('@');
  return { name: id.slice(0, at), marketplace: id.slice(at + 1) };
}

/** 市场来源解析：github repo（owner/repo，不含协议）或 https URL */
export function parseMarketSource(raw: string): MarketSource {
  const s = raw.trim().replace(/\.git$/i, '');
  if (/^https:\/\//i.test(s)) {
    const u = new URL(s);
    if (u.hostname.toLowerCase() === 'github.com') {
      const seg = u.pathname.split('/').filter(Boolean);
      if (seg.length >= 2) return { ref: `${seg[0]}/${seg[1]}`, kind: 'github' };
    }
    return { ref: s, kind: 'url' };
  }
  if (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(s)) return { ref: s, kind: 'github' };
  throw new Error(`不支持的市场来源: ${raw}（请用 owner/repo 或 https URL）`);
}

// ---------- 中心库存储 ----------

export class PluginStore {
  constructor(readonly dir: string, readonly marketsFile: string) {}

  static async open(dir: string): Promise<PluginStore> {
    await fsp.mkdir(dir, { recursive: true });
    return new PluginStore(dir, path.join(path.dirname(dir), 'marketplaces.json'));
  }

  private fileOf(id: string): string {
    if (!isValidPluginId(id)) throw new Error(`非法插件 id: ${id}`);
    return assertWithin(this.dir, `${id}.json`);
  }

  async list(): Promise<PluginDef[]> {
    if (!fs.existsSync(this.dir)) return [];
    const out: PluginDef[] = [];
    for (const e of await fsp.readdir(this.dir, { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(await fsp.readFile(path.join(this.dir, e.name), 'utf8')) as PluginDef);
      } catch {
        // 单个定义损坏不炸列表
      }
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<PluginDef | undefined> {
    const f = this.fileOf(id);
    if (!fs.existsSync(f)) return undefined;
    return JSON.parse(await fsp.readFile(f, 'utf8')) as PluginDef;
  }

  async save(def: PluginDef): Promise<void> {
    await writeTextAtomic(this.fileOf(def.id), JSON.stringify(def, null, 2) + '\n');
  }

  async remove(id: string): Promise<boolean> {
    const f = this.fileOf(id);
    if (!fs.existsSync(f)) return false;
    await fsp.rm(f, { force: true });
    return true;
  }

  async listMarkets(): Promise<MarketInfo[]> {
    if (!fs.existsSync(this.marketsFile)) return [];
    try {
      const v = JSON.parse(await fsp.readFile(this.marketsFile, 'utf8')) as { markets?: MarketInfo[] };
      return Array.isArray(v.markets) ? v.markets : [];
    } catch (e) {
      throw new Error(`marketplaces.json 损坏: ${(e as Error).message}`);
    }
  }

  async saveMarkets(markets: MarketInfo[]): Promise<void> {
    await writeTextAtomic(this.marketsFile, JSON.stringify({ version: 1, markets }, null, 2) + '\n');
  }

  async upsertMarket(m: MarketInfo): Promise<boolean> {
    const markets = await this.listMarkets();
    const i = markets.findIndex((x) => x.name === m.name);
    if (i >= 0) {
      markets[i] = { ...markets[i], source: m.source, description: m.description ?? markets[i].description };
      await this.saveMarkets(markets);
      return false; // 已存在，更新
    }
    markets.push(m);
    await this.saveMarkets(markets);
    return true;
  }

  async getMarket(name: string): Promise<MarketInfo | undefined> {
    return (await this.listMarkets()).find((m) => m.name === name);
  }
}

// ---------- 已装清单 ----------

export interface InstalledPlugin {
  id: string;
  version?: string;
  /** true=已装；false=只有期望记录（如 zcode enabledPlugins 写了 true 但未安装） */
  installed: boolean;
  /** null=该 agent 不暴露启停状态 */
  enabled: boolean | null;
}

// ---------- claude 原生命令 ----------

let claudeBinCache: string | null | undefined;

/** 解析 claude CLI 的真实 exe（.cmd 外壳在 Node execFile 下不可直接执行） */
async function resolveClaudeBin(): Promise<string> {
  if (claudeBinCache !== undefined) return claudeBinCache ?? '';
  try {
    const { stdout } = await execFileP('where', ['claude'], { windowsHide: true });
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    for (const l of lines) {
      if (/\.exe$/i.test(l) && fs.existsSync(l)) {
        claudeBinCache = l;
        return l;
      }
    }
    for (const l of lines) {
      if (/\.cmd$/i.test(l) && fs.existsSync(l)) {
        const text = await fsp.readFile(l, 'utf8');
        const m = text.match(/"([^"]+claude\.exe)"/i);
        if (!m) continue;
        // npm .cmd shim 的路径含 %dp0%/%~dp0% 占位符，展开为 cmd 所在目录
        const dir = path.dirname(l);
        const resolved = m[1].replace(/%~dp0%/gi, dir + path.sep).replace(/%dp0%/gi, dir + path.sep).replace(/%~dp0/gi, dir + path.sep);
        if (fs.existsSync(resolved)) {
          claudeBinCache = resolved;
          return resolved;
        }
      }
    }
  } catch {
    // where 找不到 → 未安装
  }
  claudeBinCache = null;
  return claudeBinCache!;
}

/** 执行 claude 原生命令；参数全部来自白名单 id 与已解析市场来源，不含任意文本 */
async function runClaude(args: string[]): Promise<string> {
  const bin = await resolveClaudeBin();
  if (!bin) throw new Error('未找到 claude CLI（Claude Code 未安装或不在 PATH）');
  try {
    const { stdout } = await execFileP(bin, args, { windowsHide: true, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const detail = (err.stderr || err.message || String(e)).trim().split('\n').slice(-4).join('\n');
    throw new Error(`claude ${args[0]} 失败: ${detail}`);
  }
}

// ---------- 适配器 ----------

export interface PluginAgentAdapter {
  id: string;
  label: string;
  note?: string;
  canAutoInstall: boolean;
  /** agent 是否已安装（主配置目录存在）；未安装的 agent 在 UI 上不展示 */
  installed(): Promise<boolean>;
  readInstalled(): Promise<InstalledPlugin[]>;
  readMarketplaces(): Promise<{ name: string; source?: MarketSource }[]>;
  /** 注册市场：claude 走原生命令；zcode 写登记文件；不支持返回 unsupported */
  ensureMarketplace(m: MarketSource, backupsDir: string): Promise<{ action: 'registered' | 'exists' | 'unsupported'; message?: string; backup?: string }>;
  install(def: PluginDef): Promise<{ action: 'installed' | 'exists' | 'unsupported' | 'pending'; message?: string }>;
  setEnabled(def: PluginDef, enabled: boolean, backupsDir: string): Promise<{ action: 'enabled' | 'disabled' | 'noop' | 'unsupported'; message?: string; backup?: string }>;
}

function readJsonSafe(file: string): Record<string, unknown> | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function zcodePluginsDir(): string {
  return path.join(resolveAgentHome(resolveHubRoot(), 'zcode').home, 'cli', 'plugins');
}
function zcodeConfigFile(): string {
  return path.join(resolveAgentHome(resolveHubRoot(), 'zcode').home, 'cli', 'config.json');
}
function claudePluginsDir(): string {
  return path.join(resolveAgentHome(resolveHubRoot(), 'claude').home, 'plugins');
}
function claudeSettingsFile(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}
function codexConfigFile(): string {
  return path.join(os.homedir(), '.codex', 'config.toml');
}
function workbuddyPluginsDir(): string {
  return path.join(resolveAgentHome(resolveHubRoot(), 'workbuddy').home, 'plugins');
}

/** 统一的市场来源归一：github repo / https URL 之外（local、zip、绝对路径等本机来源）返回 null（不可跨机收编） */
function normalizeMarketSource(src: unknown): MarketSource | null {
  if (!src || typeof src !== 'object') return null;
  const s = src as Record<string, unknown>;
  if (s.source === 'github' && typeof s.repo === 'string') return { ref: s.repo, kind: 'github' };
  if (s.source === 'url' && typeof s.url === 'string' && /^https:\/\//i.test(s.url)) {
    try {
      return parseMarketSource(s.url);
    } catch {
      return null;
    }
  }
  return null;
}

export const PLUGIN_AGENTS: PluginAgentAdapter[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    canAutoInstall: true,
    async installed() {
      return fs.existsSync(path.join(os.homedir(), '.claude'));
    },
    async readInstalled() {
      const out = await runClaude(['plugin', 'list', '--json']);
      const arr = JSON.parse(out) as Record<string, unknown>[];
      return arr.map((p) => ({
        id: String(p.id),
        version: p.version === undefined ? undefined : String(p.version),
        installed: true,
        enabled: p.enabled === undefined ? null : p.enabled === true,
      }));
    },
    async readMarketplaces() {
      const raw = readJsonSafe(path.join(claudePluginsDir(), 'known_marketplaces.json'));
      if (!raw) return [];
      return Object.entries(raw).map(([name, v]) => ({
        name,
        source: normalizeMarketSource((v as Record<string, unknown>)?.source) ?? undefined,
      }));
    },
    async ensureMarketplace(m, backupsDir) {
      const known = await this.readMarketplaces();
      if (known.some((k) => k.name && k.source?.ref === m.ref)) return { action: 'exists' };
      const nameGuess = m.kind === 'github' ? m.ref.split('/')[1] : undefined;
      if (nameGuess && known.some((k) => k.name === nameGuess)) return { action: 'exists' };
      const out = await runClaude(['plugin', 'marketplace', 'add', m.ref]);
      void backupsDir; // 原生命令自带缓存管理，无需文件备份
      const ok = /Successfully added|已添加/i.test(out) || (await this.readMarketplaces()).some((k) => k.source?.ref === m.ref);
      if (!ok) throw new Error(`claude marketplace add 输出异常: ${out.trim().slice(0, 200)}`);
      return { action: 'registered' };
    },
    async install(def) {
      const installed = await this.readInstalled();
      if (installed.some((p) => p.id === def.id)) return { action: 'exists' };
      await runClaude(['plugin', 'install', def.id]);
      return { action: 'installed' };
    },
    async setEnabled(def, enabled) {
      const installed = await this.readInstalled();
      const hit = installed.find((p) => p.id === def.id);
      if (!hit) return { action: 'noop', message: 'claude 未安装该插件' };
      if (hit.enabled === enabled) return { action: 'noop', message: enabled ? '已是启用状态' : '已是禁用状态' }; // enable/disable 原生命令不幂等
      await runClaude(['plugin', enabled ? 'enable' : 'disable', def.id]);
      return { action: enabled ? 'enabled' : 'disabled' };
    },
  },
  {
    id: 'zcode',
    label: 'ZCode',
    note: '无安装 CLI：市场注册与启停可同步，实体需在 ZCode Settings → Plugin Management 安装',
    canAutoInstall: false,
    async installed() {
      return fs.existsSync(path.join(os.homedir(), '.zcode'));
    },
    async readInstalled() {
      const reg = readJsonSafe(path.join(zcodePluginsDir(), 'installed_plugins.json'));
      const cfg = readJsonSafe(zcodeConfigFile());
      const enabled = (rec(rec(cfg?.plugins).enabledPlugins));
      const out = new Map<string, InstalledPlugin>();
      for (const p of Array.isArray(reg?.plugins) ? (reg!.plugins as Record<string, unknown>[]) : []) {
        if (typeof p.id !== 'string') continue;
        out.set(p.id, { id: p.id, version: p.version === undefined ? undefined : String(p.version), installed: true, enabled: p.id in enabled ? enabled[p.id] === true : null });
      }
      for (const [id, v] of Object.entries(enabled)) {
        if (!out.has(id) && v === true) out.set(id, { id, installed: false, enabled: true }); // 期望已写、实体未装
      }
      return [...out.values()];
    },
    async readMarketplaces() {
      const raw = readJsonSafe(path.join(zcodePluginsDir(), 'known_marketplaces.json'));
      const list = Array.isArray(raw?.marketplaces) ? (raw!.marketplaces as Record<string, unknown>[]) : [];
      return list.map((m) => ({ name: String(m.name ?? m.id ?? ''), source: normalizeMarketSource(m.source) ?? undefined }));
    },
    async ensureMarketplace(m, backupsDir) {
      const f = path.join(zcodePluginsDir(), 'known_marketplaces.json');
      const raw = readJsonSafe(f) ?? { version: 1, marketplaces: [] };
      const list = Array.isArray(raw.marketplaces) ? (raw.marketplaces as Record<string, unknown>[]) : [];
      const existing = list.find((x) => {
        const s = normalizeMarketSource(x.source);
        return s?.ref === m.ref;
      });
      if (existing) return { action: 'exists' };
      const name = m.kind === 'github' ? m.ref.split('/')[1] : `market-${Date.now()}`;
      if (list.some((x) => (x.name ?? x.id) === name)) return { action: 'exists' };
      const backup = fs.existsSync(f) ? await backupFile(f, backupsDir, 'zcode', 'plugin-markets') : undefined;
      list.push({
        id: name,
        name,
        source: m.kind === 'github' ? { source: 'github', repo: m.ref } : { source: 'url', url: m.ref },
        addedAt: new Date().toISOString(),
      });
      await writeTextAtomic(f, JSON.stringify({ ...raw, marketplaces: list }, null, 2) + '\n');
      return { action: 'registered', backup };
    },
    async install(def) {
      const installed = await this.readInstalled();
      const hit = installed.find((p) => p.id === def.id);
      if (hit?.installed) return { action: 'exists' };
      return { action: 'pending', message: 'ZCode 无安装 CLI：市场已就绪，请在 ZCode Settings → Plugin Management 完成安装' };
    },
    async setEnabled(def, enabled, backupsDir) {
      const installed = await this.readInstalled();
      const hit = installed.find((p) => p.id === def.id);
      if (!hit?.installed) return { action: 'noop', message: 'ZCode 未安装该插件实体，启停无效（先在应用内安装）' };
      if (hit.enabled === enabled) return { action: 'noop', message: enabled ? '已是启用状态' : '已是禁用状态' };
      const f = zcodeConfigFile();
      const cfg = readJsonSafe(f) ?? {};
      const backup = await backupFile(f, backupsDir, 'zcode', 'plugin-config');
      const plugins = { ...rec(cfg.plugins) };
      plugins.enabledPlugins = { ...rec(plugins.enabledPlugins), [def.id]: enabled };
      cfg.plugins = plugins;
      await writeTextAtomic(f, JSON.stringify(cfg, null, 2) + '\n');
      return { action: enabled ? 'enabled' : 'disabled', backup };
    },
  },
  {
    id: 'codex',
    label: 'Codex',
    note: '桌面版自管插件：仅同步已登记插件的启停段，不安装实体、不注册市场',
    canAutoInstall: false,
    async installed() {
      return fs.existsSync(path.join(os.homedir(), '.codex'));
    },
    async readInstalled() {
      const f = codexConfigFile();
      if (!fs.existsSync(f)) return [];
      const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
      const out: InstalledPlugin[] = [];
      for (const span of findTomlSpans(lines, 'plugins')) {
        let enabled: boolean | null = null;
        for (let i = span.start + 1; i < span.end; i++) {
          const line = lines[i].trim();
          if (/^enabled\s*=/.test(line)) {
            try {
              enabled = parseTomlValue(line.slice(line.indexOf('=') + 1)) === true;
            } catch {
              enabled = null;
            }
            break;
          }
        }
        out.push({ id: span.key, installed: true, enabled });
      }
      return out;
    },
    async readMarketplaces() {
      const f = codexConfigFile();
      if (!fs.existsSync(f)) return [];
      const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
      const out: { name: string; source?: MarketSource }[] = [];
      for (const span of findTomlSpans(lines, 'marketplaces')) {
        let source: MarketSource | null = null;
        for (let i = span.start + 1; i < span.end; i++) {
          const line = lines[i].trim();
          if (/^source\s*=/.test(line)) {
            try {
              const v = parseTomlValue(line.slice(line.indexOf('=') + 1));
              source = normalizeMarketSource({ source: 'url', url: String(v) });
            } catch {
              source = null;
            }
            break;
          }
        }
        out.push({ name: span.key, source: source ?? undefined }); // local 源解析不出 → undefined，收编时跳过
      }
      return out;
    },
    async ensureMarketplace() {
      return { action: 'unsupported' as const, message: 'Codex 市场由桌面端自管（local 源），不支持外部注册' };
    },
    async install() {
      return { action: 'unsupported' as const, message: 'Codex 请在桌面端安装插件，SkillHub 仅同步启停' };
    },
    async setEnabled(def, enabled, backupsDir) {
      const f = codexConfigFile();
      if (!fs.existsSync(f)) return { action: 'noop', message: '未找到 config.toml' };
      const installed = await this.readInstalled();
      if (!installed.some((p) => p.id === def.id)) return { action: 'noop', message: 'Codex 未登记该插件（先在桌面端安装）' };
      const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
      const span = findTomlSpans(lines, 'plugins').find((s) => s.key === def.id)!;
      let changed = false;
      for (let i = span.start + 1; i < span.end; i++) {
        if (/^enabled\s*=/.test(lines[i].trim())) {
          const cur = (() => {
            try {
              return parseTomlValue(lines[i].slice(lines[i].indexOf('=') + 1)) === true;
            } catch {
              return null;
            }
          })();
          if (cur === enabled) return { action: 'noop', message: enabled ? '已是启用状态' : '已是禁用状态' };
          lines[i] = `enabled = ${enabled}`;
          changed = true;
          break;
        }
      }
      if (!changed) return { action: 'noop', message: '段内无 enabled 键，跳过（桌面端自管）' };
      const backup = await backupFile(f, backupsDir, 'codex', 'plugin-config');
      await writeTextAtomic(f, lines.join('\n'));
      return { action: enabled ? 'enabled' : 'disabled', backup };
    },
  },
  {
    id: 'workbuddy',
    label: 'WorkBuddy',
    note: '应用内管理安装与启停；SkillHub 仅收编元数据与市场信息',
    canAutoInstall: false,
    async installed() {
      return fs.existsSync(path.join(os.homedir(), '.workbuddy'));
    },
    async readInstalled() {
      const raw = readJsonSafe(path.join(workbuddyPluginsDir(), 'installed_plugins.json'));
      if (!raw) return [];
      const out: InstalledPlugin[] = [];
      for (const [id, v] of Object.entries(raw)) {
        if (id === 'version' || !Array.isArray(v) || v.length === 0) continue;
        const first = (v as Record<string, unknown>[])[0] ?? {};
        out.push({ id, version: first.version === undefined ? undefined : String(first.version), installed: true, enabled: null });
      }
      return out;
    },
    async readMarketplaces() {
      const raw = readJsonSafe(path.join(workbuddyPluginsDir(), 'known_marketplaces.json'));
      if (!raw) return [];
      return Object.entries(raw)
        .filter(([, v]) => (v as Record<string, unknown>)?.isBuiltIn !== true)
        .map(([name, v]) => ({
          name,
          source: normalizeMarketSource((v as Record<string, unknown>)?.source) ?? undefined,
        }));
    },
    async ensureMarketplace() {
      return { action: 'unsupported' as const, message: 'WorkBuddy 市场请在应用内添加（登记含本机 installLocation，外部写入无效）' };
    },
    async install() {
      return { action: 'unsupported' as const, message: 'WorkBuddy 插件请在应用内安装' };
    },
    async setEnabled() {
      return { action: 'unsupported' as const, message: 'WorkBuddy 启停在应用内管理' };
    },
  },
];

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function pluginAgentById(id: string): PluginAgentAdapter | undefined {
  return PLUGIN_AGENTS.find((a) => a.id === id);
}

// ---------- status ----------

export interface PluginStatus {
  agents: { id: string; label: string; note?: string; canAutoInstall: boolean }[];
  plugins: { id: string; version?: string; description?: string; agents: Record<string, string> }[];
  foreign: Record<string, string[]>;
}

export async function pluginStatus(store: PluginStore): Promise<PluginStatus> {
  const defs = await store.list();
  const installed = new Map<string, Map<string, InstalledPlugin>>();
  for (const a of PLUGIN_AGENTS) {
    let list: InstalledPlugin[] = [];
    try {
      list = await a.readInstalled();
    } catch {
      // 单 agent 读失败（如 claude CLI 缺失）不炸整个 status
    }
    installed.set(a.id, new Map(list.map((p) => [p.id, p])));
  }
  const stateOf = (agentId: string, def: PluginDef): string => {
    const inst = installed.get(agentId)?.get(def.id);
    if (!inst) return 'missing';
    if (!inst.installed) return 'pending';
    if (inst.enabled === false) return 'disabled';
    return 'match';
  };
  const foreign: Record<string, string[]> = {};
  for (const a of PLUGIN_AGENTS) {
    const have = new Set(defs.map((d) => d.id));
    foreign[a.id] = [...(installed.get(a.id)?.values() ?? [])].filter((p) => p.installed && !have.has(p.id)).map((p) => p.id);
  }
  return {
    agents: await Promise.all(
      PLUGIN_AGENTS.map(async ({ id, label, note, canAutoInstall }) => ({
        id,
        label,
        note,
        canAutoInstall,
        installed: await (async () => {
          try {
            return await pluginAgentById(id)!.installed();
          } catch {
            return false;
          }
        })(),
      })),
    ),
    plugins: defs.map((d) => ({
      id: d.id,
      version: d.version,
      description: d.description,
      agents: Object.fromEntries(PLUGIN_AGENTS.map((a) => [a.id, stateOf(a.id, d)])),
    })),
    foreign,
  };
}
