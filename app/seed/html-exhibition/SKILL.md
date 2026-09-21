---
name: html-exhibition
description: 把项目、产品、想法、研究成果或复盘内容制作成可直接打开的 HTML 演示网页或现场幻灯片。用户提到“做演示、项目展示、网页汇报、HTML slides、答辩、路演、翻页笔、演讲者模式、把项目讲出来”时使用。先理解事实并组织叙事，再按场合选择滚动阅读或逐页演讲、单文件或模块化结构、默认品牌主题或 34 套设计模板。不要用于普通网站、后台系统、营销落地页、原生 PPTX 编辑或只需润色讲稿的任务。
---

# HTML Exhibition

把演示对象转成一条可验证的网页叙事。视觉负责放大判断，不替代事实、结构和证据。

## 成功标准

交付必须同时满足：

1. 观众能复述唯一核心结论。
2. 每个事实、数字和概念动画都有来源或用户确认。
3. 输出模式、主题和内容密度适合演示场合。
4. 根层只有一个语义化 HTML 入口，直接打开即可使用。
5. 现场模式支持键盘和翻页笔；所有模式支持 reduced-motion。
6. 静态验证与真实浏览器检查均已执行；无法执行的项目明确标为 `NOT_RUN`。

## 路由入口

先读取 [路由契约](references/routing.md)，确定两个正交维度：

- 阅读方式：`scroll`（自助阅读）或 `stage`（现场逐页演讲）。
- 工程结构：`single`（单 HTML）或 `modular`（HTML/CSS/JS 分离）。

用户提到答辩、路演、现场演讲、翻页、翻页笔、演讲者视图或 PDF 导出时，默认 `stage`。用户未选择工程结构时默认 `modular`。创建文件前仍须说明两种工程结构；用户说“直接做／按默认”即选择 `modular`。

## 不可跳过的工作流

完整产物、状态和恢复规则见 [工作流契约](references/workflow.md) 与 [内容数据契约](references/content-contract.md)。

### 1. 理解

按项目文档、核心实现、测试、Git diff、用户补充的顺序建立事实账本。回答：真问题、核心洞察、真实机制、证据、边界、观众最终记住的一句话。

输出 `brief.json`。信息不足时只问会改变叙事、事实或模式的关键问题。用户要求直接生成时，允许采用明确标记的默认值，但不得编造事实。

### 2. 叙事

读取 [叙事弧线](references/narrative-arcs.md)，选择项目、想法或成果弧线。每页只承担一个目的，并为每页定义核心信息、证据、内容预算、版式和概念动画。

输出 `outline.json`。生成页面前向用户展示核心结论、逐页大纲和概念动画设想；用户已明确授权“按规划一次完成”时，可把该授权记录到 checkpoint 后继续。

### 3. 模板

读取 [模板选择](references/template-selection.md) 和轻量目录 `references/template-pack/selection-index.json`。按 tone、mood、formality、density、CJK、场合约束匹配，不按行业硬套。

默认提供三个候选：一个稳妥、一个鲜明、一个探索型。只读取候选的 `preview.md`；用户选中后只读取该模板的 `design.md`。用户未选择时使用 `terminal-mint`。

### 4. 生成

按路由复制对应脚手架：

- `scroll + modular`：`assets/scaffolds/scroll/`
- `stage + modular`：`assets/scaffolds/stage/`
- `single`：用相同内容与运行时生成单文件版本，不把它作为复杂项目的长期开发源。

使用 `assets/runtime/` 的基础样式、动效和导航，不重新发明翻页逻辑。设计 token 来自选定主题；布局来自 [版式原型](references/layout-archetypes.md)；动画遵守 [动效语法](references/motion-grammar.md) 与 [动画系统](references/animation-system.md)。

### 5. 验证

读取 [验证契约](references/validation.md)。依次执行：

1. `python scripts/validate_skill.py .`
2. `python scripts/validate_deck.py <输出目录或入口 HTML>`
3. `node --check` 检查所有生成的 JavaScript。
4. 在真实浏览器检查桌面、窄屏、控制台、横向溢出、键盘与翻页笔导航。

任何必需检查失败都不得交付为“完成”。浏览器或硬件不可用时写 `NOT_RUN` 和复现步骤。

### 6. 交付与修订

交付必须写明“请打开：`具体文件名.html`”，并生成 `deck-manifest.json`。后续修订先读 manifest；影响不超过一半页面时局部修改，超过一半或更换模板时重跑叙事／生成阶段。详见 [恢复与修订](references/recovery.md)。

## 能力自适应

- 8 页以内且无复杂机制：单 Agent 可按阶段执行。
- 9 页以上、两个以上概念动画或大量资料：可分 Planner、Writer、Verifier。
- 有子 Agent 时，每批写独立 fragment 文件；禁止并行追加同一 JSON。
- 没有子 Agent 时，由同一 Agent按相同产物契约顺序执行，不降低验证要求。

多 Agent 是性能优化，不是正确性的前提。主 Agent 可以在简单任务中生成内容，但必须遵守 checkpoint、数据契约和验证门。

## 翻页笔契约

现场模式必须加载 `assets/runtime/deck-runtime.js`。默认映射：

- 下一步：`ArrowRight`、`ArrowDown`、`PageDown`、`Space`。
- 上一步：`ArrowLeft`、`ArrowUp`、`PageUp`、`Shift+Space`。
- 首尾页：`Home`、`End`；全屏：`F`；帮助：`?`；关闭浮层：`Escape`。

先推进当前页 fragment，再切换页面。输入框和可编辑区域不截获按键。未知硬件使用 `?keydebug=1` 查看 `event.key`／`event.code`，不得声称兼容未经测试的型号。完整规则见 [交互契约](references/interaction-contract.md)。

## 工程红线

- 不使用 React、Vue 或构建流程；默认纯 HTML/CSS/JS。
- 新入口禁用 `index.html`、`home.html`、`main.html`、`default.html`。
- 动画只修改 `transform` 和 `opacity`；数字变化只改 `textContent`。
- 默认输出不依赖 `@latest` CDN JavaScript；外部资源必须固定版本并获用户同意。
- 不把密钥、本地绝对路径、私人对话、未授权素材或未经验证的数据写入产物。
- 不静默跳过缺失资源、浏览器检查、脚本失败或用户确认。

## 资源地图

- [路由契约](references/routing.md)：选择 scroll／stage 与 single／modular。
- [工作流契约](references/workflow.md)：阶段、产物、失败与完成定义。
- [内容数据契约](references/content-contract.md)：brief、outline、fragment、checkpoint、manifest Schema。
- [模板选择](references/template-selection.md)：Tone-First 匹配与 34 模板渐进加载。
- [叙事弧线](references/narrative-arcs.md)：项目、想法、成果三类叙事。
- [版式原型](references/layout-archetypes.md)：页面职责与内容预算。
- [动效语法](references/motion-grammar.md)／[动画系统](references/animation-system.md)：概念动画与实现纪律。
- [交互契约](references/interaction-contract.md)：键盘、翻页笔、焦点、fragment 和全屏。
- [验证契约](references/validation.md)：静态、浏览器、硬件和交付门禁。
- [恢复与修订](references/recovery.md)：checkpoint、manifest、重试和局部修订。
