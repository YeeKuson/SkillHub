// 构建前清理 seed 目录中的隐藏缓存（.mimosa 等）：这些文件由本机工具链生成，
// 含构建机路径与会话 ID，绝不能进入安装包或绿色包。
import { rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const seedDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed');
let removed = 0;
try {
  for (const entry of readdirSync(seedDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(seedDir, entry.name);
    for (const hidden of readdirSync(skillDir, { withFileTypes: true })) {
      if (hidden.name.startsWith('.')) {
        rmSync(join(skillDir, hidden.name), { recursive: true, force: true });
        removed++;
        console.log(`已清理 seed/${entry.name}/${hidden.name}`);
      }
    }
  }
} catch (e) {
  console.error('清理失败:', e.message);
  process.exit(1);
}
console.log(removed ? `共清理 ${removed} 项` : 'seed 目录干净');
