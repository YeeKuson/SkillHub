// 桌面分发打包：把 CLI 内核（整个 dist/，CommonJS 多文件产物）与其唯一运行时依赖
// （node_modules/yaml）复制到 release exe 旁边，使 target/release 成为可整体搬走的绿色分发目录。
// exe 启动时优先加载自身旁边的 dist/cli.js（见 src-tauri/src/lib.rs 的 cli_path）。
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(appDir, '..');
const releaseDir = join(appDir, 'src-tauri', 'target', 'release');
const distDir = join(root, 'dist');

const cli = join(distDir, 'cli.js');
if (!existsSync(cli)) {
  console.error(`缺少 ${cli}，请先在仓库根目录执行 npm run build`);
  process.exit(1);
}

// dist/ 是 tsc 多文件产物（cli.js require ./hub 等），必须整目录复制
rmSync(join(releaseDir, 'cli.js'), { force: true }); // 旧打包形态残留
rmSync(join(releaseDir, 'package.json'), { force: true });
rmSync(join(releaseDir, 'dist'), { recursive: true, force: true });
cpSync(distDir, join(releaseDir, 'dist'), { recursive: true });
// CLI 的运行时第三方依赖只有 yaml；node 从 cli.js 所在目录向上解析 node_modules
rmSync(join(releaseDir, 'node_modules'), { recursive: true, force: true });
cpSync(join(root, 'node_modules', 'yaml'), join(releaseDir, 'node_modules', 'yaml'), { recursive: true });
// 预填 skill（首次启动由 seed 命令写入用户中心库）
const seedDir = join(appDir, 'seed');
rmSync(join(releaseDir, 'seed'), { recursive: true, force: true });
if (existsSync(seedDir)) cpSync(seedDir, join(releaseDir, 'seed'), { recursive: true });
// release/ 深藏在 app/ 下，会继承 app/package.json 的 "type": "module"，
// 导致 CommonJS 产物被当 ESM 执行。在 dist/ 放 commonjs 声明让模块解析在 cli.js 旁终止。
writeFileSync(join(releaseDir, 'dist', 'package.json'), '{\n  "type": "commonjs"\n}\n');

console.log(`已打包 CLI 内核到 ${releaseDir}（dist/ + node_modules/yaml + commonjs 声明）`);
