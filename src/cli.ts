#!/usr/bin/env node
/**
 * SkillHub CLI — 跨 AI agent 的 skill 同步中转台
 * 中心库（~/.skillhub）为源：add 预下载、sync 分发到各 agent、import 反向入库。
 */
import * as os from 'os';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Hub, resolveHubRoot, isValidSkillName, type HubSkill } from './hub';
import { AGENTS, agentById, findInstalledDir, listInstalled, type InstalledSkill } from './agents';
import { cloneRepo, describeScanBase, findSkillDirs, looksLikeUrl, parseRemoteTarget, validateGitUrl } from './remote';

const execFileP = promisify(execFile);
import { assertWithin, backupDir, confirm, cpSkipGit, hashDir, pickMany, SKILL_FILE } from './util';
import {
  McpStore,
  MCP_AGENTS,
  expandPlaceholders,
  isValidMcpName,
  loadSecrets,
  mcpAgentById,
  mcpStatus,
  normalizeEntry,
  transportFromType,
  validateMcpDef,
  type McpAgentAdapter,
  type McpDef,
} from './mcp';
import { disableSkill, enableSkill, listParked } from './park';
import { AGENT_IDS, resolveAgentHome, saveAgentHome } from './settings';
import {
  PluginStore,
  PLUGIN_AGENTS,
  isValidPluginId,
  parseMarketSource,
  parsePluginId,
  pluginAgentById,
  pluginStatus,
  type MarketSource,
  type PluginDef,
} from './plugins';

const VERSION = '0.1.0-beta';

const HELP = `SkillHub CLI（beta v${VERSION}）— 跨 AI agent 的 skill 同步中转台

用法: skillhub <命令> [参数]

命令:
  status                       总览：中心库 × 各 agent 的安装矩阵（skills + MCP），及各 agent 本地未入库的条目
  list                         列出中心库中的 skill
  add <GitHub链接|本地路径> [--all] [--force]
                               把 skill 下载/复制进中心库（预下载）
  sync <skill...> [--to <agent...>] [--all]
                               把中心库的 skill 安装/更新到指定 agent
  import <agent> [skill...] [--all]
                               把某 agent 已安装但未入库的 skill 收进中心库
  rm <skill...> [--from <agent...>] [--hub-only] [--yes]
                               从 agent 和/或中心库移除（移除前自动备份）
  disable <skill...> [--to <agent...>] [--all]
                               停用 agent 中的 skill（移入中心库暂存区 park，可随时恢复）
  enable <skill...> [--to <agent...>] [--all]
                               恢复被停用的 skill（从 park 移回原位）

  mcp list                     列出中心库中的 MCP server 定义
  mcp add <定义.json|->        把 MCP 定义加入中心库（JSON 文件或 stdin）
  mcp add <名称> --url <url> [--header K=V]... [--timeout-ms N]
                               快捷添加 http 型 MCP（stdio 用 --command/--arg/--env）
  mcp sync <名称...> [--to <agent...>] [--all]
                               把 MCP 定义写回各 agent 配置（写前备份整个配置文件）
  mcp import <agent> [名称...] [--all] [--include-disabled]
                               收编某 agent 已配置的 MCP server
  mcp rm <名称...> [--from <agent...>] [--hub-only] [--yes]
                               从 agent 配置和/或中心库移除 MCP 定义
  mcp disable <名称...> [--to <agent...>] [--all]
                               停用 MCP server（zcode/codex/workbuddy 写原生禁用字段；claude 撤下条目）
  mcp enable <名称...> [--to <agent...>] [--all]
                               重新启用 MCP server（claude 会顺带写入工具免确认授权）

  plugin market add <owner/repo|url>   注册插件市场到中心库
  plugin market list                   列出中心库的市场
  plugin list                          列出中心库的插件定义
  plugin add <name>@<marketplace> [--market <owner/repo|url>] [--version N] [--desc 描述]
                               登记插件定义（市场未注册时一并登记）
  plugin import <agent> [--all]
                               收编 agent 已装插件与其市场注册信息（自动剥离本机字段）
  plugin sync <id...> [--to <agent...>] [--all]
                               编排分发：注册市场 → 安装（claude 原生自动；zcode/workbuddy/codex 提示应用内装）→ 启用
  plugin enable/disable <id...> [--to <agent...>] [--all]
                               插件启停（zcode/claude/codex 有效；workbuddy 应用内管理）
  plugin rm <id...> [--yes]    删除中心库插件定义（不动各 agent 实体）

agent: zcode | claude | codex | workbuddy | doubao(实验，仅 skills)
MCP 密钥占位符: \${SKILLHUB_VAR:名称}，值放 ~/.skillhub/secrets.json，写回时展开为真实值

选项:
  --hub <路径>                 中心库位置（默认 ~/.skillhub，或环境变量 SKILLHUB_HOME）

示例:
  skillhub add https://github.com/user/repo/tree/main/skills/my-skill
  skillhub sync my-skill --to claude,codex
  skillhub mcp import-json '{"mcpServers":{"my-mcp":{"url":"https://mcp.example.com/mcp"}}}'
  skillhub mcp test my-mcp
  skillhub status`;

interface Parsed {
  positional: string[];
  flags: Map<string, string[]>;
}

