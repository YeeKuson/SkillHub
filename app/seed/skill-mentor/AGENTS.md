# Skill Mentor 项目约束

## Project Summary

`skill-mentor` 是一个用于评估、审计、诊断和优化 Agent Skill 的元 Skill。
它采用三档评估深度、八维评分、九项审计和独立安全门禁，输出带证据锚点的报告。
主 Skill 保持精简，详细规则放在 `references/`，确定性检查放在 `scripts/`。
源码已公开发布，并完成 Codex 用户级 Skills 目录安装验证；维护脚本不得在未授权情况下静默安装或覆盖现有版本。

## Structure

- `SKILL.md`：触发描述、路由、核心工作流和红线。
- `agents/openai.yaml`：Codex UI 元数据。
- `references/`：评分、安全、审计、报告和优化规范。
- `scripts/inspect_skill.py`：只读、离线、确定性的基础检查器。
- `tests/`：检查器回归测试。
- `evals/`：Skill 触发与功能评测样例。
- `README.md`：面向维护者的开发说明；Agent 执行以 `SKILL.md` 为准。

## Current State

- 已完成：第一版规范、只读检查器、7 个回归测试与 10 个评测样例。
- 已验证：单元测试、Skill 格式、JSON/YAML、交叉引用和自身静态检查通过。
- 已发布：GitHub public 仓库 `YeeKuson/skill-mentor`，默认分支 `main`。
- 已安装：Codex 用户级 Skills 目录中的 `skill-mentor` 运行时文件已验证。
- 待确认：真实模型上的触发率与有无 Skill 基线对比。
- 未执行：独立 Release、`.skill` 打包和自动更新机制。

## Commands

- Inspect: `python scripts/inspect_skill.py . --format text`
- JSON inspect: `python scripts/inspect_skill.py . --format json`
- Test: `python -m unittest discover -s tests -v`
- Skill validation: `python C:/Users/KMW_E/.codex/skills/.system/skill-creator/scripts/quick_validate.py .`

## Critical Mistakes Already Made

- 错误：把包含 `;`、`|`、`&&`、反引号或 `$()` 的任何 Skill 正文都判为命令注入。
  原因：Skill 可能合法包含 Shell 示例，正文审计不等于执行命令。
  避免：只阻断即将作为命令执行的不可信输入；扫描正文时记录风险和上下文，不执行内容。
- 错误：把外部安全扫描器不可用当作安全扫描通过。
  原因：未执行与未发现风险是两种状态。
  避免：报告必须区分 `PASS`、`FAIL`、`NOT_RUN` 和 `DEGRADED`。

## Rules

- 默认使用中文说明；文件名、命令、字段名和代码标识符使用英文。
- `SKILL.md` 目标不超过 200 行，硬上限 500 行；详细内容使用一级 `references/` 引用。
- 评分、问题和结论必须带文件路径、行号或明确内容锚点；无证据不得扣分。
- 安全问题与质量问题分开计算；安全 HIGH/CRITICAL 强制 `DO_NOT_INSTALL`。
- 外部扫描器不得执行被审计 Skill；所有本地检查默认只读、离线、标准库优先。
- 不得读取、打印或写入真实密钥；测试仅使用明显虚构的占位值。
- 不得在维护或测试流程中未经明确授权安装、覆盖或删除用户级 Skill；同步新版本后必须重新验证。
- 未经用户明确确认，不得升级被审计 Skill；确认后也必须先备份再修改。
- 不创建与运行无关的辅助文档；`README.md` 是用户明确要求的唯一维护者说明例外。
- 修改脚本后必须运行单元测试；修改 Skill 结构后必须运行格式验证和交叉引用检查。
