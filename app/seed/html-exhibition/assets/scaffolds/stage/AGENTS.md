# Project AGENTS.md

## Project Summary

这是一个固定舞台 HTML 演示。一次只显示一个 `[data-slide]`，统一运行时负责键盘、翻页笔、fragment、进度、全屏和深链接。

## Entry

- Open: `project-showcase.html`
- 正式生成时改为与演示对象有关的语义化文件名。

## Structure

- `styles/theme.css`: 基础运行时与所选主题。
- `styles/page.css`: 当前展示独有布局。
- `styles/motion.css`: 概念动画与 reduced-motion。
- `scripts/deck-runtime.js`: 不得按页面重写的统一导航运行时。
- `scripts/main.js`: 当前展示接线。
- `scripts/concept-animation.js`: 当前对象专属概念动画。

## Commands

- Check JS: `node --check scripts/deck-runtime.js`
- Serve: `python -m http.server 8087 --bind 127.0.0.1`

## Rules

- 保留 `data-deck`、`data-deck-mode`、`data-slide` 和唯一 slide ID。
- 现场模式必须支持 PageUp／PageDown、方向键、Space、Home／End。
- 输入和可编辑区域不得被导航键劫持。
- 动画只改变 transform 和 opacity，并支持 reduced-motion。
- 根层只有一个推荐入口，交付前运行静态与浏览器验证。
