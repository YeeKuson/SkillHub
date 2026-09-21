# Scroll Modular Scaffold

用于异步浏览、项目展示和连续滚动叙事。

正式生成通过 `scripts/assemble_deck.py` 完成：传入本目录、独立 `batch-*.json` 片段目录、空输出目录和语义化入口名。装配器会替换 slide 标记区、合并片段 CSS/JS，并递归内联本地 CSS import，使输出不依赖 Skill 安装路径。

生成后依次运行 `validate_deck.py`、`node --check` 和真实浏览器回归。交付时只让用户打开根层语义化 HTML；单文件需求由 `bundle_deck.py` 从验证后的模块化版本产生。
