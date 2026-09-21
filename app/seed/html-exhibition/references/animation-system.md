# 动画与交互接线

默认使用 CSS、原生 WAAPI、`assets/motion.js` 和 `assets/runtime/deck-runtime.js`，不依赖框架或远程 CDN。

## 概念动画

1. 用一句话写清要演示的真实状态变化。
2. 建立固定舞台与稳定隐喻。
3. 用 `transform` / `opacity` 关键帧表达每个阶段。
4. 为减少动态效果提供静态终态。
5. 由视口进入或 `deckchange` 触发，并提供显式重播按钮。

```js
document.addEventListener("deckchange", function (event) {
  const slide = event.detail.slide;
  const stage = slide && slide.querySelector("[data-concept-stage]");
  if (stage) replay(stage);
});
```

滚动页面可使用：

```js
MX.onEnterView(document.querySelectorAll("[data-concept-stage]"), replay, {
  once: true,
  threshold: 0.4
});
```

## 分步内容

舞台页中的信息增量使用 `data-fragment`：

```html
<p data-fragment>第一次前进显示我。</p>
<p data-fragment>第二次前进显示我。</p>
```

运行时采用 fragment-first：前进先展示当前页片段，再进入下一页；后退先撤回当前页已显示片段，再回上一页。不要引入另一套翻页库。

## 第三方动画库

只有原生 WAAPI 无法清楚实现复杂路径、物理弹簧或长时间轴时才考虑。必须固定具体版本、记录理由、核对许可证并补齐离线与 reduced-motion 策略；不得使用 `@latest`。

## 性能与可访问性

- 动画属性仅限 `transform`、`opacity`。
- `will-change` 仅在确实运动的少量元素使用。
- 离屏或非当前页停止动画。
- 键盘焦点位于输入控件时不截获按键；按钮上的 Space 保持点击行为。
- 关键信息不能只靠动画或颜色表达。
