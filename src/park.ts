/**
 * skills 禁用/启用（park 暂存区机制）：
 * - 禁用 = 把 agent 里的 skill 实例目录移到中心库 park 区（同盘 rename，瞬时无损）；
 * - 启用 = 按 origin.json 记录的原位移回；
 * - 五家 agent 行为完全一致，不碰任何配置文件。
 * park 目录结构：~/.skillhub/park/<agentId>/<目录名>__<n>/{skill/原目录内容, origin.json}
 */
import * as os from 'os';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { assertWithin, readSkillMeta } from './util';
import { isValidSkillName } from './hub';
import type { AgentAdapter } from './agents';

const ORIGIN_FILE = 'origin.json';
const SKILL_SUBDIR = 'skill';

/** readdir 得到的条目名拼路径前统一过边界校验（条目名理论上不含分隔符，防御式兜底） */
function joinWithin(root: string, entry: string): string {
  return assertWithin(root, entry);
}

/**
 * origin.json 是本工具自己写入、但可能被外部篡改的文件，恢复前强制双校验：
 * 原位 root 必须位于用户主目录内（五个 agent 的 skills 根目录均在 home 下），
 * 目录名必须是不含分隔符的单段名字。
 */
function validatedOrigin(raw: unknown): { root: string; dirName: string; skillName: string } | null {
  const o = raw as { root?: unknown; dirName?: unknown; skillName?: unknown };
  if (typeof o?.root !== 'string' || typeof o?.dirName !== 'string' || typeof o?.skillName !== 'string') return null;
  if (!isValidSkillName(o.skillName)) return null;
  if (o.dirName.includes('/') || o.dirName.includes('\\') || o.dirName.includes('..')) return null;
  try {
    assertWithin(os.homedir(), o.root); // root 越出 home 视为被篡改，拒绝恢复
  } catch {
    return null;
  }
  return { root: o.root, dirName: o.dirName, skillName: o.skillName };
}

async function moveDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fsp.rename(src, dest);
  } catch (e) {
    // 跨盘 rename 会 EXDEV，退化为复制+删除
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await fsp.cp(src, dest, { recursive: true });
    await fsp.rm(src, { recursive: true, force: true });
  }
}

function parkRoot(hubRoot: string): string {
  return path.join(hubRoot, 'park');
}

async function nextSlot(hubRoot: string, agentId: string, dirName: string): Promise<string> {
  const agentPark = assertWithin(parkRoot(hubRoot), agentId);
  if (!fs.existsSync(assertWithin(agentPark, dirName))) return assertWithin(agentPark, dirName);
  let n = 2;
  while (fs.existsSync(assertWithin(agentPark, `${dirName}__${n}`))) n++;
  return assertWithin(agentPark, `${dirName}__${n}`);
}

/** 禁用一个 skill：把 agent 中按 frontmatter name 找到的每个实例目录移入 park */
export async function disableSkill(
  hubRoot: string,
  agent: AgentAdapter,
  name: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isValidSkillName(name)) return { ok: false, message: `非法 skill 名: ${name}` };
  const parked = await listParked(hubRoot);
  if (parked.get(agent.id)?.has(name)) return { ok: false, message: `${name} 在 ${agent.id} 已处于禁用状态` };
  const roots = await agent.skillsRoots();
  if (roots.length === 0) return { ok: false, message: `[${agent.id}] 未找到 skills 目录` };
  let moved = 0;
  for (const root of roots) {
    for (const e of await fsp.readdir(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const full = joinWithin(root, e.name);
      const meta = await readSkillMeta(full);
      if (!meta || meta.name !== name) continue;
      const slot = await nextSlot(hubRoot, agent.id, e.name);
      await moveDir(full, assertWithin(slot, SKILL_SUBDIR));
      await fsp.writeFile(
        assertWithin(slot, ORIGIN_FILE),
        JSON.stringify({ root, dirName: e.name, skillName: name, disabledAt: new Date().toISOString() }, null, 2) + '\n',
        'utf8',
      );
      moved++;
    }
  }
  if (moved === 0) return { ok: false, message: `[${agent.id}] 未找到已安装的 ${name}` };
  return { ok: true, message: `${name} 在 ${agent.id} 已禁用（暂存 ${moved} 个实例，可随时恢复）` };
}

/** 启用：把 park 区该 agent 名下匹配 skillName 的实例移回原位 */
export async function enableSkill(
  hubRoot: string,
  agent: AgentAdapter,
  name: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isValidSkillName(name)) return { ok: false, message: `非法 skill 名: ${name}` };
  const agentPark = assertWithin(parkRoot(hubRoot), agent.id);
  if (!fs.existsSync(agentPark)) return { ok: false, message: `${name} 在 ${agent.id} 没有禁用记录` };
  let restored = 0;
  for (const e of await fsp.readdir(agentPark, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const slot = joinWithin(agentPark, e.name);
    const originFile = assertWithin(slot, ORIGIN_FILE);
    if (!fs.existsSync(originFile)) continue;
    let origin: { root: string; dirName: string; skillName: string } | null = null;
    try {
      origin = validatedOrigin(JSON.parse(await fsp.readFile(originFile, 'utf8')));
    } catch {
      origin = null;
    }
    if (!origin || origin.skillName !== name) continue;
    const destRoot = assertWithin(origin.root, origin.dirName);
    if (fs.existsSync(destRoot)) return { ok: false, message: `[${agent.id}] 原位已被占用: ${destRoot}（请手工处理）` };
    await moveDir(assertWithin(slot, SKILL_SUBDIR), destRoot);
    await fsp.rm(slot, { recursive: true, force: true });
    restored++;
  }
  if (restored === 0) return { ok: false, message: `${name} 在 ${agent.id} 没有禁用记录` };
  return { ok: true, message: `${name} 在 ${agent.id} 已启用（恢复 ${restored} 个实例）` };
}

/** status 用：各 agent 当前被禁用（在 park 区）的 skill 名集合 */
export async function listParked(hubRoot: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const root = parkRoot(hubRoot);
  if (!fs.existsSync(root)) return out;
  for (const agentEntry of await fsp.readdir(root, { withFileTypes: true })) {
    if (!agentEntry.isDirectory()) continue;
    const agentPark = joinWithin(root, agentEntry.name);
    const set = new Set<string>();
    for (const s of await fsp.readdir(agentPark, { withFileTypes: true })) {
      if (!s.isDirectory()) continue;
      const originFile = assertWithin(joinWithin(agentPark, s.name), ORIGIN_FILE);
      if (!fs.existsSync(originFile)) continue;
      try {
        const origin = validatedOrigin(JSON.parse(await fsp.readFile(originFile, 'utf8')));
        if (origin) set.add(origin.skillName);
      } catch {
        // 损坏实例跳过
      }
    }
    if (set.size > 0) out.set(agentEntry.name, set);
  }
  return out;
}
