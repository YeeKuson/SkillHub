/**
 * 中心库设置（~/.skillhub/settings.json）：
 * agentHome 记录用户手动定位的 agent 配置根目录（自动探测不到时的兜底，如 agent 装在非 C 盘用户目录）。
 * 语义：自定义 home 替换 ~/.<agent> 锚点——skills（<home>/skills）、插件存储、各 agent MCP 配置文件
 * 均从该目录派生；例外：claude 的 ~/.claude.json 与 settings.json 始终位于系统用户主目录（Claude Code 的固定行为），不受影响；豆包不支持自定义定位。
 */
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { writeTextAtomic } from './util';

export interface HubSettings {
  agentHome?: Record<string, string>;
}

export const AGENT_IDS = ['zcode', 'claude', 'codex', 'workbuddy', 'kimi', 'doubao'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/** 各 agent 默认配置根目录（Windows x86：C 盘用户目录下的点目录；豆包/Kimi 在 AppData） */
export function defaultAgentHome(id: string): string {
  if (id === 'doubao') return path.join(os.homedir(), 'AppData', 'Local', 'DoubaoWork', 'User Data');
  if (id === 'kimi') return path.join(os.homedir(), 'AppData', 'Roaming', 'kimi-desktop');
  return path.join(os.homedir(), `.${id}`);
}

export function settingsFile(hubRoot: string): string {
  return path.join(hubRoot, 'settings.json');
}

export function loadSettings(hubRoot: string): HubSettings {
  const f = settingsFile(hubRoot);
  if (!fs.existsSync(f)) return {};
  try {
    const v = JSON.parse(fs.readFileSync(f, 'utf8')) as HubSettings;
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    throw new Error(`settings.json 损坏: ${(e as Error).message}`);
  }
}

/** 读取某 agent 生效的配置根目录（自定义优先；不存在自定义或目录已消失时回退默认） */
export function resolveAgentHome(hubRoot: string, id: string): { home: string; source: 'custom' | 'default' } {
  const settings = loadSettings(hubRoot);
  const custom = settings.agentHome?.[id];
  if (custom && fs.existsSync(custom)) return { home: custom, source: 'custom' };
  return { home: defaultAgentHome(id), source: 'default' };
}

/** 保存/清除自定义定位；保存时要求目录存在 */
export function saveAgentHome(hubRoot: string, id: string, dir: string | null): string {
  if (!AGENT_IDS.includes(id as AgentId)) throw new Error(`未知 agent: ${id}`);
  const settings = loadSettings(hubRoot);
  settings.agentHome = { ...(settings.agentHome ?? {}) };
  if (dir === null) {
    delete settings.agentHome[id];
  } else {
    const abs = path.resolve(dir.trim());
    if (!fs.existsSync(abs)) throw new Error(`目录不存在: ${abs}`);
    if (!fs.statSync(abs).isDirectory()) throw new Error(`不是目录: ${abs}`);
    settings.agentHome[id] = abs;
  }
  if (Object.keys(settings.agentHome).length === 0) delete settings.agentHome;
  writeTextAtomic(settingsFile(hubRoot), JSON.stringify(settings, null, 2) + '\n');
  return dir === null ? '已清除自定义定位，恢复自动识别' : `已保存自定义定位: ${settings.agentHome?.[id] ?? ''}`;
}
