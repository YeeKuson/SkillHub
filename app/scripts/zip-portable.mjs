// 绿色免安装版打包：把 release 目录中的运行必需四项（exe + dist/ + node_modules/ + seed/）
// 压缩为 portable zip，产出在 target/release/bundle/portable/ 下。
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(appDir, 'src-tauri', 'target', 'release');
const outDir = join(releaseDir, 'bundle', 'portable');
const zipPath = join(outDir, 'SkillHub_0.1.0-beta_x64_portable.zip');

const required = ['skillhub-desktop.exe', 'dist', 'node_modules', 'seed'];
const missing = required.filter((f) => !existsSync(join(releaseDir, f)));
if (missing.length) {
  console.error(`release 目录缺少必需项: ${missing.join('、')}（请先完成构建与 pack-cli）`);
  process.exit(1);
}

// 打包暂存目录：只含运行必需项（release/ 里还有 cargo 中间产物，不能整体压缩）
const stage = join(outDir, 'SkillHub');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
execSync(`xcopy /E /I /Y "${join(releaseDir, 'dist')}" "${join(stage, 'dist')}"`, { stdio: 'pipe' });
execSync(`xcopy /E /I /Y "${join(releaseDir, 'node_modules')}" "${join(stage, 'node_modules')}"`, { stdio: 'pipe' });
execSync(`xcopy /E /I /Y "${join(releaseDir, 'seed')}" "${join(stage, 'seed')}"`, { stdio: 'pipe' });
execSync(`copy /Y "${join(releaseDir, 'skillhub-desktop.exe')}" "${join(stage, 'skillhub-desktop.exe')}"`, { stdio: 'pipe' });

execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${stage}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
rmSync(stage, { recursive: true, force: true });
console.log(`绿色免安装包已产出: ${zipPath}`);
