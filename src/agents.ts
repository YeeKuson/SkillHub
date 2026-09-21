import * as os from 'os';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { SKILL_FILE, listSkillDirs, readSkillMeta, hashDir } from './util';
import { resolveHubRoot } from './hub';
import { resolveAgentHome } from './settings';

export interface InstalledSkill {
  name: string;
  dir: string;
  hash: string;
  description: string;
}

export interface AgentAdapter {
  id: string;
  label: string;
  experimental?: boolean;
  note?: string;
  /** agent 是否已安装（主配置目录存在）；未安装的 agent 在 UI 上不展示 */
  installed(): Promise<boolean>;
  /** 现有 skills 根目录（不创建），找不到返回空数组 */
  skillsRoots(): Promise<string[]>;
  /** 同步用的根目录（缺失则创建） */
  ensureRoots(): Promise<string[]>;
}

function simpleAgent(id: string, label: string, homeSegs: string[], skillsSegs: string[]): AgentAdapter {
  const defaultHome = path.join(os.homedir(), ...homeSegs);
  const defaultRoot = path.join(os.homedir(), ...skillsSegs);
  // 用户手动定位的自定义 home 优先（agent 装在非默认位置时由 Agent 管理面板写入 settings.json）
  const homeOf = (): { home: string; root: string } => {
    const r = resolveAgentHome(resolveHubRoot(), id);
    if (r.source === 'custom' && id !== 'doubao') return { home: r.home, root: path.join(r.home, 'skills') };
    return { home: defaultHome, root: defaultRoot };
  };
  return {
    id,
    label,
    async installed() {
      return fs.existsSync(homeOf().home);
    },
    async skillsRoots() {
      const { root } = homeOf();
      return fs.existsSync(root) ? [root] : [];
    },
    async ensureRoots() {
      const { root } = homeOf();
      await fsp.mkdir(root, { recursive: true });
      return [root];
    },
  };
}

/** 豆包的 skill 目录按 Chromium profile 分散在 User Data 下，逐 profile 探测 */
async function doubaoRoots(create: boolean): Promise<string[]> {
  const userData = path.join(os.homedir(), 'AppData', 'Local', 'DoubaoWork', 'User Data');
  if (!fs.existsSync(userData)) return [];
  const out: string[] = [];
  for (const e of await fsp.readdir(userData, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const workspace = path.join(userData, e.name, '.doubaowork', 'agent_mode', 'workspace');
    if (!fs.existsSync(workspace)) continue;
    const userSkills = path.join(workspace, '.user_skills');
    if (create) await fsp.mkdir(userSkills, { recursive: true });
    else if (!fs.existsSync(userSkills)) continue;
    out.push(userSkills);
  }
  return out;
}

export const AGENTS: AgentAdapter[] = [
  simpleAgent('zcode', 'ZCode', ['.zcode'], ['.zcode', 'skills']),
  simpleAgent('claude', 'Claude Code', ['.claude'], ['.claude', 'skills']),
  simpleAgent('codex', 'Codex', ['.codex'], ['.codex', 'skills']),
  simpleAgent('workbuddy', 'WorkBuddy', ['.workbuddy'], ['.workbuddy', 'skills']),
  {
    id: 'kimi',
    label: 'Kimi Code',
    // 勘察（2026-09-21）：Kimi desktop 内置 openclaw 网关，自动收集 ~/.agents/skills
    // （gateway.asar: userAgentsSkillsDir = join(homedir(), ".agents", "skills")）。
    // 安装探测用 Electron userData 目录（Kimi 启动即创建）。
    // MCP 由网关托管的 openclaw.json 管理（运行时写回），不做文件级同步——在 Kimi 应用内配置。
    note: 'skills 经 ~/.agents/skills 共享层分发（内置网关自动收集）；MCP 需在 Kimi 应用内配置',
    async installed() {
      // 手动定位（agent locate）可覆盖默认 AppData 探测
      const r = resolveAgentHome(resolveHubRoot(), 'kimi');
      return fs.existsSync(r.home);
    },
    async skillsRoots() {
      const root = path.join(os.homedir(), '.agents', 'skills');
      return fs.existsSync(root) ? [root] : [];
    },
    async ensureRoots() {
      const root = path.join(os.homedir(), '.agents', 'skills');
      await fsp.mkdir(root, { recursive: true });
      return [root];
    },
  },
  {
    id: 'doubao',
    label: '豆包 DoubaoWork',
    note: '已验证 .user_skills 会被豆包加载（2026-09-16 人工确认）；MCP/插件不支持文件级同步',
    async installed() {
      return fs.existsSync(path.join(os.homedir(), 'AppData', 'Local', 'DoubaoWork', 'User Data'));
    },
    async skillsRoots() {
      return doubaoRoots(false);
    },
    async ensureRoots() {
      return doubaoRoots(true);
    },
  },
];

export function agentById(id: string): AgentAdapter | undefined {
  return AGENTS.find((a) => a.id === id);
}

export async function listInstalled(root: string): Promise<InstalledSkill[]> {
  const out: InstalledSkill[] = [];
  for (const dir of await listSkillDirs(root)) {
    const meta = await readSkillMeta(dir);
    if (!meta) continue;
    out.push({ name: meta.name, dir, hash: await hashDir(dir), description: meta.description });
  }
  return out;
}

/** 按 frontmatter name（而非目录名）在 agent 中定位已安装的 skill，返回其实际目录 */
export async function findInstalledDir(agent: AgentAdapter, name: string): Promise<string | null> {
  for (const root of await agent.skillsRoots()) {
    for (const dir of await listSkillDirs(root)) {
      const meta = await readSkillMeta(dir);
      if (meta && meta.name === name) return dir;
    }
  }
  return null;
}