function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  const push = (key: string, val: string) => {
    const list = flags.get(key) ?? [];
    list.push(...val.split(',').filter(Boolean));
    flags.set(key, list);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      let key = a.slice(2);
      let val: string;
      const eq = key.indexOf('=');
      if (eq >= 0) {
        val = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
        val = argv[++i];
      } else {
        val = '';
      }
      push(key, val);
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function flagList(flags: Map<string, string[]>, key: string): string[] {
  return flags.get(key) ?? [];
}

function flagBool(flags: Map<string, string[]>, key: string): boolean {
  return flags.has(key);
}

/** --json 模式下 stdout 只允许输出纯 JSON 供程序解析，人类可读进度一律改走 stderr */
function makeSay(json: boolean): (msg: string) => void {
  return json
    ? (msg) => console.error(msg)
    : (msg) => console.log(msg);
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flagBool(flags, 'version') || positional[0] === 'version') {
    console.log(`SkillHub v${VERSION}`);
    return;
  }
  const cmd = positional.shift();
  const hub = await Hub.open(resolveHubRoot(flagList(flags, 'hub')[0]));
  switch (cmd) {
    case 'status':
      return cmdStatus(hub, flags);
    case 'list':
      return cmdList(hub, flags);
    case 'add':
      return cmdAdd(hub, positional, flags);
    case 'sync':
      return cmdSync(hub, positional, flags);
    case 'import':
      return cmdImport(hub, positional, flags);
    case 'rm':
      return cmdRm(hub, positional, flags);
    case 'enable':
      return cmdToggleSkills(hub, positional, flags, false);
    case 'disable':
      return cmdToggleSkills(hub, positional, flags, true);
    case 'mcp':
      return cmdMcp(hub, positional, flags);
    case 'plugin':
      return cmdPlugin(hub, positional, flags);
    case 'detail':
      return cmdDetail(hub, positional, flags);
    case 'agent':
      return cmdAgent(hub, positional, flags);
    case 'seed':
      return cmdSeed(hub, positional, flags);
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return;
    default:
      console.error(`未知命令: ${cmd}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`\n错误: ${(e as Error)?.message ?? e}`);
  process.exit(1);
});

function sourceDesc(s: HubSkill['source']): string {
  if (s.type === 'github') {
    let d = s.url ?? 'github';
    if (s.ref) d += `@${s.ref}`;
    if (s.subpath) d += `:${s.subpath}`;
    return d;
  }
  if (s.type === 'agent') return `来自 ${s.from ?? 'agent'}`;
  return '本地路径';
}

async function cmdStatus(hub: Hub, flags: Map<string, string[]>): Promise<void> {
  const hubSkills = hub.list();
  const installed = new Map<string, Map<string, InstalledSkill>>();
  const agentInstalled = new Map<string, boolean>();
  for (const a of AGENTS) {
    agentInstalled.set(a.id, await a.installed().catch(() => false));
    const m = new Map<string, InstalledSkill>();
    for (const root of await a.skillsRoots()) {
      for (const s of await listInstalled(root)) m.set(s.name, s);
    }
    installed.set(a.id, m);
  }
  const mcp = await mcpStatus(await McpStore.open(hub.mcpDir));
  const parked = await listParked(hub.root);
  const plugins = await pluginStatus(await PluginStore.open(path.join(hub.root, 'plugins')));

  if (flagBool(flags, 'json')) {
    const skills = hubSkills.map((s) => ({
      name: s.name,
      description: s.description,
      hash: s.hash,
      source: s.source,
      addedAt: s.addedAt,
      agents: Object.fromEntries(
        AGENTS.map((a) => {
          if (parked.get(a.id)?.has(s.name)) return [a.id, 'disabled'];
          const inst = installed.get(a.id)?.get(s.name);
          return [a.id, !inst ? 'missing' : inst.hash === s.hash ? 'match' : 'diff'];
        }),
      ),
    }));
    const foreign = Object.fromEntries(
      AGENTS.map((a) => [
        a.id,
        [...installed.get(a.id)!.values()].filter((s) => !hub.has(s.name)).map((s) => s.name),
      ]),
    );
    console.log(
      JSON.stringify(
        {
          hub: { root: hub.root, count: hubSkills.length },
          agents: AGENTS.map((a) => ({ id: a.id, label: a.label, installed: agentInstalled.get(a.id) === true })),
          skills,
          foreign,
          mcp,
          plugins,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`中心库: ${hub.root}（${hubSkills.length} 个 skill）\n`);
  if (hubSkills.length > 0) {
    const shown = AGENTS.filter((a) => agentInstalled.get(a.id) === true);
    if (shown.length === 0) {
      console.log('（未检测到已安装的 agent，安装后在矩阵中展示）');
    } else {
      const nameW = Math.min(28, Math.max(10, ...hubSkills.map((s) => s.name.length)));
      const idW = Math.max(...shown.map((a) => a.id.length)) + 2;
      let header = 'skill'.padEnd(nameW);
      for (const a of shown) header += a.id.padEnd(idW);
      console.log(header);
      for (const s of hubSkills) {
        let row = s.name.slice(0, 28).padEnd(nameW);
        for (const a of shown) {
          const inst = installed.get(a.id)?.get(s.name);
          const cell = parked.get(a.id)?.has(s.name) ? '○' : !inst ? '·' : inst.hash === s.hash ? '✓' : '≈';
          row += (cell + (a.experimental ? '?' : '')).padEnd(idW);
        }
        console.log(row);
      }
      const hidden = AGENTS.filter((a) => agentInstalled.get(a.id) !== true).map((a) => a.id);
      console.log('图例: ✓ 一致  ≈ 内容不同  · 未安装  ○ 已禁用（暂存于中心库 park 区）  带?=实验性 agent');
      if (hidden.length > 0) console.log(`未安装的 agent（已隐藏）: ${hidden.join('、')}`);
    }
  } else {
    console.log('（中心库为空，用 add 或 import 收入 skill）');
  }

  const foreign: string[] = [];
  for (const a of AGENTS) {
    const names = [...installed.get(a.id)!.values()].filter((s) => !hub.has(s.name)).map((s) => s.name);
    if (names.length > 0) foreign.push(`  ${a.id}: ${names.join('、')}`);
  }
  if (foreign.length > 0) {
    console.log('\n各 agent 本地未入库的 skill（可用 import 收编）:');
    console.log(foreign.join('\n'));
  }

  if (mcp.servers.length > 0 || Object.values(mcp.foreign).some((v) => v.length > 0)) {
    console.log(`\nMCP server（${mcp.servers.length} 个，豆包不支持）`);
    if (mcp.servers.length > 0) {
      const nameW = Math.min(28, Math.max(8, ...mcp.servers.map((s) => s.name.length)));
      const idW = Math.max(...mcp.agents.map((a) => a.id.length)) + 2;
      let header = 'mcp'.padEnd(nameW);
      for (const a of mcp.agents) header += a.id.padEnd(idW);
      console.log(header);
      const CELL: Record<string, string> = { match: '✓', diff: '≈', missing: '·', disabled: '○' };
      for (const s of mcp.servers) {
        let row = s.name.slice(0, 28).padEnd(nameW);
        for (const a of mcp.agents) row += (CELL[s.agents[a.id] ?? 'missing'] ?? '?').padEnd(idW);
        console.log(row);
      }
      console.log('图例: ✓ 一致  ≈ 配置不同  · 未安装  ○ 已安装但被禁用');
    }
    const mcpForeign: string[] = [];
    for (const a of mcp.agents) {
      if (mcp.foreign[a.id]?.length) mcpForeign.push(`  ${a.id}: ${mcp.foreign[a.id].join('、')}`);
    }
    if (mcpForeign.length > 0) {
      console.log('各 agent 本地未入库的 MCP（可用 mcp import 收编）:');
      console.log(mcpForeign.join('\n'));
    }
  }

  if (plugins.plugins.length > 0 || Object.values(plugins.foreign).some((v) => v.length > 0)) {
    console.log(`\n插件（${plugins.plugins.length} 个；claude 全自动安装，其余按 agent 能力半自动）`);
    if (plugins.plugins.length > 0) {
      const idW = Math.min(44, Math.max(12, ...plugins.plugins.map((p) => p.id.length)));
      const agentW = Math.max(...plugins.agents.map((a) => a.id.length)) + 2;
      let header = 'plugin'.padEnd(idW);
      for (const a of plugins.agents) header += a.id.padEnd(agentW);
      console.log(header);
      const CELL: Record<string, string> = { match: '✓', disabled: '○', pending: '◌', missing: '·' };
      for (const p of plugins.plugins) {
        let row = p.id.slice(0, 44).padEnd(idW);
        for (const a of plugins.agents) row += (CELL[p.agents[a.id] ?? 'missing'] ?? '?').padEnd(agentW);
        console.log(row);
      }
      console.log('图例: ✓ 已装并启用  ○ 已禁用  ◌ 期望已同步待应用内安装  · 未安装');
    }
    const pf: string[] = [];
    for (const a of plugins.agents) {
      if (plugins.foreign[a.id]?.length) pf.push(`  ${a.id}: ${plugins.foreign[a.id].join('、')}`);
    }
    if (pf.length > 0) {
      console.log('各 agent 本地未入库的插件（可用 plugin import 收编）:');
      console.log(pf.join('\n'));
    }
  }
}

async function cmdList(hub: Hub, flags: Map<string, string[]>): Promise<void> {
  const skills = hub.list();
  if (flagBool(flags, 'json')) {
    console.log(JSON.stringify(skills, null, 2));
    return;
  }
  if (skills.length === 0) {
    console.log('中心库为空。用法: skillhub add <GitHub链接|本地路径>');
    return;
  }
  for (const s of skills) {
    const desc = s.description.replace(/\s+/g, ' ').slice(0, 60);
    console.log(`${s.name}\n    ${desc}${s.description.length > 60 ? '…' : ''}\n    来源: ${sourceDesc(s.source)}  入库: ${s.addedAt.slice(0, 10)}`);
  }
  console.log(`\n共 ${skills.length} 个 skill。`);
}

async function cmdAdd(hub: Hub, positional: string[], flags: Map<string, string[]>): Promise<void> {
  if (positional.length === 0) throw new Error('用法: skillhub add <GitHub链接|本地路径> [--all] [--force]');
  const all = flagBool(flags, 'all');
  const force = flagBool(flags, 'force');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  const results: { ok: boolean; name: string; message: string }[] = [];
  let added = 0;
  let conflicted = 0;

  const addPicked = async (dirs: string[] | null, source: HubSkill['source'], scanBase: string): Promise<void> => {
    if (dirs === null || dirs.length === 0) {
      const hint = await describeScanBase(scanBase === '.' ? process.cwd() : scanBase);
      throw new Error(
        `没有找到 SKILL.md（已从该位置向下最多扫描 4 层）。请确认：\n` +
          `  ① 链接或文件夹确实包含 skill——skill 目录必须有 SKILL.md（YAML 头含 name/description）；\n` +
          `  ② 若 skill 在更深的子目录，请复制该 skill 子目录的完整链接；\n` +
          `  ③ 也可以先把仓库下载/解压到本地，再导入本地文件夹或 zip。\n` +
          (hint ? `  参考——${hint}` : ''),
      );
    }
    let picked = dirs;
    if (dirs.length > 1 && !all) {
      if (!process.stdin.isTTY) {
        console.error(`发现 ${dirs.length} 个 skill，请改用: 具体子路径链接 / --all / 交互终端:`);
        for (const d of dirs) console.error(`  ${d}`);
        process.exitCode = 1;
        return;
      }
      const ids = await pickMany(`发现 ${dirs.length} 个 skill，选择要入库的:`, dirs.map((d) => ({ id: d, label: path.basename(d) })));
      picked = dirs.filter((d) => ids.includes(d));
    }
    for (const d of picked) {
      const r = await hub.addFromDir(d, source, { force });
      results.push(r);
      if (r.ok) {
        added++;
        say(`✓ ${r.name} ${r.message}`);
      } else {
        conflicted++;
        say(`✗ ${r.name}: ${r.message}`);
      }
    }
  };

  for (const arg of positional) {
    if (looksLikeUrl(arg)) {
      await validateGitUrl(arg);
      const target = parseRemoteTarget(arg);
      say(`克隆 ${target.repoUrl}${target.ref ? `@${target.ref}` : ''} ...`);
      const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'skillhub-'));
      try {
        await cloneRepo(target, tmp);
        // 入库复制必须在临时目录清理前完成
        await addPicked(await findSkillDirs(tmp, target.subpath), {
          type: 'github',
          url: target.repoUrl,
          ref: target.ref,
          subpath: target.subpath,
        }, target.subpath ? path.join(tmp, ...target.subpath.split('/')) : tmp);
      } finally {
        await fsp.rm(tmp, { recursive: true, force: true });
      }
    } else {
      const p = path.resolve(arg);
      if (!fs.existsSync(p)) throw new Error(`路径不存在: ${p}`);
      if (fs.statSync(p).isFile() && /\.zip$/i.test(p)) {
        // zip 直接导入：Windows 自带 tar（bsdtar）解压到临时目录后按同一规则扫描
        say(`解压 zip ...`);
        const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'skillhub-zip-'));
        try {
          try {
            // 用 System32 的 bsdtar（支持 zip 且不会把 C:\ 盘符误解为远程主机；PATH 里的 GNU tar 会）
            const tarPath = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
            await execFileP(tarPath, ['-xf', p, '-C', tmp], { timeout: 120_000, windowsHide: true });
          } catch (e) {
            throw new Error(`zip 解压失败（${(e as Error).message}）。可先手动解压，再导入解压后的文件夹`);
          }
          await addPicked(await findSkillDirs(tmp), { type: 'local' }, tmp);
        } finally {
          await fsp.rm(tmp, { recursive: true, force: true });
        }
      } else {
        await addPicked(await findSkillDirs(p), { type: 'local' }, p);
      }
    }
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
  say(`\n完成: 入库 ${added} 个${conflicted ? `，跳过/冲突 ${conflicted} 个` : ''}。用 skillhub sync <名称> 分发到 agent。`);
}

async function selectTargets(flags: Map<string, string[]>) {
  const to = flagList(flags, 'to');
  if (flagBool(flags, 'all')) {
    // 只同步已安装的 agent：未安装的不创建任何目录/文件（安装后会自动被检测到）
    const out = [];
    for (const a of AGENTS.filter((x) => !x.experimental)) {
      if (await a.installed()) out.push(a);
    }
    return out;
  }
  if (to.length > 0) {
    const out = [];
    for (const id of to) {
      const a = agentById(id);
      if (!a) throw new Error(`未知 agent: ${id}（可选: ${AGENTS.map((x) => x.id).join(', ')}）`);
      if (!(await a.installed())) throw new Error(`未检测到 ${id} 的安装（主配置目录不存在），不为其创建任何目录`);
      out.push(a);
    }
    return out;
  }
  const available: typeof AGENTS = [];
  for (const a of AGENTS) {
    if (await a.installed()) available.push(a);
  }
  if (available.length === 0) throw new Error('未检测到任何已安装的 agent');
  const ids = await pickMany('同步到哪些 agent:', available.map((a) => ({ id: a.id, label: a.experimental ? `${a.id}（实验）` : a.id })));
  return available.filter((a) => ids.includes(a.id));
}

async function cmdSync(hub: Hub, positional: string[], flags: Map<string, string[]>): Promise<void> {
  if (positional.length === 0) throw new Error('用法: skillhub sync <skill...> [--to <agent...>] [--all]');
  const names = positional.filter((n) => hub.has(n) && isValidSkillName(n));
  const missing = positional.filter((n) => !(hub.has(n) && isValidSkillName(n)));
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  if (missing.length > 0) say(`✗ 不在中心库中（先 add/import）: ${missing.join('、')}`);
  if (names.length === 0) return;

  const results: { agent: string; skill: string; action: string; backup?: string }[] = [];
  const targets = await selectTargets(flags);
  for (const a of targets) {
    const roots = await a.ensureRoots();
    if (roots.length === 0) {
      for (const name of names) results.push({ agent: a.id, skill: name, action: 'agent-missing' });
      say(`[${a.id}] 未找到可用目录，跳过${a.note ? `（${a.note}）` : ''}`);
      continue;
    }
    for (const root of roots) {
      for (const name of names) {
        const src = hub.skillPath(name);
        const dest = assertWithin(root, name);
        const existing = await findInstalledDir(a, name);
        if (existing && path.basename(existing) !== name) {
          results.push({ agent: a.id, skill: name, action: 'skipped' });
          say(`⚠ [${a.id}] ${name} 已存在为目录 ${path.basename(existing)}（目录名与 skill 名不一致），请手工处理，跳过`);
          continue;
        }
        if (fs.existsSync(dest)) {
          if ((await hashDir(dest)) === (await hashDir(src))) {
            results.push({ agent: a.id, skill: name, action: 'current' });
            say(`[${a.id}] ${name} 已是最新`);
            continue;
          }
          const bak = await backupDir(dest, hub.backupsDir, a.id, name);
          await fsp.rm(dest, { recursive: true, force: true });
          await fsp.cp(src, dest, { recursive: true, filter: cpSkipGit });
          results.push({ agent: a.id, skill: name, action: 'updated', backup: bak });
          say(`[${a.id}] ${name} 已更新（旧版备份: ${bak}）`);
        } else {
          await fsp.cp(src, dest, { recursive: true, filter: cpSkipGit });
          results.push({ agent: a.id, skill: name, action: 'installed' });
          say(`[${a.id}] ${name} 已安装`);
        }
      }
    }
    if (a.experimental) say(`⚠ [${a.id}] ${a.note}`);
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

async function cmdImport(hub: Hub, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const agentId = positional.shift();
  if (!agentId) throw new Error('用法: skillhub import <agent> [skill...] [--all]');
  const agent = agentById(agentId);
  if (!agent) throw new Error(`未知 agent: ${agentId}（可选: ${AGENTS.map((x) => x.id).join(', ')}）`);

  const installed = new Map<string, InstalledSkill>();
  for (const root of await agent.skillsRoots()) {
    for (const s of await listInstalled(root)) installed.set(s.name, s);
  }
  const force = flagBool(flags, 'force');
  const all = flagBool(flags, 'all');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  const wanted = positional;
  const foreign = [...installed.values()].filter((s) => !hub.has(s.name));

  let chosen: InstalledSkill[];
  if (all) {
    chosen = foreign;
  } else if (wanted.length > 0) {
    chosen = [];
    for (const n of wanted) {
      const s = installed.get(n);
      if (!s) say(`✗ ${agentId} 中没有名为 ${n} 的 skill`);
      else if (hub.has(n)) say(`- ${n} 已在库中，跳过（--force 可覆盖）`);
      else chosen.push(s);
    }
  } else if (foreign.length === 0) {
    say(`${agentId} 中没有未入库的 skill。`);
    return;
  } else {
    const ids = await pickMany(`选择要收入中心库的 skill（${agentId}）:`, foreign.map((s) => ({ id: s.name, label: s.name })));
    chosen = foreign.filter((s) => ids.includes(s.name));
  }
  if (chosen.length === 0) return;

  const results: { ok: boolean; name: string; message: string }[] = [];
  for (const s of chosen) {
    const r = await hub.addFromDir(s.dir, { type: 'agent', from: agent.id }, { force });
    results.push(r);
    say(`${r.ok ? '✓' : '✗'} ${r.name} ${r.message}`);
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

async function cmdRm(hub: Hub, positional: string[], flags: Map<string, string[]>): Promise<void> {
  if (positional.length === 0) throw new Error('用法: skillhub rm <skill...> [--from <agent...>] [--hub-only] [--yes]');
  const from = flagList(flags, 'from');
  const hubOnly = flagBool(flags, 'hub-only');
  const yes = flagBool(flags, 'yes');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);

  const plan: { name: string; agent?: string; dir: string }[] = [];
  for (const name of positional) {
    if (!isValidSkillName(name)) {
      say(`- ${name} 不是合法 skill 名，跳过`);
      continue;
    }
    if (hubOnly) {
      if (hub.has(name)) plan.push({ name, dir: hub.skillPath(name) });
      else say(`- ${name} 不在中心库中`);
      continue;
    }
    const agentCandidates = from.length > 0 ? from.map((id) => agentById(id)).filter(Boolean) : AGENTS;
    for (const a of agentCandidates) {
      const dir = await findInstalledDir(a!, name);
      if (dir) plan.push({ name, agent: a!.id, dir });
    }
    // --from 用于收窄 agent 范围；只有未指定 --from 时才连同中心库一起删
    if (from.length === 0 && hub.has(name)) plan.push({ name, dir: hub.skillPath(name) });
    if (!plan.some((p) => p.name === name)) say(`- ${name} 未在中心库或各 agent 中找到`);
  }
  if (plan.length === 0) return;

  say('将删除以下位置（删除前自动备份）:');
  for (const p of plan) say(`  ${p.agent ? `[${p.agent}] ` : '[hub] '}${p.dir}`);
  if (!yes) {
    if (!(await confirm('确认删除?'))) {
      say('已取消。');
      return;
    }
  }

  const results: { target: string; skill: string; action: string; backup?: string }[] = [];
  for (const p of plan) {
    if (p.agent) {
      const bak = await backupDir(p.dir, hub.backupsDir, p.agent, p.name);
      await fsp.rm(p.dir, { recursive: true, force: true });
      results.push({ target: p.agent, skill: p.name, action: 'removed', backup: bak });
      say(`✓ [${p.agent}] ${p.name} 已移除（备份: ${bak}）`);
    } else {
      const bak = await hub.removeFromHub(p.name);
      results.push({ target: 'hub', skill: p.name, action: 'removed', backup: bak || undefined });
      say(`✓ [hub] ${p.name} 已移除${bak ? `（备份: ${bak}）` : ''}`);
    }
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

// ---------- skills 停用/恢复（park 暂存区） ----------

async function cmdToggleSkills(hub: Hub, positional: string[], flags: Map<string, string[]>, disable: boolean): Promise<void> {
  const verb = disable ? 'disable' : 'enable';
  if (positional.length === 0) throw new Error(`用法: skillhub ${verb} <skill...> [--to <agent...>] [--all]`);
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  const names = positional.filter((n) => hub.has(n) && isValidSkillName(n));
  const missing = positional.filter((n) => !(hub.has(n) && isValidSkillName(n)));
  if (missing.length > 0) say(`✗ 不在中心库中: ${missing.join('、')}`);
  if (names.length === 0) return;

  const targets = await selectTargets(flags);
  const results: { agent: string; skill: string; action: string; message: string }[] = [];
  for (const a of targets) {
    for (const name of names) {
      try {
        const r = disable ? await disableSkill(hub.root, a, name) : await enableSkill(hub.root, a, name);
        results.push({ agent: a.id, skill: name, action: r.ok ? (disable ? 'disabled' : 'enabled') : 'error', message: r.message });
        say(`${r.ok ? '✓' : '✗'} ${r.message}`);
      } catch (e) {
        results.push({ agent: a.id, skill: name, action: 'error', message: (e as Error).message });
        say(`✗ [${a.id}] ${name}: ${(e as Error).message}`);
      }
    }
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

// ---------- detail 命令：详情浮层的数据源（skill 读 SKILL.md 正文节选；mcp 全字段脱敏） ----------

async function cmdDetail(hub: Hub, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const kind = positional.shift();
  const name = positional.shift();
  if ((kind !== 'skill' && kind !== 'mcp') || !name) {
    throw new Error('用法: skillhub detail skill|mcp <名称> --json');
  }
  const json = flagBool(flags, 'json');
  if (!json) {
    // 详情供程序消费，无人类可读形态
    console.log('该命令仅支持 --json 输出');
    return;
  }

  if (kind === 'skill') {
    if (!hub.has(name)) throw new Error(`不在中心库中: ${name}`);
    const dir = hub.skillPath(name);
    const file = path.join(dir, 'SKILL.md');
    const text = await fsp.readFile(file, 'utf8');
    const body = text
      .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
      .trim()
      .slice(0, 2500);
    const parked = await listParked(hub.root);
    const agents: Record<string, string> = {};
    for (const a of AGENTS) {
      if (parked.get(a.id)?.has(name)) {
        agents[a.id] = 'disabled';
        continue;
      }
      const dir2 = await findInstalledDir(a, name);
      agents[a.id] = !dir2 ? 'missing' : (await hashDir(dir2)) === (await hashDir(hub.skillPath(name))) ? 'match' : 'diff';
    }
    const s = hub.get(name)!;
    console.log(JSON.stringify({ kind, name, description: s.description, body, source: s.source, addedAt: s.addedAt, agents }, null, 2));
    return;
  }

  const store = await McpStore.open(hub.mcpDir);
  const def = await store.get(name);
  if (!def) throw new Error(`不在中心库中: ${name}`);
  const status = await mcpStatus(store);
  const agents = status.servers.find((x) => x.name === name)?.agents ?? {};
  // 脱敏：headers/env 只输出键名；占位符定义本身不含真实值，保留展示
  console.log(
    JSON.stringify(
      {
        kind,
        name,
        transport: def.transport,
        url: def.url,
        command: def.command,
        args: def.args,
        timeoutMs: def.timeoutMs,
        headerKeys: Object.keys(def.headers ?? {}),
        envKeys: Object.keys(def.env ?? {}),
        description: def.description,
        addedAt: def.addedAt,
        agents,
      },
      null,
      2,
    ),
  );
}

// ---------- agent 命令组：识别状态与手动定位 ----------

async function cmdAgent(hub: Hub, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const sub = positional.shift();
  if (sub === 'list') {
    const rows = [];
    for (const id of AGENT_IDS) {
      const r = resolveAgentHome(hub.root, id);
      const a = agentById(id);
      rows.push({
        id,
        label: a?.label ?? id,
        installed: r.source === 'custom' ? true : await (a?.installed() ?? false),
        home: r.home,
        homeSource: r.source,
      });
    }
    if (flagBool(flags, 'json')) console.log(JSON.stringify({ agents: rows }, null, 2));
    else {
      for (const r of rows) {
        console.log(`${r.installed ? '✓' : '·'} ${r.id.padEnd(11)} ${r.installed ? '已识别' : '未识别'}  ${r.home}${r.homeSource === 'custom' ? '  （自定义）' : ''}`);
      }
    }
    return;
  }
  if (sub === 'locate') {
    const id = positional.shift();
    if (!id) throw new Error('用法: agent locate <agent> <目录路径> | agent locate <agent> --clear');
    const clear = flagBool(flags, 'clear');
    const dir = clear ? null : positional[0];
    if (!clear && !dir) throw new Error('用法: agent locate <agent> <目录路径>（或 --clear 恢复自动识别）');
    const msg = saveAgentHome(hub.root, id, dir);
    const say = makeSay(flagBool(flags, 'json'));
    say(msg);
    if (flagBool(flags, 'json')) console.log(JSON.stringify({ results: [{ ok: true, name: id, message: msg }] }, null, 2));
    return;
  }
  console.log('用法:\n  agent list [--json]\n  agent locate <agent> <目录路径> [--json]\n  agent locate <agent> --clear');
}

/** mcp import-json：粘贴的 MCP 定义作为 positional 传入（不受 flag 逗号分割影响），批量入库 */
async function mcpCmdImportJson(store: McpStore, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const payload = positional[0];
  if (!payload) throw new Error('用法: mcp import-json <配置JSON> [--force] [--json]');
  const force = flagBool(flags, 'force');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  const results: { ok: boolean; name: string; message: string }[] = [];
  try {
    await importMcpDefsFromJson(store, payload, force, results);
  } catch (e) {
    results.push({ ok: false, name: '(解析)', message: (e as Error).message });
  }
  for (const r of results) say(`${r.ok ? '✓' : r.message.includes('已存在') ? '-' : '✗'} ${r.name} ${r.message}`);
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

// ---------- mcp 连通性测试 ----------

const MCP_INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'skillhub', version: '0.1.0' },
  },
};

interface McpTestResult {
  ok: boolean;
  message: string;
  server?: { name?: string; version?: string; instructions?: string };
}

/** http/sse 型握手：POST initialize，服务返回 result.serverInfo 视为连通 */
async function testHttpMcp(def: McpDef): Promise<McpTestResult> {
  // 协议校验（防 file: 等非常规协议）；默认拒绝内网地址，--allow-private 显式放开内网/本地服务
  const u = new URL(def.url ?? '');
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`仅支持 http/https: ${def.url}`);
  const host = u.hostname;
  const isPrivate =
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.local') ||
    host === '[::1]';
  if (isPrivate && !mcpTestAllowPrivate) throw new Error(`目标为内网/本机地址（${host}）：如确属本地 MCP 服务，请用 --allow-private 重试`);
  const resp = await fetch(def.url ?? '', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(def.headers ?? {}),
    },
    body: JSON.stringify(MCP_INITIALIZE),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await resp.text();
  if (!resp.ok) return { ok: false, message: `服务响应 ${resp.status} ${resp.statusText}${text ? `：${text.slice(0, 160)}` : ''}` };
  // Streamable HTTP 可能返回 SSE 帧（data: {...}），提取 JSON
  const jsonText = text.startsWith('{') ? text : (text.match(/data:\s*({.*})/)?.[1] ?? text);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(jsonText);
  } catch {
    return { ok: false, message: `服务响应 ${resp.status}，但返回内容不是 JSON-RPC（前 120 字符：${text.slice(0, 120)}）` };
  }
  if (body.error) return { ok: false, message: `服务拒绝了握手：${JSON.stringify(body.error).slice(0, 160)}` };
  const result = body.result as Record<string, unknown> | undefined;
  const info = result?.serverInfo as Record<string, unknown> | undefined;
  const instructions = typeof result?.instructions === 'string' ? result.instructions : undefined;
  if (!info) return { ok: true, message: `✓ 服务响应 ${resp.status}（未返回 serverInfo，可能不完整支持 MCP 协议）` };
  return {
    ok: true,
    message: `✓ 连通！服务：${String(info.name ?? '?')}${info.version ? ` v${String(info.version)}` : ''}`,
    server: { name: info.name ? String(info.name) : undefined, version: info.version ? String(info.version) : undefined, instructions },
  };
}

/** stdio 型握手：spawn 进程，stdin 写 initialize，从 stdout 读响应。
 *  Windows 下必须 shell:true——npx/uvx 等是 .cmd shim，shell:false 直接 ENOENT；
 *  命令与参数来自用户自己的 MCP 配置（本机执行本就是该配置的意图），风险与用户在终端手跑一致。 */
async function testStdioMcp(def: McpDef): Promise<McpTestResult> {
  const { spawn } = await import('child_process');
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(def.command ?? '', def.args ?? [], { windowsHide: true, shell: process.platform === 'win32' });
    } catch (e) {
      resolve({ ok: false, message: `无法启动 ${def.command}: ${(e as Error).message}` });
      return;
    }
    let out = '';
    let done = false;
    const finish = (msg: McpTestResult) => {
      if (done) return;
      done = true;
      child.kill();
      resolve(msg);
    };
    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString();
      const line = out.split('\n').find((l) => l.trim().startsWith('{'));
      if (!line) return;
      try {
        const body = JSON.parse(line);
        const info = body?.result?.serverInfo;
        const instructions = typeof body?.result?.instructions === 'string' ? body.result.instructions : undefined;
        if (info) {
          finish({
            ok: true,
            message: `✓ 连通！服务：${String(info.name ?? '?')}${info.version ? ` v${String(info.version)}` : ''}`,
            server: { name: info.name ? String(info.name) : undefined, version: info.version ? String(info.version) : undefined, instructions },
          });
        } else if (body.error) finish({ ok: false, message: `服务拒绝了握手：${JSON.stringify(body.error).slice(0, 160)}` });
      } catch {
        // 未完整 JSON，继续等
      }
    });
    child.on('error', (e: Error) => finish({ ok: false, message: `无法启动 ${def.command}: ${e.message}` }));
    child.on('exit', (code: number | null) => finish({ ok: false, message: `进程提前退出（code ${code ?? '?'}）${out ? `，输出：${out.slice(0, 120)}` : ''}` }));
    try {
      child.stdin?.write(JSON.stringify(MCP_INITIALIZE) + '\n');
    } catch {
      // stdin 关闭等
    }
    setTimeout(() => finish({ ok: false, message: `15 秒内未收到握手响应${out ? `，已有输出：${out.slice(0, 120)}` : '，也无任何输出'}` }), 15_000);
  });
}

let mcpTestAllowPrivate = false;

async function mcpCmdTest(hub: Hub, store: McpStore, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const name = positional[0];
  if (!name) throw new Error('用法: mcp test <名称> [--allow-private] [--json]');
  const def = await store.get(name);
  if (!def) throw new Error(`不在中心库中: ${name}`);
  mcpTestAllowPrivate = flagBool(flags, 'allow-private');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  const secrets = loadSecrets(hub.root);
  let r: McpTestResult;
  try {
    const expanded = expandPlaceholders(def, secrets);
    r = def.transport === 'stdio' ? await testStdioMcp(expanded) : await testHttpMcp(expanded);
  } catch (e) {
    r = { ok: false, message: `✗ 测试失败：${(e as Error).message}` };
  }
  say(`${r.ok ? '✓' : '✗'} [${name}] ${r.message}`);
  if (json) console.log(JSON.stringify({ results: [{ name, ok: r.ok, message: r.message, server: r.server }] }, null, 2));
}

// ---------- seed：安装包预填 skill（幂等，已存在跳过） ----------

async function cmdSeed(hub: Hub, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  const dir = flagList(flags, 'dir')[0];
  if (!dir) throw new Error('用法: skillhub seed --dir <seed目录>（内含 skill 子目录） [--json]');
  if (!fs.existsSync(dir)) throw new Error(`seed 目录不存在: ${dir}`);
  const results: { ok: boolean; name: string; message: string }[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    const r = await hub.addFromDir(full, { type: 'local' }, {});
    results.push(r);
    say(`${r.ok ? '✓' : '-'} ${r.name} ${r.message}`);
  }
  say(`预填完成。`);
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

// ---------- mcp 命令组 ----------

const MCP_HELP = `用法:
  mcp list
  mcp add <定义.json|-> [--force]                    JSON 文件或 stdin（字段: name/transport/command/args/env/url/headers/timeoutMs/description）
  mcp add <名称> --url <url> [--header K=V]... [--timeout-ms N] [--desc 描述]
  mcp add <名称> --command <命令> [--arg 值]... [--env K=V]... [--desc 描述]
  mcp sync <名称...> [--to <agent...>] [--all]
  mcp import <agent> [名称...] [--all] [--force] [--include-disabled]
  mcp import-json <配置JSON> [--force]     粘贴 {mcpServers:{…}} / 单个定义 / 定义数组，批量入库
  mcp test <名称> [--allow-private]        连通性测试（initialize 握手，--allow-private 放开内网/本地服务）
  mcp rm <名称...> [--from <agent...>] [--hub-only] [--yes]
  mcp disable <名称...> [--to <agent...>] [--all]
  mcp enable <名称...> [--to <agent...>] [--all]
MCP agent: zcode | claude | codex | workbuddy（豆包无本地 MCP 配置，不支持）`;

function parseKvList(list: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of list) {
    const eq = item.indexOf('=');
    if (eq <= 0) throw new Error(`K=V 格式错误: ${item}`);
    out[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return out;
}

async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function cmdMcp(hub: Hub, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const sub = positional.shift();
  const store = await McpStore.open(hub.mcpDir);
  switch (sub) {
    case 'list':
      return mcpCmdList(store, flags);
    case 'add':
      return mcpCmdAdd(store, positional, flags);
    case 'sync':
      return mcpCmdSync(hub, store, positional, flags);
    case 'import':
      return mcpCmdImport(store, positional, flags);
    case 'import-json':
      return mcpCmdImportJson(store, positional, flags);
    case 'test':
      return mcpCmdTest(hub, store, positional, flags);
    case 'rm':
      return mcpCmdRm(hub, store, positional, flags);
    case 'enable':
      return mcpCmdToggle(hub, store, positional, flags, false);
    case 'disable':
      return mcpCmdToggle(hub, store, positional, flags, true);
    case undefined:
    case 'help':
      console.log(MCP_HELP);
      return;
    default:
      console.error(`未知 mcp 子命令: ${sub}\n`);
      console.log(MCP_HELP);
      process.exitCode = 1;
  }
}

async function mcpCmdList(store: McpStore, flags: Map<string, string[]>): Promise<void> {
  const defs = await store.list();
  if (flagBool(flags, 'json')) {
    console.log(JSON.stringify({ servers: defs }, null, 2));
    return;
  }
  if (defs.length === 0) {
    console.log('中心库没有 MCP 定义。用法: mcp add / mcp import');
    return;
  }
  for (const d of defs) {
    const target = d.transport === 'stdio' ? `${d.command} ${(d.args ?? []).join(' ')}` : d.url;
    console.log(`${d.name}  [${d.transport}] ${target ?? ''}`);
    if (d.description) console.log(`    ${d.description.replace(/\s+/g, ' ').slice(0, 80)}`);
  }
  console.log(`\n共 ${defs.length} 个 MCP server。用 mcp sync <名称> 分发到 agent。`);
}

async function mcpCmdAdd(store: McpStore, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const force = flagBool(flags, 'force');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);

  const arg0 = positional[0];
  if (!arg0) throw new Error(MCP_HELP);

  let def: McpDef;
  if (arg0 === '-' || /\.json$/i.test(arg0)) {
    const text = arg0 === '-' ? await readStdinAll() : await fsp.readFile(path.resolve(arg0), 'utf8');
    def = JSON.parse(text) as McpDef;
  } else {
    def = { name: arg0, transport: 'stdio', addedAt: '' };
    const url = flagList(flags, 'url')[0];
    const command = flagList(flags, 'command')[0];
    if (url) {
      def.transport = 'http';
      def.url = url;
    } else if (command) {
      def.transport = 'stdio';
      def.command = command;
    } else {
      throw new Error('快捷添加必须给 --url 或 --command 之一（复杂配置请用 JSON 文件）');
    }
    const args = flagList(flags, 'arg');
    if (args.length) def.args = args;
    const header = flagList(flags, 'header');
    if (header.length) def.headers = parseKvList(header);
    const env = flagList(flags, 'env');
    if (env.length) def.env = parseKvList(env);
    const timeout = flagList(flags, 'timeout-ms')[0];
    if (timeout) def.timeoutMs = parseInt(timeout, 10);
    const desc = flagList(flags, 'desc')[0];
    if (desc) def.description = desc;
  }

  const errs = validateMcpDef(def);
  if (errs.length > 0) throw new Error(`MCP 定义不合法:\n  ${errs.join('\n  ')}`);
  if ((await store.get(def.name)) && !force) {
    throw new Error(`中心库已有同名 MCP 定义: ${def.name}（--force 可覆盖）`);
  }
  def.addedAt = new Date().toISOString();
  def.source = { type: 'manual' };
  await store.save(def);
  const placeholderHit = /SKILLHUB_VAR:/.test(JSON.stringify(def));
  say(`✓ [hub] ${def.name} 已入库`);
  if (placeholderHit) say(`  含密钥占位符，确认 ~/.skillhub/secrets.json 提供了对应值`);
  if (json) console.log(JSON.stringify({ results: [{ ok: true, name: def.name, message: '已入库' }] }, null, 2));
}

async function mcpSelectTargets(flags: Map<string, string[]>): Promise<McpAgentAdapter[]> {
  const to = flagList(flags, 'to');
  if (flagBool(flags, 'all')) {
    const out: McpAgentAdapter[] = [];
    for (const a of MCP_AGENTS) {
      if (await a.installed()) out.push(a);
    }
    return out;
  }
  if (to.length > 0) {
    const out: McpAgentAdapter[] = [];
    for (const id of to) {
      const a = mcpAgentById(id);
      if (!a) throw new Error(`未知 MCP agent: ${id}（可选: ${MCP_AGENTS.map((x) => x.id).join(', ')}；豆包无本地 MCP 配置）`);
      if (!(await a.installed())) throw new Error(`未检测到 ${id} 的安装（主配置目录不存在），不为其写任何配置`);
      out.push(a);
    }
    return out;
  }
  const available: McpAgentAdapter[] = [];
  for (const a of MCP_AGENTS) {
    if (await a.installed()) available.push(a);
  }
  if (available.length === 0) throw new Error('未检测到任何已安装的 MCP agent');
  const ids = await pickMany('同步 MCP 到哪些 agent:', available.map((a) => ({ id: a.id, label: a.label })));
  return available.filter((a) => ids.includes(a.id));
}

async function mcpCmdSync(hub: Hub, store: McpStore, positional: string[], flags: Map<string, string[]>): Promise<void> {
  if (positional.length === 0) throw new Error('用法: mcp sync <名称...> [--to <agent...>] [--all]');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  const secrets = loadSecrets(hub.root);

  const defs: McpDef[] = [];
  for (const n of positional) {
    const d = await store.get(n);
    if (!d) say(`✗ 不在中心库中（先 mcp add/import）: ${n}`);
    else defs.push(d);
  }
  if (defs.length === 0) return;

  const targets = await mcpSelectTargets(flags);
  const results: { agent: string; server: string; action: string; backup?: string; message?: string }[] = [];
  for (const a of targets) {
    for (const d of defs) {
      try {
        const expanded = expandPlaceholders(d, secrets);
        const r = await a.syncOne(expanded, hub.backupsDir);
        results.push({ agent: a.id, server: d.name, action: r.action, backup: r.backup });
        const ACTION: Record<string, string> = {
          installed: '已安装',
          updated: '已更新（旧配置已备份）',
          current: '已是最新',
        };
        say(`[${a.id}] ${d.name} ${ACTION[r.action] ?? r.action}${r.backup ? `（备份: ${r.backup}）` : ''}`);
      } catch (e) {
        results.push({ agent: a.id, server: d.name, action: 'error', message: (e as Error).message });
        say(`✗ [${a.id}] ${d.name}: ${(e as Error).message}`);
      }
    }
    if (a.note) say(`⚠ [${a.id}] ${a.note}`);
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

/** 解析粘贴的 MCP 定义（mcpServers 包装 / 单 def / def 数组）并批量入库；返回新增数 */
async function importMcpDefsFromJson(store: McpStore, text: string, force: boolean, results: { ok: boolean; name: string; message: string }[]): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`不是合法 JSON: ${(e as Error).message}`);
  }
  let servers: Record<string, unknown>;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'mcpServers' in (parsed as Record<string, unknown>)) {
    servers = rec((parsed as { mcpServers?: unknown }).mcpServers);
  } else if (Array.isArray(parsed)) {
    servers = {};
    for (const d of parsed as Record<string, unknown>[]) {
      if (typeof d?.name !== 'string') {
        results.push({ ok: false, name: '(匿名条目)', message: '数组条目缺 name，跳过' });
        continue;
      }
      servers[d.name] = d;
    }
  } else if (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).name === 'string') {
    const n = (parsed as Record<string, unknown>).name as string;
    servers = { [n]: parsed };
  } else {
    throw new Error('无法识别的 MCP 配置格式（支持 {mcpServers:{…}} 包装、单个定义或定义数组）');
  }
  let added = 0;
  const vars = new Set<string>();
  for (const [name, raw] of Object.entries(servers)) {
    if (!isValidMcpName(name)) {
      results.push({ ok: false, name, message: '名称非法（只允许字母数字 . _ -）' });
      continue;
    }
    const norm = normalizeEntry(name, raw, transportFromType);
    if (!norm) {
      results.push({ ok: false, name, message: '配置形状无法识别（缺 command 或 url）' });
      continue;
    }
    if ((await store.get(name)) && !force) {
      results.push({ ok: false, name, message: '已存在（--force 可覆盖）' });
      continue;
    }
    const { def, vars: v } = adoptPlaceholdersInDef(norm);
    for (const x of v) vars.add(x);
    def.description = def.description ?? '来自粘贴的 MCP 配置';
    def.addedAt = new Date().toISOString();
    def.source = { type: 'manual' };
    await store.save(def);
    results.push({ ok: true, name, message: '已入库' });
    added++;
  }
  if (vars.size > 0) {
    results.push({ ok: true, name: '(密钥占位符)', message: `检测到环境变量占位符：${[...vars].join('、')}，需在 ~/.skillhub/secrets.json 提供值` });
  }
  return added;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 收编方向占位符转换：agent 端 ${VAR} → ${SKILLHUB_VAR:VAR}，返回转换出的变量名 */
function adoptPlaceholdersInDef(def: McpDef): { def: McpDef; vars: string[] } {
  const vars = new Set<string>();
  const adopt = (s: string): string =>
    s.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, n: string) => {
      vars.add(n);
      return '${SKILLHUB_VAR:' + n + '}';
    });
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') return adopt(x);
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)]));
    return x;
  };
  const next = walk({ ...def }) as McpDef;
  return { def: next, vars: [...vars] };
}

async function mcpCmdImport(store: McpStore, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const agentId = positional.shift();
  if (!agentId) throw new Error('用法: mcp import <agent> [名称...] [--all] [--include-disabled]');
  const agent = mcpAgentById(agentId);
  if (!agent) throw new Error(`未知 MCP agent: ${agentId}（可选: ${MCP_AGENTS.map((x) => x.id).join(', ')}）`);

  const includeDisabled = flagBool(flags, 'include-disabled');
  const force = flagBool(flags, 'force');
  const all = flagBool(flags, 'all');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);

  const installed = await agent.readInstalled();
  const skippedDisabled = installed.filter((s) => s.disabled && !includeDisabled).length;
  const candidates = installed.filter((s) => s.def && (includeDisabled || !s.disabled));
  const wanted = positional;
  let chosen = candidates;
  if (all) {
    // 全部收编
  } else if (wanted.length > 0) {
    chosen = [];
    for (const n of wanted) {
      const s = installed.find((x) => x.name === n);
      if (!s) say(`✗ ${agentId} 中没有名为 ${n} 的 MCP server`);
      else if (!s.def) say(`✗ ${n} 的配置形状无法识别，跳过`);
      else if (s.disabled && !includeDisabled) say(`- ${n} 处于禁用状态，跳过（--include-disabled 可收编）`);
      else chosen.push(s);
    }
  } else if (candidates.length === 0) {
    say(
      skippedDisabled > 0
        ? `${agentId} 没有 ${includeDisabled ? '' : '启用中的 '}可收编的 MCP server（禁用条目 ${skippedDisabled} 个，--include-disabled 可收编）`
        : `${agentId} 没有可收编的 MCP server。`,
    );
    if (json) console.log(JSON.stringify({ results: [] }, null, 2));
    return;
  } else {
    const ids = await pickMany(`选择要收入中心库的 MCP server（${agentId}）:`, candidates.map((s) => ({ id: s.name, label: s.name })));
    chosen = candidates.filter((s) => ids.includes(s.name));
  }
  if (chosen.length === 0) return;

  const results: { ok: boolean; name: string; message: string }[] = [];
  const allVars = new Set<string>();
  for (const s of chosen) {
    if (!s.def) continue;
    const name = s.name;
    if (!isValidMcpName(name)) {
      results.push({ ok: false, name, message: 'server 名含非法字符，跳过' });
      say(`✗ ${name} 名字非法（只允许字母数字 . _ -）`);
      continue;
    }
    if ((await store.get(name)) && !force) {
      results.push({ ok: false, name, message: '库中已存在（--force 可覆盖）' });
      say(`- ${name} 已在库中，跳过`);
      continue;
    }
    const { def, vars } = adoptPlaceholdersInDef(s.def);
    for (const v of vars) allVars.add(v);
    def.description = def.description ?? `来自 ${agent.id} 的 ${name}`;
    def.addedAt = new Date().toISOString();
    def.source = { type: 'agent', from: agent.id };
    await store.save(def);
    results.push({ ok: true, name, message: '已入库' });
    say(`✓ ${name} 已入库`);
  }
  if (allVars.size > 0) {
    say(`⚠ 收编时把 agent 端占位符转为 ${'${SKILLHUB_VAR:…}'}，需在 ~/.skillhub/secrets.json 提供值: ${[...allVars].join(', ')}`);
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

async function mcpCmdToggle(hub: Hub, store: McpStore, positional: string[], flags: Map<string, string[]>, disable: boolean): Promise<void> {
  const verb = disable ? 'disable' : 'enable';
  if (positional.length === 0) throw new Error(`用法: mcp ${verb} <名称...> [--to <agent...>] [--all]`);
  const json = flagBool(flags, 'json');
  const say = makeSay(json);

  const defs: McpDef[] = [];
  for (const n of positional) {
    const d = await store.get(n);
    if (!d) say(`✗ 不在中心库中（先 mcp add/import）: ${n}`);
    else defs.push(d);
  }
  if (defs.length === 0) return;

  const secrets = loadSecrets(hub.root);
  const targets = await mcpSelectTargets(flags);
  const results: { agent: string; server: string; action: string; message?: string }[] = [];
  for (const a of targets) {
    for (const def of defs) {
      try {
        const expanded = expandPlaceholders(def, secrets);
        const r = await a.setDisabled(expanded, disable, hub.backupsDir);
        results.push({ agent: a.id, server: def.name, action: r.action, message: r.message });
        if (r.action === 'noop') say(`- [${a.id}] ${def.name}: ${r.message ?? '无变化'}`);
        else say(`${disable ? '✓' : '✓'} [${a.id}] ${def.name} ${disable ? '已停用' : '已启用'}`);
        // 无原生禁用字段的 agent（claude 撤条目）需要中心库标记配合，否则状态不可推导
        const wantMark = disable && r.needsHubMark === true;
        const clearMark = !disable && r.needsHubMark === true;
        if (wantMark || clearMark) {
          const cur = (await store.get(def.name))!;
          const marks = { ...(cur.disabled ?? {}) };
          if (wantMark) marks[a.id] = true;
          else delete marks[a.id];
          await store.save({ ...cur, disabled: Object.keys(marks).length > 0 ? marks : undefined });
        }
      } catch (e) {
        results.push({ agent: a.id, server: def.name, action: 'error', message: (e as Error).message });
        say(`✗ [${a.id}] ${def.name}: ${(e as Error).message}`);
      }
    }
    if (a.note) say(`⚠ [${a.id}] ${a.note}`);
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

async function mcpCmdRm(hub: Hub, store: McpStore, positional: string[], flags: Map<string, string[]>): Promise<void> {
  if (positional.length === 0) throw new Error('用法: mcp rm <名称...> [--from <agent...>] [--hub-only] [--yes]');
  const from = flagList(flags, 'from');
  const hubOnly = flagBool(flags, 'hub-only');
  const yes = flagBool(flags, 'yes');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);

  const plan: { name: string; agent?: McpAgentAdapter }[] = [];
  for (const name of positional) {
    if (!isValidMcpName(name)) {
      say(`- ${name} 不是合法 MCP 名，跳过`);
      continue;
    }
    if (hubOnly) {
      if (await store.get(name)) plan.push({ name });
      else say(`- ${name} 不在中心库中`);
      continue;
    }
    const agentCandidates = from.length > 0 ? from.map((id) => mcpAgentById(id)).filter(Boolean) : MCP_AGENTS;
    for (const a of agentCandidates as McpAgentAdapter[]) {
      const installed = await a.readInstalled();
      if (installed.some((s) => s.name === name)) plan.push({ name, agent: a });
    }
    if (from.length === 0 && (await store.get(name))) plan.push({ name });
    if (!plan.some((p) => p.name === name)) say(`- ${name} 未在中心库或各 agent MCP 配置中找到`);
  }
  if (plan.length === 0) return;

  say('将移除以下 MCP 条目（agent 配置文件写回前自动备份）:');
  for (const p of plan) say(`  ${p.agent ? `[${p.agent.id}] ` : '[hub] '}${p.name}`);
  if (!yes) {
    if (!(await confirm('确认移除?'))) {
      say('已取消。');
      return;
    }
  }

  const results: { target: string; server: string; action: string; backup?: string }[] = [];
  for (const p of plan) {
    if (p.agent) {
      const r = await p.agent.removeOne(p.name, hub.backupsDir);
      if (r.removed) {
        results.push({ target: p.agent.id, server: p.name, action: 'removed', backup: r.backup });
        say(`✓ [${p.agent.id}] ${p.name} 已移除${r.backup ? `（备份: ${r.backup}）` : ''}`);
      }
    } else {
      const removed = await store.remove(p.name);
      if (removed) {
        results.push({ target: 'hub', server: p.name, action: 'removed' });
        say(`✓ [hub] ${p.name} 已移除`);
      }
    }
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

// ---------- plugin 命令组 ----------

const PLUGIN_HELP = `用法:
  plugin market add <owner/repo|url>
  plugin market list
  plugin list
  plugin add <name>@<marketplace> [--market <owner/repo|url>] [--version N] [--desc 描述]
  plugin import <agent> [--all]
  plugin sync <id...> [--to <agent...>] [--all]
  plugin enable/disable <id...> [--to <agent...>] [--all]
  plugin rm <id...> [--yes]
插件 agent: claude（全自动） | zcode | codex | workbuddy（半自动，见各自能力边界）`;

async function pluginSelectTargets(flags: Map<string, string[]>) {
  const to = flagList(flags, 'to');
  if (to.length > 0) {
    const out = [];
    for (const id of to) {
      const a = pluginAgentById(id);
      if (!a) throw new Error(`未知插件 agent: ${id}（可选: ${PLUGIN_AGENTS.map((x) => x.id).join(', ')}）`);
      if (!(await a.installed())) throw new Error(`未检测到 ${id} 的安装（主配置目录不存在）`);
      out.push(a);
    }
    return out;
  }
  // 缺省全量，但跳过未安装的 agent（各操作对未装 agent 本就无副作用，这里仅为输出干净）
  const out = [];
  for (const a of PLUGIN_AGENTS) {
    if (await a.installed()) out.push(a);
  }
  return out;
}

async function cmdPlugin(hub: Hub, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const sub = positional.shift();
  const store = await PluginStore.open(path.join(hub.root, 'plugins'));
  switch (sub) {
    case 'list':
      return pluginCmdList(store, flags);
    case 'add':
      return pluginCmdAdd(store, positional, flags);
    case 'sync':
      return pluginCmdSync(hub, store, positional, flags);
    case 'import':
      return pluginCmdImport(store, positional, flags);
    case 'enable':
    case 'disable':
      return pluginCmdToggle(hub, store, positional, flags, sub === 'disable');
    case 'rm':
      return pluginCmdRm(store, positional, flags);
    case 'market':
      return pluginCmdMarket(store, positional);
    case undefined:
    case 'help':
      console.log(PLUGIN_HELP);
      return;
    default:
      console.error(`未知 plugin 子命令: ${sub}\n`);
      console.log(PLUGIN_HELP);
      process.exitCode = 1;
  }
}

async function pluginCmdList(store: PluginStore, flags: Map<string, string[]>): Promise<void> {
  const defs = await store.list();
  if (flagBool(flags, 'json')) {
    console.log(JSON.stringify({ plugins: defs, markets: await store.listMarkets() }, null, 2));
    return;
  }
  if (defs.length === 0) {
    console.log('中心库没有插件定义。用法: plugin import / plugin add');
    return;
  }
  for (const d of defs) {
    console.log(`${d.id}  ${d.version ? `v${d.version}` : ''}`);
    if (d.description) console.log(`    ${d.description.replace(/\s+/g, ' ').slice(0, 80)}`);
  }
  const markets = await store.listMarkets();
  console.log(`\n共 ${defs.length} 个插件、${markets.length} 个市场。用 plugin sync <id> 分发。`);
}

async function pluginCmdAdd(store: PluginStore, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const id = positional[0];
  if (!id || !isValidPluginId(id)) throw new Error(`用法: plugin add <name>@<marketplace>（id 形如 github@claude-plugins-official）`);
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  if (await store.get(id)) throw new Error(`中心库已有该插件定义: ${id}`);
  const parts = parsePluginId(id)!;
  let source: MarketSource | undefined;
  const marketArg = flagList(flags, 'market')[0];
  if (marketArg) source = parseMarketSource(marketArg);
  else {
    const existing = await store.getMarket(parts.marketplace);
    source = existing?.source;
  }
  if (source) {
    await store.upsertMarket({ name: parts.marketplace, source, addedAt: new Date().toISOString(), from: 'plugin add' });
  } else {
    say(`⚠ 市场 ${parts.marketplace} 未注册来源，安装/分发前请先 plugin market add`);
  }
  const def: PluginDef = {
    id,
    name: parts.name,
    marketplace: parts.marketplace,
    version: flagList(flags, 'version')[0],
    description: flagList(flags, 'desc')[0],
    addedAt: new Date().toISOString(),
    source: { type: 'manual' },
  };
  await store.save(def);
  say(`✓ [hub] ${id} 已登记`);
  if (json) console.log(JSON.stringify({ results: [{ ok: true, name: id, message: '已登记' }] }, null, 2));
}

async function pluginSelectDefs(store: PluginStore, positional: string[], say: (m: string) => void): Promise<PluginDef[]> {
  const defs: PluginDef[] = [];
  for (const id of positional) {
    const d = await store.get(id);
    if (!d) say(`✗ 不在中心库中（先 plugin import/add）: ${id}`);
    else defs.push(d);
  }
  return defs;
}

async function pluginCmdSync(hub: Hub, store: PluginStore, positional: string[], flags: Map<string, string[]>): Promise<void> {
  if (positional.length === 0) throw new Error('用法: plugin sync <id...> [--to <agent...>] [--all]');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  const defs = await pluginSelectDefs(store, positional, say);
  if (defs.length === 0) return;

  const targets = await pluginSelectTargets(flags);
  const results: { agent: string; plugin: string; action: string; message?: string }[] = [];
  for (const a of targets) {
    for (const def of defs) {
      const parts = parsePluginId(def.id)!;
      try {
        // 1. 市场注册（unsupported 不阻断后续启停同步）
        const market = await store.getMarket(parts.marketplace);
        if (market) {
          const mr = await a.ensureMarketplace(market.source, hub.backupsDir);
          if (mr.action === 'registered') say(`[${a.id}] 市场 ${parts.marketplace} 已注册（${market.source.ref}）`);
          else if (mr.action === 'unsupported') say(`- [${a.id}] ${mr.message}`);
        } else {
          say(`- [${a.id}] 中心库无市场 ${parts.marketplace} 的来源信息，跳过市场注册`);
        }
        // 2. 安装（claude 原生；其他 pending/unsupported 提示）
        const ir = await a.install(def);
        if (ir.action === 'installed') say(`✓ [${a.id}] ${def.id} 已安装（原生机制）`);
        else if (ir.action === 'exists') say(`[${a.id}] ${def.id} 已在位`);
        else say(`◌ [${a.id}] ${def.id}: ${ir.message ?? '无法自动安装'}`);
        // 3. 启用
        const er = await a.setEnabled(def, true, hub.backupsDir);
        if (er.action === 'enabled') say(`✓ [${a.id}] ${def.id} 已启用`);
        else if (er.action === 'unsupported' || er.action === 'noop') say(`- [${a.id}] ${er.message}`);
        results.push({ agent: a.id, plugin: def.id, action: ir.action === 'installed' ? 'installed' : er.action === 'enabled' ? 'enabled' : ir.action, message: ir.message ?? er.message });
      } catch (e) {
        results.push({ agent: a.id, plugin: def.id, action: 'error', message: (e as Error).message });
        say(`✗ [${a.id}] ${def.id}: ${(e as Error).message}`);
      }
    }
    if (a.note) say(`⚠ [${a.id}] ${a.note}`);
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

/** 收编时跳过无外部来源的内置市场（如 workbuddy-builtin），其插件没有跨 agent 意义 */
function isBuiltinMarket(marketplace: string, marketSources: Map<string, MarketSource>): boolean {
  if (/builtin/i.test(marketplace)) return true;
  return !marketSources.has(marketplace); // 未知来源的市场无法在别处重装，跳过
}

async function pluginCmdImport(store: PluginStore, positional: string[], flags: Map<string, string[]>): Promise<void> {
  const agentId = positional.shift();
  if (!agentId) throw new Error('用法: plugin import <agent> [--all]');
  const agent = pluginAgentById(agentId);
  if (!agent) throw new Error(`未知插件 agent: ${agentId}（可选: ${PLUGIN_AGENTS.map((x) => x.id).join(', ')}）`);
  const all = flagBool(flags, 'all');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);

  let installed: Awaited<ReturnType<typeof agent.readInstalled>> = [];
  let agentMarkets: Awaited<ReturnType<typeof agent.readMarketplaces>> = [];
  try {
    installed = await agent.readInstalled();
    agentMarkets = await agent.readMarketplaces();
  } catch (e) {
    say(`✗ 读取 ${agentId} 插件登记失败: ${(e as Error).message}`);
    if (json) console.log(JSON.stringify({ results: [] }, null, 2));
    return;
  }

  // 市场注册信息收编（只收有外部来源的）
  const marketSources = new Map<string, MarketSource>();
  for (const m of agentMarkets) {
    if (!m.source) continue;
    marketSources.set(m.name, m.source);
    const existed = await store.getMarket(m.name);
    if (!existed) {
      await store.upsertMarket({ name: m.name, source: m.source, addedAt: new Date().toISOString(), from: agent.id });
      say(`✓ 市场 ${m.name} 已收编（${m.source.kind}: ${m.source.ref}）`);
    }
  }

  const candidates = installed.filter(
    (p) => p.installed && !isBuiltinMarket(parsePluginId(p.id)?.marketplace ?? '', marketSources) && p.id.includes('@'),
  );
  let chosen = candidates;
  if (all) {
    // 全部收编
  } else if (candidates.length > 0) {
    const ids = await pickMany(`选择要收入中心库的插件（${agentId}）:`, candidates.map((p) => ({ id: p.id, label: p.id })));
    chosen = candidates.filter((p) => ids.includes(p.id));
  } else {
    say(`${agentId} 没有可收编的插件（内置插件不收编）。`);
    if (json) console.log(JSON.stringify({ results: [] }, null, 2));
    return;
  }
  if (chosen.length === 0) return;

  const results: { ok: boolean; name: string; message: string }[] = [];
  for (const p of chosen) {
    const parts = parsePluginId(p.id);
    if (!parts) {
      results.push({ ok: false, name: p.id, message: 'id 形状异常，跳过' });
      say(`✗ ${p.id} id 形状异常，跳过`);
      continue;
    }
    if (await store.get(p.id)) {
      results.push({ ok: false, name: p.id, message: '库中已存在' });
      say(`- ${p.id} 已在库中，跳过`);
      continue;
    }
    const def: PluginDef = {
      id: p.id,
      name: parts.name,
      marketplace: parts.marketplace,
      version: p.version,
      addedAt: new Date().toISOString(),
      source: { type: 'agent', from: agent.id },
    };
    await store.save(def);
    results.push({ ok: true, name: p.id, message: '已入库' });
    say(`✓ ${p.id} 已入库`);
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

async function pluginCmdToggle(hub: Hub, store: PluginStore, positional: string[], flags: Map<string, string[]>, disable: boolean): Promise<void> {
  const verb = disable ? 'disable' : 'enable';
  if (positional.length === 0) throw new Error(`用法: plugin ${verb} <id...> [--to <agent...>] [--all]`);
  const json = flagBool(flags, 'json');
  const say = makeSay(json);
  const defs = await pluginSelectDefs(store, positional, say);
  if (defs.length === 0) return;

  const targets = await pluginSelectTargets(flags);
  const results: { agent: string; plugin: string; action: string; message?: string }[] = [];
  for (const a of targets) {
    for (const def of defs) {
      try {
        const r = await a.setEnabled(def, !disable, hub.backupsDir);
        if (r.action === 'unsupported' || r.action === 'noop') {
          say(`- [${a.id}] ${def.id}: ${r.message}`);
          results.push({ agent: a.id, plugin: def.id, action: r.action, message: r.message });
        } else {
          say(`✓ [${a.id}] ${def.id} ${disable ? '已停用' : '已启用'}`);
          results.push({ agent: a.id, plugin: def.id, action: r.action });
        }
      } catch (e) {
        results.push({ agent: a.id, plugin: def.id, action: 'error', message: (e as Error).message });
        say(`✗ [${a.id}] ${def.id}: ${(e as Error).message}`);
      }
    }
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

async function pluginCmdRm(store: PluginStore, positional: string[], flags: Map<string, string[]>): Promise<void> {
  if (positional.length === 0) throw new Error('用法: plugin rm <id...> [--yes]');
  const yes = flagBool(flags, 'yes');
  const json = flagBool(flags, 'json');
  const say = makeSay(json);

  const valid = positional.filter((id) => isValidPluginId(id));
  const found: PluginDef[] = [];
  for (const id of valid) {
    const d = await store.get(id);
    if (d) found.push(d);
    else say(`- ${id} 不在中心库中`);
  }
  if (found.length === 0) return;

  say('将从中心库删除以下插件定义（不动各 agent 已装实体）:');
  for (const d of found) say(`  ${d.id}`);
  if (!yes) {
    if (!(await confirm('确认删除?'))) {
      say('已取消。');
      return;
    }
  }
  const results: { target: string; plugin: string; action: string }[] = [];
  for (const d of found) {
    if (await store.remove(d.id)) {
      results.push({ target: 'hub', plugin: d.id, action: 'removed' });
      say(`✓ [hub] ${d.id} 已删除`);
    }
  }
  if (json) console.log(JSON.stringify({ results }, null, 2));
}

async function pluginCmdMarket(store: PluginStore, positional: string[]): Promise<void> {
  const sub = positional.shift();
  if (sub === 'add') {
    const raw = positional[0];
    if (!raw) throw new Error('用法: plugin market add <owner/repo|url>');
    const source = parseMarketSource(raw);
    const name = source.kind === 'github' ? source.ref.split('/')[1] : new URL(source.ref).hostname;
    const created = await store.upsertMarket({ name, source, addedAt: new Date().toISOString(), from: 'manual' });
    console.log(`${created ? '✓' : '-'} 市场 ${name}（${source.kind}: ${source.ref}）${created ? '已注册' : '来源已更新'}`);
    return;
  }
  if (sub === 'list') {
    const markets = await store.listMarkets();
    if (markets.length === 0) {
      console.log('中心库没有市场。用法: plugin market add <owner/repo|url>');
      return;
    }
    for (const m of markets) console.log(`${m.name}  ${m.source.kind}: ${m.source.ref}${m.from ? `  （来自 ${m.from}）` : ''}`);
    return;
  }
  throw new Error('用法: plugin market add <owner/repo|url> | plugin market list');
}
