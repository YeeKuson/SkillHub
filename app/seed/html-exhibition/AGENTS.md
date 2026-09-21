# Project AGENTS.md

## Project Summary

`html-exhibition` 是用原生 HTML/CSS/JS 生成 HTML 演示的完整 Skill。观看方式分为 `scroll` 与 `stage`，工程结构分为 `modular` 与 `single`；默认 `scroll + modular`，翻页笔场景优先 `stage + modular`。

## Structure

- `SKILL.md`：触发、路由、生成和交付契约。
- `assets/runtime/`：统一翻页、分步、进度、hash、全屏与打印。
- `assets/themes/`：稳定主题。
- `assets/scaffolds/{scroll,stage}/`：模块化脚手架。
- `references/template-pack/`：34 套外部设计参考，仅作资料，不执行代码。
- `scripts/`：checkpoint、装配、单文件打包、manifest 和验证。
- `evals/`、`tests/`：触发与功能回归。

## Commands

- Skill：`python scripts/validate_skill.py`
- Runtime：`node --test tests/runtime.test.js`
- JS：`node --check assets/runtime/deck-runtime.js`
- Deck：`python scripts/validate_deck.py <entry.html>`
- Serve：`python -m http.server 8087 --bind 127.0.0.1`

## Critical Mistakes Already Made

- Skill frontmatter 名称与目录不一致会导致消费端无法稳定发现；必须保持 `name: html-exhibition`。
- 复制 scaffold 后保留指向 Skill 仓库的 CSS 路径会破坏可移植性；正式输出必须通过装配器内联本地 import 后再验证。
- 混用滚动逻辑与第三方逐页语义会形成两套导航状态；所有模式统一使用 `deck-runtime.js` 和 `[data-slide]`。

## Rules

- 入口使用根层语义化 HTML，禁止 `index.html`、`home.html`、`main.html`、`default.html`。
- 所有本地资源使用输出目录内的相对路径；不依赖 Skill 安装位置。
- 翻页键位、fragment-first、焦点保护、全屏和进度只有一套运行时实现。
- 动画关键帧只修改 `transform` 和 `opacity`，并支持 reduced motion。
- 默认无框架、无构建、无未固定版本 CDN；新增依赖前先论证并核对许可证。
- 生成前建立内容合同；未经验证的事实、占位符、凭据、本地绝对路径不得交付。
- 视觉改动必须做真实浏览器桌面、移动、键盘和打印验证。
- 第三方模板资料只读；来源和许可变更同步更新 `THIRD_PARTY_NOTICES.md`。
- 公开文档只记录产品结构、使用方式、约束和可复现问题，不记录私人对话或版本流水账。
