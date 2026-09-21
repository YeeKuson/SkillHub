# Project AGENTS.md

## Project Summary

这是一个原生 HTML/CSS/JS 的滚动长页展示。HTML 负责语义内容，CSS 负责视觉与动效状态，JS 负责滚动、键盘和翻页笔交互。

## Entry

- Open: `project-showcase.html`
- 生成正式展示时必须把它重命名为与展示对象有关的语义化文件名。
- 用户只需要打开这一份 HTML；其他文件都是依赖，不是入口。

## Structure

- `project-showcase.html`: 唯一展示入口和语义内容。
- `styles/theme.css`: 设计 token 与通用组件。
- `styles/page.css`: 当前展示独有布局。
- `styles/motion.css`: 动效与 reduced-motion。
- `scripts/main.js`: 页面启动与通用交互。
- `scripts/deck-runtime.js`: 统一键盘、翻页笔、fragment、进度与定位。
- `scripts/concept-animation.js`: 展示对象专属概念动画。
- `brief.md`: 观众、叙事、事实与隐私边界。

## Commands

- Direct: 打开根层语义化 HTML 文件。
- Serve: `python -m http.server 8087 --bind 127.0.0.1`

## Potential Development Issues

- 不要把复杂展示的 HTML、CSS、JS 合并为长期维护的巨型单文件。
- 不要使用绝对路径引用 CSS、JS 或素材。
- 不要让动效修改布局属性或忽略 reduced-motion。
- 不要把私人对话、修改记录、账号、凭据或本地路径写入公开文档。

## Rules

- 根层只有一个推荐给用户打开的语义化 HTML 入口。
- 禁止使用 `index.html`、`home.html`、`main.html`、`default.html`。
- 动效只改变 `transform` 和 `opacity`。
- 不引入前端框架和构建流程。
- 隐私边界以 `brief.md` 为准。
- 文档只记录产品结构、约束和潜在问题，不记录开发过程。
