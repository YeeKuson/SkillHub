# 工作流契约

## 阶段与产物

| 阶段 | 输入 | 必需输出 | 完成条件 |
|---|---|---|---|
| understand | 用户资料、项目文件 | `work/brief.json` | 核心结论、观众、事实、边界明确 |
| outline | brief、叙事弧线 | `work/outline.json` | 每页目的、证据、预算、版式明确 |
| select | brief、模板目录 | template slug | 用户选择或记录默认 `terminal-mint` |
| write | outline、selected design | `work/slides/batch-N.json` | 所有 slide ID 唯一、Schema 有效 |
| assemble | fragments、脚手架 | 唯一根层 HTML 入口 | 引用存在、顺序正确 |
| verify | 完整输出 | `work/validation.json` | 必需检查 PASS；NOT_RUN 已披露 |
| deliver | 验证结果 | `deck-manifest.json` | 明确入口、模式、主题和限制 |

每完成一个阶段更新 `work/checkpoint.json`。只有阶段产物存在且通过最小 Schema 检查，才能标记 `completed`。

## 内容批次

- 1—8 页：一个批次。
- 9—16 页：每批 3—4 页。
- 17 页以上：每批最多 4 页，并先确认总时长与内容预算。
- 并行 Writer 各写独立文件；Assembler 按 `outline.json` 的 slide 顺序合并。
- 禁止多个进程或 Agent 追加同一个 JSON 文件。

## 失败语义

| 状态 | 含义 | 后续动作 |
|---|---|---|
| `ready` | 前置产物齐全 | 可以开始当前阶段 |
| `in_progress` | 阶段未完成 | 从当前阶段恢复 |
| `completed` | 产物已验证 | 进入下一阶段 |
| `failed` | 已知失败且记录原因 | 修复原因后重试当前阶段 |
| `blocked` | 缺用户事实、权限或环境 | 停止并报告所需输入 |

失败不得通过写空文件、忽略异常或直接改状态绕过。Writer 单批最多重试两次；连续失败后记录 `failed`，不继续装配。

## 完成定义

“文件已写出”不是完成。只有内容、结构、脚本语法、浏览器视觉、交互、隐私扫描和入口说明全部达到验证契约，才能交付为完成。
