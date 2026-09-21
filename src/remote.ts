import { execFile } from 'child_process';
import { promisify } from 'util';
import * as dns from 'dns/promises';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { SKILL_FILE } from './util';

const execFileP = promisify(execFile);

export interface RemoteTarget {
  repoUrl: string;
  ref?: string;
  subpath?: string;
}

export function looksLikeUrl(s: string): boolean {
  return /:\/\//.test(s) || /^git@/.test(s) || /\.git$/i.test(s);
}

/**
 * 出网前置校验：仅允许 http/https，且目标主机必须解析到公网地址，
 * 拒绝 localhost / 环回 / 私有 / 保留地址，防止把内网地址当仓库源。
 */
export async function validateGitUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`不是合法 URL: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`仅允许 http/https 协议，拒绝: ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error(`拒绝访问本机/内部域名: ${host}`);
  }
  const literalVersion = net.isIP(host);
  const addresses = literalVersion
    ? [{ address: host, family: literalVersion }]
    : await dns.lookup(host, { all: true }).catch(() => {
        throw new Error(`域名无法解析: ${host}`);
      });
  for (const a of addresses) {
    if (!isPublicIp(a.address)) {
      throw new Error(`拒绝访问非公网地址: ${host} -> ${a.address}（localhost/内网/保留地址）`);
    }
  }
}

function isPublicIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isPublicV4(ip);
  if (v === 6) return isPublicV6(ip);
  return false;
}

function isPublicV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return false; // 本网络 / 私有 / 环回
  if (a === 169 && b === 254) return false; // 链路本地
  if (a === 172 && b >= 16 && b <= 31) return false; // 私有
  if (a === 192 && b === 168) return false; // 私有
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 192 && b === 0) return false; // 192.0.0.0/24、192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false; // 基准测试 / TEST-NET-2
  if (a === 203 && b === 0) return false; // TEST-NET-3
  if (a >= 224) return false; // 组播 / 保留 / 广播
  return true;
}

function isPublicV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return false; // 未指定 / 环回
  if (lower.startsWith('::ffff:')) return isPublicV4(lower.slice(7)); // v4 映射
  const first = lower.split(':')[0] ?? '';
  if (/^f[ce]/.test(first)) return false; // fc00::/7 唯一本地、fe80::/10 链路本地、ff00::/8 组播
  if (lower.startsWith('2001:db8')) return false; // 文档保留
  return true;
}

/** 识别 GitHub 的 repo / tree / blob 链接，其余按普通 git 仓库处理 */
export function parseRemoteTarget(raw: string): RemoteTarget {
  const u = new URL(raw);
  const seg = u.pathname.split('/').filter(Boolean);
  if (u.hostname.toLowerCase() === 'github.com' && seg.length >= 2) {
    const repoUrl = `https://github.com/${seg[0]}/${seg[1].replace(/\.git$/, '')}`;
    if (seg[2] === 'tree' && seg.length >= 4) {
      return { repoUrl, ref: seg[3], subpath: seg.slice(4).join('/') };
    }
    if (seg[2] === 'blob' && seg.length >= 4) {
      const rest = seg.slice(4);
      if (rest.length && /^skill\.md$/i.test(rest[rest.length - 1])) rest.pop();
      return { repoUrl, ref: seg[3], subpath: rest.join('/') };
    }
    return { repoUrl };
  }
  return { repoUrl: raw };
}

export async function cloneRepo(t: RemoteTarget, dest: string): Promise<void> {
  const args = ['clone', '--depth', '1', '--single-branch'];
  if (t.ref) args.push('--branch', t.ref);
  args.push(t.repoUrl, dest);
  try {
    await execFileP('git', args, { timeout: 180_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const detail = (err.stderr || err.message || String(e)).trim().split('\n').slice(-3).join('\n');
    throw new Error(`git clone 失败: ${detail}`);
  }
}

/**
 * 在仓库（或本地目录）中找 skill 目录：根目录有 SKILL.md 视为单 skill 仓库；
 * 否则向下最多 4 层扫描，跳过 .git / node_modules / references / sub-skills。
 * 返回 null 表示没扫到（error 里带该位置的一级目录清单，便于用户自查）。
 */
export async function findSkillDirs(root: string, subpath?: string): Promise<string[] | null> {
  const base = subpath ? path.join(root, ...subpath.split('/')) : root;
  if (!fs.existsSync(base)) throw new Error(`仓库中不存在该路径: ${subpath}`);
  if (fs.existsSync(path.join(base, SKILL_FILE))) return [base];

  const skip = new Set(['.git', 'node_modules', 'references', 'sub-skills']);
  const found: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 4) return;
    for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (fs.existsSync(path.join(full, SKILL_FILE))) {
        found.push(full);
        continue; // 命中 skill 目录后不再向内找嵌套 skill
      }
      await walk(full, depth + 1);
    }
  };
  await walk(base, 1);
  return found.length > 0 ? found : null;
}

/** 扫描不到 SKILL.md 时给用户的可操作指引：列出扫描位置的一级子目录（最多 8 个） */
export async function describeScanBase(root: string, subpath?: string): Promise<string> {
  const base = subpath ? path.join(root, ...subpath.split('/')) : root;
  try {
    const entries = (await fs.promises.readdir(base, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name !== '.git' && e.name !== 'node_modules')
      .slice(0, 8)
      .map((e) => e.name);
    return entries.length > 0 ? `该位置的一级目录：${entries.join('、')}` : '该位置下没有子目录';
  } catch {
    return '';
  }
}
