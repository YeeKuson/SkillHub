import * as os from 'os';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { hashDir, readSkillMeta, backupDir, cpSkipGit, assertWithin } from './util';

export interface SkillSource {
  type: 'github' | 'local' | 'agent';
  url?: string;
  ref?: string;
  subpath?: string;
  from?: string;
}

export interface HubSkill {
  name: string;
  dir: string;
  description: string;
  hash: string;
  source: SkillSource;
  addedAt: string;
}

const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._ ()-]*$/;

/** skill 名白名单：只能出现字母数字和 . _ ( ) 空格 -，且不允许 ".." */
export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_RE.test(name) && !name.includes('..');
}

export function resolveHubRoot(explicit?: string): string {
  const root = path.resolve(explicit || process.env.SKILLHUB_HOME || path.join(os.homedir(), '.skillhub'));
  if (/[\u0000-\u001f]/.test(root)) throw new Error('中心库路径含非法控制字符');
  if (!path.isAbsolute(root)) throw new Error(`中心库路径必须是绝对路径: ${root}`);
  return root;
}

/** skill 目录名安全化：去掉路径非法字符，避免越出 skills 根目录 */
export function sanitizeSkillName(raw: string): string {
  const s = raw
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^[.\-]+/, '')
    .trim();
  return s || 'unnamed-skill';
}

export class Hub {
  readonly root: string;
  readonly skillsDir: string;
  readonly mcpDir: string;
  readonly backupsDir: string;
  private readonly indexFile: string;
  private skills = new Map<string, HubSkill>();

  private constructor(root: string) {
    this.root = root;
    this.skillsDir = path.join(root, 'skills');
    this.mcpDir = path.join(root, 'mcp');
    this.backupsDir = path.join(root, 'backups');
    this.indexFile = path.join(root, 'hub.json');
  }

  static async open(root: string): Promise<Hub> {
    const h = new Hub(root);
    await fsp.mkdir(h.skillsDir, { recursive: true });
    await fsp.mkdir(h.mcpDir, { recursive: true });
    await fsp.mkdir(h.backupsDir, { recursive: true });
    await h.reload();
    return h;
  }

  async reload(): Promise<void> {
    this.skills.clear();
    if (!fs.existsSync(this.indexFile)) return;
    let data: { skills?: HubSkill[] };
    try {
      data = JSON.parse(await fsp.readFile(this.indexFile, 'utf8'));
    } catch (e) {
      throw new Error(`hub.json 损坏，请手工检查: ${this.indexFile}（${(e as Error).message}）`);
    }
    for (const s of data.skills ?? []) this.skills.set(s.name, s);
  }

  private async save(): Promise<void> {
    const data = { version: 1, skills: this.list() };
    const tmp = `${this.indexFile}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmp, this.indexFile);
  }

  list(): HubSkill[] {
    return [...this.skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }

  get(name: string): HubSkill | undefined {
    return this.skills.get(name);
  }

  skillPath(name: string): string {
    // name 可能来自 CLI 参数或仓库/远端内容，拼路径前强制做根目录边界校验
    return assertWithin(this.skillsDir, name);
  }

  async addFromDir(
    srcDir: string,
    source: SkillSource,
    opts: { force?: boolean } = {},
  ): Promise<{ ok: boolean; name: string; message: string }> {
    const meta = await readSkillMeta(srcDir);
    if (!meta) return { ok: false, name: path.basename(srcDir), message: '目录中没有 SKILL.md，不是一个 skill' };
    const name = sanitizeSkillName(meta.name);
    const dest = this.skillPath(name);
    if (fs.existsSync(dest)) {
      if (!opts.force) return { ok: false, name, message: '库中已存在同名 skill（--force 可覆盖）' };
      const bak = await backupDir(dest, this.backupsDir, 'hub', name);
      await fsp.rm(dest, { recursive: true, force: true });
      await fsp.cp(srcDir, dest, { recursive: true, filter: cpSkipGit });
      await this.refreshEntry(name, source);
      return { ok: true, name, message: `已覆盖入库（旧版备份: ${bak}）` };
    }
    await fsp.cp(srcDir, dest, { recursive: true, filter: cpSkipGit });
    await this.refreshEntry(name, source);
    return { ok: true, name, message: '已入库' };
  }

  private async refreshEntry(name: string, source: SkillSource): Promise<void> {
    const dir = this.skillPath(name);
    const meta = await readSkillMeta(dir);
    this.skills.set(name, {
      name,
      dir: name,
      description: meta?.description ?? '',
      hash: await hashDir(dir),
      source,
      addedAt: new Date().toISOString(),
    });
    await this.save();
  }

  async removeFromHub(name: string): Promise<string> {
    const dir = this.skillPath(name);
    let bak = '';
    if (fs.existsSync(dir)) {
      bak = await backupDir(dir, this.backupsDir, 'hub', name);
      await fsp.rm(dir, { recursive: true, force: true });
    }
    this.skills.delete(name);
    await this.save();
    return bak;
  }
}
