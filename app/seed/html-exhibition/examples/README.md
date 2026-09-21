# examples —— 品质与交互回归

- `gold-standard.html`：`scroll` 模式视觉锚点，覆盖主题、内容密度、滚动进度和键盘章节导航。
- `stage-clicker-demo.html`：`stage` 模式交互锚点，覆盖 fragment-first、翻页笔常见键位、按钮焦点和全屏。

启动本地服务后检查：

```powershell
python -m http.server 8087 --bind 127.0.0.1
```

访问 `http://127.0.0.1:8087/examples/gold-standard.html` 与 `http://127.0.0.1:8087/examples/stage-clicker-demo.html?keydebug=1`。这两个文件是验证锚点，不是内容模板；正式工程从 `assets/scaffolds/` 生成。
