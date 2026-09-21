# 工程结构

展示由两个互不混淆的维度决定：

- 观看方式：`scroll`（连续滚动）或 `stage`（逐页演讲）。
- 交付结构：`modular`（默认，可维护）或 `single`（明确需要单文件时）。

默认路由为 `scroll + modular`。现场演讲、课堂或明确提到翻页笔时优先 `stage + modular`。这两个维度不能再合并成“滚动版 / 单文件版”这样的单轴选项。

## 模块化结构

```text
showcase/
├── project-showcase.html       # 唯一根层入口，最终改为语义化名称
├── styles/
│   ├── theme.css
│   ├── page.css
│   ├── motion.css
│   └── print.css               # stage 必备
├── scripts/
│   ├── deck-runtime.js         # 键盘、翻页笔、进度、hash、全屏
│   ├── main.js
│   └── concept-animation.js
├── assets/
├── brief.md
└── AGENTS.md
```

入口必须使用语义名，如 `agent-system-overview.html`；禁止 `index.html`、`home.html`、`main.html`、`default.html`。所有引用使用输出目录内的相对路径。

通过 `scripts/assemble_deck.py` 从 `assets/scaffolds/scroll/` 或 `assets/scaffolds/stage/` 装配。装配器会内联 scaffold CSS 的本地 `@import`，避免输出依赖 skill 安装目录。

## 单文件结构

单文件不是另一套源码。先生成并验证模块化版本，再运行：

```powershell
python scripts/bundle_deck.py --entry output/project-showcase.html --output output/project-showcase-single.html
```

打包器只接受输出目录内的本地 CSS/JS，不下载远程依赖，也不允许路径逃逸。后续修改源文件并重新打包，禁止长期维护打包产物。

## 装配片段

每个 `batch-*.json`：

```json
{
  "slides": [
    {
      "id": "slide-03",
      "html": "<section data-slide id=\"slide-03\">...</section>",
      "css": "",
      "js": ""
    }
  ]
}
```

片段不得内嵌 `<script>`，ID 必须唯一，HTML 中必须出现声明的 ID。批次按文件名排序，装配前保留 checkpoint。

## 交付约束

- 根层只有一个推荐打开的语义化 HTML。
- `stage` 与 `scroll` 都加载 `deck-runtime.js`，都支持翻页笔常见键位。
- 交付时运行 `validate_deck.py` 并生成 `deck-manifest.json`。
- 直接打开和本地 HTTP 服务两种方式都应工作。
- 复杂视觉必须在真实浏览器检查桌面、移动、键盘和打印。
