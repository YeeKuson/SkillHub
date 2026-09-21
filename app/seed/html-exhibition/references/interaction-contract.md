# 交互与翻页笔契约

## 导航键

| 动作 | 按键 |
|---|---|
| next | `ArrowRight`、`ArrowDown`、`PageDown`、`Space` |
| previous | `ArrowLeft`、`ArrowUp`、`PageUp`、`Shift+Space` |
| first／last | `Home`／`End` |
| fullscreen | `F` |
| help | `?` |
| close overlay | `Escape` |

stage 和 scroll 共用同一动作语义。下一步先显示当前页尚未显示的 `[data-fragment]`；全部显示后才进入下一页。上一步先回退 fragment，再进入上一页。

## 焦点规则

- `input`、`textarea`、`select`、`[contenteditable]` 内不截获任何导航键。
- `button`、`a` 上的 `Space`／`Enter` 保留原生激活行为。
- `PageUp`／`PageDown` 和方向键可在普通按钮聚焦时继续导航。
- `Ctrl`、`Alt`、`Meta` 组合键不截获；`Shift+Space` 是明确例外。
- 只有运行时实际执行动作时才 `preventDefault()`。

## 翻页笔兼容

翻页笔通常模拟键盘，但不同型号输出不同。默认覆盖 PageUp／PageDown 与方向键；未知型号打开 `?keydebug=1`，页面显示最近一次 `event.key`、`event.code` 和动作解析结果。

验收至少包含：

1. PageUp／PageDown 类型设备或等价模拟。
2. ArrowLeft／ArrowRight 类型设备或等价模拟。
3. 长按不会越过多页；运行时使用短间隔去抖。
4. 首尾页不会循环，除非用户明确开启 loop。

未经硬件测试只能报告 `clicker: NOT_RUN`，不得写“兼容所有翻页笔”。

## 全屏与可访问性

- 全屏只能由用户按 `F` 或点击按钮触发。
- `Escape` 优先关闭帮助／调试浮层，再交给浏览器退出全屏。
- 所有关键状态同时通过位置、文字或 `aria-current` 表达，不只靠颜色和动画。
- reduced-motion 下使用即时切换和 `scroll-behavior: auto`。
