import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline/promises';
import { parse as parseYaml } from 'yaml';

export const SKILL_FILE = 'SKILL.md';

/** 动态名字拼进根目录前的边界校验：解析结果必须仍位于 root 之内，否则视为路径穿越 */
export function assertWithin(root: string, name: string): string {
  const target = path.resolve(root, name);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`非法路径片段（疑似路径穿越）: ${name}`);
  }
  return target;
}

export interface SkillMeta {
  name: string;
  description: string;
}

/** 解析 skill 目录：读 SKILL.md frontmatter，name 缺失时用目录名兜底 */
export async function readSkillMeta(dir: string): Promise<SkillMeta | null> {
  const file = path.join(dir, SKILL_FILE);
  if (!fs.existsSync(file)) return null;
  const text = await fsp.readFile(file, 'utf8');
  let name = '';
  let description = '';
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (m) {
    try {
      const fm = parseYaml(m[1]) as Record<string, unknown> | null;
      if (fm && typeof fm === 'object') {
        name = String(fm.name ?? '');
        description = String(fm.description ?? '');
      }
    } catch {
      // frontmatter 损坏时按目录名兜底，不中断
    }
  }
  if (!name) name = path.basename(dir);
  return { name, description };
}

/** 列出 root 下含 SKILL.md 的一级子目录 */
export async function listSkillDirs(root: string): Promise<string[]> {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const e of await fsp.readdir(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (fs.existsSync(path.join(root, e.name, SKILL_FILE))) out.push(path.join(root, e.name));
  }
  return out.sort();
}

function walkFiles(absDir: string, rel: string, out: string[]): void {
  const base = rel ? path.join(absDir, rel) : absDir;
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walkFiles(absDir, r, out);
    else if (e.isFile()) out.push(r);
  }
}

/** 目录内容指纹：相对路径 + 内容一起进 SHA-256，用于比较两份 skill 是否一致。
 *  内容按 utf8 解码并把 CRLF 归一化为 LF 后再哈希，避免 git autocrlf 等换行符差异被误判为内容不同。 */
export async function hashDir(dir: string): Promise<string> {
  const files: string[] = [];
  walkFiles(dir, '', files);
  const h = crypto.createHash('sha256');
  for (const rel of files.sort()) {
    h.update(rel);
    h.update('\0');
    h.update((await fsp.readFile(path.join(dir, rel), 'utf8')).replace(/\r\n/g, '\n'));
    h.update('\0');
  }
  return h.digest('hex');
}

/** 复制 skill 时排除 VCS 元数据：.git 目录与 .gitignore/.gitattributes 文件（仓库开发用，不属于 skill 本体） */
export const cpSkipGit = (src: string): boolean => {
  const base = path.basename(src);
  return base !== '.git' && base !== '.gitignore' && base !== '.gitattributes';
};

/** 覆盖/删除前把现有目录快照进中心库 backups */
export async function backupDir(src: string, backupsRoot: string, group: string, name: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const groupDir = assertWithin(backupsRoot, group);
  const nameDir = assertWithin(groupDir, name);
  const dest = path.join(nameDir, ts);
  await fsp.mkdir(dest, { recursive: true });
  await fsp.cp(src, dest, { recursive: true });
  return dest;
}

/** 覆盖/删除前把单个配置文件快照进中心库 backups（MCP 写回用） */
export async function backupFile(src: string, backupsRoot: string, group: string, name: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const groupDir = assertWithin(backupsRoot, group);
  const nameDir = assertWithin(groupDir, name);
  const dest = path.join(nameDir, ts, path.basename(src));
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
  return dest;
}

/** 键排序后的稳定 JSON 序列化，用于两份配置对象的相等性比较 */
export function stableStringify(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') {
      return Object.fromEntries(
        Object.keys(x as Record<string, unknown>)
          .sort()
          .map((k) => [k, walk((x as Record<string, unknown>)[k])]),
      );
    }
    return x;
  };
  return JSON.stringify(walk(v));
}

/** tmp + rename 的原子写，避免写一半被读走 */
export async function writeTextAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, file);
}

export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return ans === 'y' || ans === 'yes';
  } finally {
    rl.close();
  }
}

export interface PickOption {
  id: string;
  label: string;
}

/** 交互式多选；非 TTY 环境抛错，提示改用参数 */
export async function pickMany(title: string, options: PickOption[]): Promise<string[]> {
  if (!process.stdin.isTTY) {
    throw new Error('当前是非交互环境，请用参数明确指定（如 --to、--all、具体名称）');
  }
  console.log(title);
  options.forEach((o, i) => console.log(`  ${i + 1}) ${o.label}`));
  console.log('  a) 全部');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question('选择（逗号分隔编号，a=全部，直接回车取消）: ')).trim().toLowerCase();
    if (!ans) return [];
    if (ans === 'a' || ans === 'all') return options.map((o) => o.id);
    const picked: string[] = [];
    for (const part of ans.split(/[,\s]+/).filter(Boolean)) {
      const idx = parseInt(part, 10);
      if (idx >= 1 && idx <= options.length) picked.push(options[idx - 1].id);
    }
    return picked;
  } finally {
    rl.close();
  }
}
