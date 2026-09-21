# GitHub 调研依据与采用决策

## 调研范围

调研日期：2026-08-11。

选择条件满足任一项：近两个月仍维护、GitHub Stars 超过 10k、或同类中 Stars 最高。Stars 仅用于筛选代表性项目，不进入被评 Skill 的质量分。

以下数字是调研时 GitHub 页面显示的快照，未来会变化。

## 采用的项目

### Anthropic Skills

- 仓库：[anthropics/skills](https://github.com/anthropics/skills)
- 调研时约 167.8k Stars，官方示例包含生产环境使用的复杂文档 Skill。
- 采用：三层渐进式披露、主文件控制、真实任务评测、Skill 与无 Skill 基线、描述触发优化、保留测试集。
- 不照搬：平台专属打包和 Claude-only 运行机制；`skill-mentor` 保持跨 Agent 规则并显式标注平台差异。

### obra/superpowers

- 仓库：[obra/superpowers](https://github.com/obra/superpowers)
- 调研时约 270.5k Stars；仓库说明 Skill 行为评测和证据优先工作流。
- 采用：把 Skill 当作可测试的流程、压力场景、反合理化、明确退出条件、修改前基线。
- 调整：不采用“所有文档修改都必须删除重来”的绝对规则；这里使用可恢复快照和单变量回滚，更适合维护既有 Skill。

### Addy Osmani Agent Skills

- 仓库：[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
- 调研时约 86k Stars；2026-06-11 有发布记录，处于两个月维护窗口边界。
- 采用：“流程而非说明书”、检查点与退出证据、反合理化表、红旗机制、按需引用。
- 调整：不是所有 Skill 都需要完整角色体系；角色只在能改变阶段产出时保留。

### Agent Skills Specification

- 仓库：[agentskills/agentskills](https://github.com/agentskills/agentskills)
- 调研时约 19.5k Stars。
- 采用：`name`/`description` 约束、目录名一致、主文件建议低于 500 行、相对引用、一级引用深度、`skills-ref validate` 兼容意识。
- 调整：OpenAI Codex 的本地 `skill-creator` 要求 frontmatter 只保留 `name` 和 `description`，本项目采用更严格子集。

### OpenAI Skill Creator

- 文件：[openai/skills 的 skill-creator](https://github.com/openai/skills/blob/main/skills/.system/skill-creator/SKILL.md)
- 采用：命令式写法、`agents/openai.yaml`、初始化/验证流程、引用与脚本职责分离、避免辅助文档膨胀。
- 例外：本仓库保留 `README.md`，因为用户明确要求维护者文档；Agent 执行仍只以 `SKILL.md` 为入口。

### NVIDIA SkillSpector

- 仓库：[NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector)
- 调研时约 14.5k Stars，属于 10k+ 的专门安全扫描器。
- 采用：外部静态扫描优先、扫描模式元数据、风险与发布门禁映射、从不执行被扫描 Skill、秘密与网络外传审查、无发现不等于安全。
- 调整：默认建议 `--no-llm` 保持本地；启用 LLM 前必须说明内容可能发送给模型提供方。

### Cisco Skill Scanner

- 仓库：[cisco-ai-defense/skill-scanner](https://github.com/cisco-ai-defense/skill-scanner)
- 调研时约 2.4k Stars，但它是近年维护的专业安全项目，作为“近维护/领域代表”纳入，不因 Stars 加权。
- 采用：多引擎防御、交叉 Skill overlap、策略预设、SARIF/JSON、`NOT_RUN` 与局限说明。

## 综合后的设计原则

1. 触发只解决“何时加载”，正文解决“如何可靠完成”。
2. 先读取、列证据和发现，再评分；作者与 Stars 不进入评分。
3. 静态格式验证、行为评测和安全扫描是三个不同层次，不能互相冒充。
4. 主文件只保留路由和不可跳过门禁；领域细则按需加载。
5. 对新 Skill 做有/无 Skill 基线；对既有 Skill 做旧/新快照对比。
6. 对非确定触发重复运行，并用保留集避免 description 过拟合。
7. 安全扫描默认只读、不执行、少外传；任何降级都写入报告。
8. 修改是独立授权动作，备份、单变量实验和回滚是优化闭环的一部分。

## 尚未采用的提议

- Skill 包签名、依赖清单和关系字段仍处于生态提案或平台差异阶段，不作为硬性评分项。
- 自动安装、自动发布、自动更新和跨平台转换不属于质量审计核心，避免主动作被篡位。
- 记忆机制只在状态确有生命周期价值时使用，不作为通用成熟度标志。
