# 报告与 JSON 契约

## 目录

- [共同规则](#共同规则)
- [Scan 报告](#scan-报告)
- [Audit 报告](#audit-报告)
- [Overhaul 报告](#overhaul-报告)
- [JSON 契约](#json-契约)
- [建议格式](#建议格式)

## 共同规则

- 结论先行，先写 Validation、发布建议和最高严重度问题。
- 每个 finding 使用稳定 ID，例如 `SEC-001`、`AUD-006`、`D4-002`。
- 每个事实附证据锚点；推断明确标注“推断”。
- 分开显示基础分、加分、等级封顶和安全结论。
- 所有 `NOT_RUN`、`NOT_APPLICABLE`、降级和未读文件必须显式列出。
- 路径和秘密脱敏；不得在报告中完整复制攻击载荷或真实凭证。

## Scan 报告

```markdown
# Skill 快速扫描报告

Skill 名称：{name}
目标：{path_or_source}
模式：Scan
类型标注：{primary}[ / {secondary}]
Validation：{PASS|CONDITIONAL|FAIL|INVALID}
综合评分：{grade} ({score}/10)
置信度：{high|medium|low}

## 结论
{一段话说明能否使用、最重要风险和首要动作}

## 8 维评分
| 维度 | 得分 | 权重 | 加权分 | 证据 |
|---|---:|---:|---:|---|
| D1 元数据 | x | 15% | x.xx | file:line |
...

基础分：{base}/100
最佳实践加分：+{bonus}/10
最终分：{final}/10
等级封顶：{none 或原因}

## 关键问题
- [HIGH][AUD-001] {问题} — 证据：{anchor}
- [MEDIUM][D4-001] {问题} — 证据：{anchor}

## 优先建议
1. {具体修改、位置、收益、验证}
2. {具体修改、位置、收益、验证}

## 限制与未执行项
- {NOT_RUN/DEGRADED/未读资源}
```

Scan 不得输出没有执行的九项审计为“通过”。如安全检查发现 HIGH/CRITICAL，仍在结论首屏显示 FAIL。

## Audit 报告

在 Scan 全部内容后追加：

```markdown
## 安全扫描
| 层级 | 状态 | 工具/方法 | 最高风险 | 证据或限制 |
|---|---|---|---|---|
| L1 外部扫描 | PASS/FAIL/NOT_RUN | ... | ... | ... |
| L2 静态检查 | ... | ... | ... | ... |
| L3 语义注入 | ... | ... | ... | ... |

发布建议：SAFE / CAUTION / DO_NOT_INSTALL

## 9 项审计
| # | 检查项 | 严重度 | 状态 | 证据 | 修复 |
|---:|---|:---:|---|---|---|
...

审计汇总：HIGH {failed}/{total}，MEDIUM {failed}/{total}，LOW {failed}/{total}

## 最佳实践加分
| 项目 | 分值 | 状态 | 证据 |
|---|---:|---|---|
...

## 六层设计分析
### 1. 触发契约
现状 / 证据 / 缺口 / 影响 / 改进
...

## 六类横向质量
- 触发与安全性：{结论 + finding IDs}
...
```

## Overhaul 报告

在 Audit 全部内容后追加：

```markdown
## 四象限抽取
| 内容 | 象限 | 处理 | 理由 |
|---|---|---|---|

## 认知框架分析
观察输入 → 假设 → 决策 → 动作 → 证据反馈

## 趋势预测
| 预测 | 证据日期 | 时间窗口 | 置信度 | 稳健动作 |
|---|---|---|---|---|

## 重构方案
| 优先级 | 修改位置 | 单一假设 | 验证方式 | 回退方式 |
|---|---|---|---|---|

## Karpathy Loop 记录
| 轮次 | 假设 | 改动 | 基线 | 结果 | 决定 |
|---:|---|---|---|---|---|

## 结构化数据
```json
{符合下方契约的对象}
```
```

未获修改授权时，Karpathy Loop 写 `not_started: authorization_required`，不要伪造记录。

## JSON 契约

JSON 必须可解析，不含注释。最低结构：

```json
{
  "schema_version": "1.0",
  "skill": {
    "name": "example-skill",
    "source": "redacted/path",
    "mode": "overhaul",
    "types": {"primary": "评估审计型", "secondary": "安全治理型", "scope": "focused"}
  },
  "validation": {
    "status": "CONDITIONAL",
    "install_recommendation": "CAUTION",
    "confidence": "medium",
    "degraded": true,
    "not_run": ["external_scanner"]
  },
  "security": {
    "highest_severity": "MEDIUM",
    "layers": [
      {"name": "external", "status": "NOT_RUN", "tool": null, "findings": []}
    ]
  },
  "score": {
    "base_100": 76.5,
    "bonus": 5,
    "final_10": 8.15,
    "grade": "A",
    "grade_cap": null,
    "dimensions": [
      {"id": "D1", "score": 8, "weight": 0.15, "weighted": 12.0, "evidence": ["SKILL.md:2"]}
    ]
  },
  "audits": [
    {"id": "AUD-001", "name": "framework", "severity": "HIGH", "status": "PASS", "evidence": ["SKILL.md:1"]}
  ],
  "findings": [
    {
      "id": "D4-001",
      "severity": "MEDIUM",
      "title": "异常路径不完整",
      "evidence": [{"path": "SKILL.md", "line": 42, "excerpt_redacted": "..."}],
      "impact": "失败时行为不确定",
      "recommendation": "为不可读引用增加显式降级状态",
      "verification": "使用缺失引用夹具运行审计，应输出 NOT_RUN"
    }
  ],
  "bonus": [],
  "analysis": {
    "six_layers": [],
    "quadrants": [],
    "cognitive_loop": [],
    "trends": []
  },
  "optimization": {
    "authorized": false,
    "backup": null,
    "max_iterations": 5,
    "iterations": [],
    "status": "authorization_required"
  }
}
```

枚举值：

- status：`PASS | FAIL | CONDITIONAL | INVALID | NOT_RUN | NOT_APPLICABLE`。
- severity：`CRITICAL | HIGH | MEDIUM | LOW | INFO | NONE`。
- install_recommendation：`SAFE | CAUTION | DO_NOT_INSTALL`。
- confidence：`high | medium | low`。

## 建议格式

每条建议写成一个可验证动作：

```text
[P1] 在 references/security-policy.md 的 L1 规则中增加扫描模式字段；
原因：当前无法区分静态扫描与 LLM 扫描；
收益：避免把低覆盖扫描误写成完整安全结论；
验证：使用 metadata.llm_used=false 的夹具，报告应显示 DEGRADED。
```

