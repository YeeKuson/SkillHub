# Stage Modular Scaffold

用于答辩、路演、现场演讲、翻页笔和固定 16:9 输出。

正式生成通过 `scripts/assemble_deck.py` 完成：传入本目录、独立 `batch-*.json` 片段目录、空输出目录和语义化入口名。装配器会替换 slide 标记区、合并片段 CSS/JS，并递归内联本地 CSS import，使输出不依赖 Skill 安装路径。

生成后依次运行 `validate_deck.py`、`node --check` 和真实浏览器回归。单文件需求在模块化版本通过后使用 `bundle_deck.py` 产生，不直接维护打包产物。
