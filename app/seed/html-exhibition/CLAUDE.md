# Project CLAUDE.md

## Project Summary

`html-exhibition` 是原生 HTML/CSS/JS 演示生成 Skill。路由为 `scroll|stage × modular|single`，统一运行时支持键盘、翻页笔、分步、进度、hash、全屏和打印。

## Structure

- `SKILL.md`：入口与行为合同。
- `assets/runtime/`、`assets/themes/`、`assets/scaffolds/`：运行时、主题和双模式脚手架。
- `references/`：内容、设计、动效、工程、恢复与验证规范。
- `scripts/`：可恢复生成、确定性装配、打包、manifest 和验证器。
- `evals/`、`tests/`：回归评测。

## Commands

- `python scripts/validate_skill.py`
- `node --test tests/runtime.test.js`
- `node --check assets/runtime/deck-runtime.js`
- `python scripts/validate_deck.py <entry.html>`
- `python -m http.server 8087 --bind 127.0.0.1`

## Critical Mistakes Already Made

- frontmatter 名称必须与 `html-exhibition` 目录一致。
- 正式输出不得引用 Skill 目录外的 scaffold 样式。
- 不得让滚动与逐页模式各自维护键盘状态；统一使用 `[data-slide]` 运行时。

## Rules

- 默认 `scroll + modular`；翻页笔或演讲优先 `stage + modular`。
- 单文件由验证后的模块化版本打包，不长期直接维护。
- 根层只有一个语义化 HTML 入口，资源相对且可移植。
- 动画只改 `transform` / `opacity`，支持 reduced motion。
- 无框架、无构建、无 `@latest`；第三方资料只读并保留许可证。
- 所有改动通过静态测试和真实浏览器验证后才能标记完成。
