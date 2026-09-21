# 版式原型

每页选择一个原型，不临时发明布局。外层统一使用带唯一 ID 的 `[data-slide]`；`scroll` 可附加 `.section`，`stage` 可附加 `.stage-slide`。

## 原型表

| 原型 | 用途 | 内容预算 |
|---|---|---|
| `cover` | 钩子与定位 | 1 个标题 + 1 个补充句 |
| `statement` | 核心判断 | 1 个完整判断 |
| `problem-scene` | 具体痛点 | 2—3 个场景事实 + 1 个代价 |
| `mechanism` | 工作机制 | 3—5 个状态 + 1 个概念动画 |
| `code-focus` | 关键实现 | 8—14 行代码 + 1 句解释 |
| `evidence` | 数据证据 | 1 个结论 + 最多 3 个指标 |
| `compare` | 前后对比 | 两列，每列最多 3 点 |
| `list-reveal` | 逐项论证 | 3—5 个 `data-fragment` |
| `closing` | 收束与下一步 | 1 个记忆点 + 1 个行动 |

## 通用骨架

```html
<section class="stage-slide" data-slide id="slide-03" aria-label="第 3 页">
  <div class="stack">
    <p class="eyebrow">03 / Evidence</p>
    <h2 class="heading">结论必须先于指标。</h2>
    <div class="cols-3" data-fragment>...</div>
  </div>
</section>
```

## 纪律

- 默认左对齐；居中只用于明确的封面或单句转场。
- 一页一个视觉焦点，强调色只服务该焦点。
- 超过内容预算就拆页或删减，不缩小字号硬塞。
- 文案、数据和代码必须来自已验证材料；占位内容不得进入交付。
- 所有原型都要通过窄屏、溢出、翻页和打印检查。
