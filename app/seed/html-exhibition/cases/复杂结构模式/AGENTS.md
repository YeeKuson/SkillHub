# Project AGENTS.md

## Project Summary

这是一个原生 HTML/CSS/JS 的滚动长页展示案例。本目录演示模块化结构，相邻目录演示单 HTML 结构。

## Entry

- 推荐打开：`void-database-showcase.html`
- 单文件对比：`../单HTML模式/void-database-single-file.html`
- 推荐入口位于目录根层；它会加载全部 CSS/JS，用户不需要打开其他文件。

## Structure

- `void-database-showcase.html`: 模块化版本唯一推荐入口和语义内容。
- `styles/void-database-theme.css`: 设计 token、基础样式和通用组件。
- `styles/void-database-page.css`: 当前展示版式和响应式规则。
- `styles/void-database-motion.css`: 概念动画、入场动画和 reduced-motion。
- `scripts/void-database-main.js`: 页面启动、导航、计数和滚动触发。
- `scripts/void-database-concept-animation.js`: 概念动画重播逻辑。
- `brief.md`: 展示约束和隐私边界。
- `../单HTML模式/void-database-single-file.html`: 相邻目录中的单文件效果入口。

## Commands

- Direct: 打开 `void-database-showcase.html`。
- Serve: 在 `html-exhibition` 根目录运行 `python -m http.server 8087 --bind 127.0.0.1`。
- URL: `http://127.0.0.1:8087/实战案例分享/复杂结构模式/void-database-showcase.html`

## Potential Development Issues

- 入口依赖的 CSS/JS 必须保持相对路径。
- 动效不得修改布局属性，并应支持 reduced-motion。
- 页面变更后需要检查桌面端、移动端、横向溢出和控制台。
- 公开文档不得记录私人对话、修改历史、本地路径或凭据信息。

## Rules

- 新功能只需通过 `void-database-showcase.html` 一个入口即可使用。
- 文案事实和隐私边界以 `brief.md` 为准。
- 动效只改变 `transform` 和 `opacity`。
- 文档只说明文件职责、工程约束和潜在问题，不解释案例内容。
