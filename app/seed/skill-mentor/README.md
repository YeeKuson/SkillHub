# Skill Mentor

`skill-mentor` 是一个用于评估、审计、诊断、教学和优化 Agent Skill 的元 Skill。它把质量评分、安全门禁、结构审计、触发评测和小步优化合并成一套可追溯规范。

当前版本已发布到 GitHub，并已在 Codex 用户级 Skills 目录完成安装验证。仓库本身不包含静默安装或自动覆盖逻辑。

## 能力范围

- Scan：快速输出类型、八维评分、关键问题和建议。
- Audit：增加三层安全扫描、九项审计、最佳实践加分和六层设计分析。
- Overhaul：增加认知框架、趋势预测、JSON，以及获授权后的 Karpathy Loop 记录。
- Governance：只读检查 Skill 消费目录中的重名、触发冲突、断链、版本漂移和来源问题。
- Teaching：用七层框架解释优秀 Skill 为什么有效、边界在哪里、如何超越。

安全结论与质量分完全分离：即使质量分很高，只要出现安全 HIGH/CRITICAL，也必须输出 `FAIL` 和 `DO_NOT_INSTALL`。

## 目录

```text
skill-mentor/
├── SKILL.md                         # Agent 入口与不可跳过门禁
├── AGENTS.md                        # 仓库维护约束
├── agents/openai.yaml               # Codex UI 元数据
├── references/                      # 按需加载的详细规范
├── scripts/inspect_skill.py         # 只读、离线静态检查器
├── tests/test_inspect_skill.py      # 检查器回归测试
└── evals/evals.json                 # 触发、功能与压力评测样例
```

Agent 执行以 `SKILL.md` 为唯一入口；本 README 只供维护者了解仓库和运行验证。

## 本地验证

要求：Python 3.10 或更高版本。检查器只使用标准库，不需要安装第三方依赖。

```powershell
python scripts/inspect_skill.py . --format text
python scripts/inspect_skill.py . --format json
python -m unittest discover -s tests -v
python C:/Users/KMW_E/.codex/skills/.system/skill-creator/scripts/quick_validate.py .
```

检查器退出码：

- `0`：检查完成，未发现 HIGH/CRITICAL；不代表已证明安全。
- `1`：检查完成，发现 HIGH/CRITICAL。
- `2`：目标或 frontmatter INVALID，或者无法完成读取。

## 安全模型

`scripts/inspect_skill.py` 不会执行、导入、安装或编译被审计 Skill 的任何内容。它只读取 UTF-8 文本，检查：

- frontmatter 与目录命名。
- 本地 Markdown 断链和越界引用。
- 私钥头、常见 Token 形态和疑似硬编码秘密。
- Python AST 中的动态执行、`shell=True` 和环境变量到网络写入线索。
- Shell/PowerShell 下载后执行模式。
- 双向覆盖和零宽 Unicode 字符。

外部安全扫描器属于可选增强。仓库不会自动安装 SkillSpector 或 Cisco Skill Scanner；未执行必须在正式审计报告中标记 `NOT_RUN`。

## 安装

仓库地址：[YeeKuson/skill-mentor](https://github.com/YeeKuson/skill-mentor)

安装到 Codex 用户级 Skills 目录：

```powershell
git clone https://github.com/YeeKuson/skill-mentor.git "$env:USERPROFILE\.codex\skills\skill-mentor"
```

安装后重新开始一个 Codex 任务，即可通过 `$skill-mentor` 显式调用，也可以让 Codex 根据任务描述自动触发。

## 维护方式

1. 先更新权威规范文件，避免同一规则散落多处。
2. 修改检查器时先添加能复现问题的测试，再做最小修复。
3. 运行单元测试、Skill 格式验证和自检。
4. 对触发或行为改动，使用 `evals/evals.json` 做旧版/新版或有 Skill/无 Skill 对比。
5. 不把临时评测输出、备份或报告写进 Skill 包。

详细规则见：

- [评分规范](references/scoring-rubric.md)
- [审计清单](references/audit-checklist.md)
- [安全策略](references/security-policy.md)
- [报告契约](references/report-contracts.md)
- [优化手册](references/optimization-playbook.md)
- [评测手册](references/evaluation-playbook.md)
- [调研依据](references/research-notes.md)

## 发布状态

- GitHub：<https://github.com/YeeKuson/skill-mentor>
- 可见性：Public
- 默认分支：`main`
- 本地安装：已验证
- 自动发布与覆盖更新：不提供；版本更新应显式执行并重新验证
