# html-exhibition

`html-exhibition` 是一个用原生 HTML/CSS/JS 生成可演讲、可滚动、可验证 HTML 演示的 Agent Skill。它先建立内容合同和叙事，再选择模板并生成工程；翻页笔、键盘、进度、hash、全屏和分步内容由统一运行时负责。

> 📮 欢迎关注作者的微信公众号「海绵朋克」。更多 AI 开发实践和思考会在公众号分享。

<p align="center">
  <img src="assets/wechat-hmpunk.jpg" alt="微信公众号：海绵朋克" width="220" />
</p>

## 四种输出路由

两个维度正交选择：

| 观看方式 | 适用场景 |
|---|---|
| `scroll` | 网页浏览、异步分享、连续叙事 |
| `stage` | 现场演讲、课堂、会议、翻页笔 |

| 工程结构 | 适用场景 |
|---|---|
| `modular` | 默认；HTML/CSS/JS 分离，适合维护与迭代 |
| `single` | 明确需要一个文件时，由模块化版本打包产生 |

默认是 `scroll + modular`。提到翻页笔或现场演讲时优先 `stage + modular`。

## 翻页笔与键盘

统一运行时支持：

- 下一步：`ArrowRight`、`ArrowDown`、`PageDown`、`Space`。
- 上一步：`ArrowLeft`、`ArrowUp`、`PageUp`、`Shift+Space`。
- 首尾：`Home`、`End`；全屏：`F`；帮助：`?`；退出覆盖层：`Escape`。
- `stage` 模式采用 fragment-first；先展示当前页 `data-fragment`，再切到下一页。
- 输入框和可编辑控件拥有按键优先权；按钮上的 Space 保持点击。
- 添加 `?keydebug=1` 可显示现场键位调试信息。

翻页笔通常模拟上述键盘按键，因此无需厂商 SDK。不同硬件在正式演讲前仍应使用 `keydebug` 做一次实机确认。

## 34 套设计参考

`references/template-pack/` 收录 34 套模板的 `preview.md` 与 `design.md` 参考，索引在 `selection-index.json`。它们来自 `zarazhangrui/frontend-slides` 的固定提交，只作为设计选择资料，不执行第三方代码；来源和许可证见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

模板选择必须基于内容、受众、场景、密度与语气，不按顺序随意套用。默认主题仍是本仓库的 `terminal-mint`。

## 工作流

1. 建立内容合同：受众、目标、核心记忆点、证据、隐私边界。
2. 选择 `view × structure` 路由。
3. 先写逐页大纲与内容预算，再选择模板。
4. 从 `assets/scaffolds/scroll/` 或 `assets/scaffolds/stage/` 生成。
5. 用 checkpoint 保存阶段状态；分批产出片段并确定性装配。
6. 运行结构、脚本、键盘、浏览器和打印验证。
7. 生成 `deck-manifest.json`，明确唯一入口后交付。

多 Agent 仅在宿主支持且任务能安全拆分时使用；所有 Agent 先读同一份合同，片段只写到独立批次，由主 Agent 统一装配和验收。

## 常用命令

```powershell
python scripts/validate_skill.py
node --test tests/runtime.test.js
python scripts/validate_deck.py path/to/project-showcase.html
python scripts/bundle_deck.py --entry path/to/project-showcase.html --output path/to/project-showcase-single.html
python -m http.server 8087 --bind 127.0.0.1
```

入口必须位于输出目录根层并采用语义名称，例如 `agent-system-overview.html`；禁止使用 `index.html`、`home.html`、`main.html`、`default.html`。

## 安装

必须保留整个仓库结构；只复制 `SKILL.md` 会丢失运行时、模板、参考和验证器。

```text
请把 https://github.com/YeeKuson/html-exhibition 整个仓库安装为 html-exhibition skill，
保留 SKILL.md、agents、assets、references、scripts、evals、tests、examples 和案例目录。
安装后运行 python scripts/validate_skill.py。
```

## 目录

| 路径 | 作用 |
|---|---|
| `SKILL.md` | 触发边界、路由、流程和交付契约 |
| `agents/openai.yaml` | Skill UI 元数据 |
| `assets/runtime/` | 翻页、进度、打印和基础样式 |
| `assets/themes/` | 可复用视觉主题 |
| `assets/scaffolds/` | `scroll` / `stage` 模块化脚手架 |
| `references/` | 内容、版式、动效、工程、恢复和验证规范 |
| `references/template-pack/` | 34 套模板参考与固定来源许可证 |
| `scripts/` | checkpoint、装配、打包、清单与验证工具 |
| `evals/`、`tests/` | 触发评测与运行时回归测试 |
| `examples/` | 视觉和交互示例 |
| `cases/` | 历史实战输出 |

视觉改动必须在真实浏览器检查桌面、移动、控制台、横向溢出、键盘翻页、全屏和打印。源码检查不能替代视觉验收。
