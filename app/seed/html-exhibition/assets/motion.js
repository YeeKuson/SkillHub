/*
 * motion.js —— 极小动画工具（纯浏览器原生 Web Animations API，0 依赖、0 第三方库）
 *
 * 为什么不引第三方库：
 *   真正轻量的 Motion mini(2.3KB)无法干净离线；其独立构建膨胀到 ~135KB，违背“不臃肿”。
 *   浏览器原生 WAAPI(element.animate)内置、0KB、GPU 加速，正好满足“只动 transform/opacity”。
 *   只有极少数场景(弹簧物理、SVG 路径变形)才需要 Motion/anime，见 references/animation-system.md。
 *
 * 用法(经典脚本，免构建)：
 *   <script src="assets/motion.js"></script>
 *   然后用全局 MX.countUp(...) / MX.revealStagger(...) / MX.onDeckChange(...) / MX.onEnterView(...)
 *   滚动长页用 onEnterView；统一演示运行时用 onDeckChange。
 *
 * 铁律：下面所有动画只碰 transform 和 opacity，保证 60fps。数字滚动只改 textContent，不触发 layout。
 */
(function (global) {
  "use strict";

  // 尊重系统“减少动态效果”：开启时所有动画直接给终态，不播放
  var REDUCED = global.matchMedia &&
                global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)"; // 减速进入，干净利落

  function toEls(targets) {
    if (typeof targets === "string") return Array.prototype.slice.call(document.querySelectorAll(targets));
    if (targets instanceof Element) return [targets];
    return Array.prototype.slice.call(targets || []);
  }

  /**
   * 错峰入场：一组元素依次上浮淡入（CSS 的 .stagger 的 JS 版，可在翻页时重放）。
   * @param targets 选择器 / 元素 / 元素数组
   * @param opts { y 位移px, dur 时长ms, gap 每项间隔ms, delay 起始延迟ms }
   */
  function revealStagger(targets, opts) {
    opts = opts || {};
    var y = opts.y == null ? 24 : opts.y;
    var dur = opts.dur == null ? 450 : opts.dur;
    var gap = opts.gap == null ? 80 : opts.gap;
    var delay = opts.delay == null ? 0 : opts.delay;
    toEls(targets).forEach(function (el, i) {
      if (REDUCED) { el.style.opacity = 1; el.style.transform = "none"; return; }
      el.animate(
        [
          { opacity: 0, transform: "translateY(" + y + "px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        { duration: dur, delay: delay + i * gap, easing: EASE_OUT, fill: "both" }
      );
    });
  }

  /**
   * 数字滚动：把元素文本从 from 滚到 to（用于证据/数据页的强调）。
   * @param el 目标元素
   * @param to 目标数值
   * @param opts { from, dur ms, decimals 小数位, prefix, suffix }
   */
  function countUp(el, to, opts) {
    opts = opts || {};
    var from = opts.from == null ? 0 : opts.from;
    var dur = opts.dur == null ? 1200 : opts.dur;
    var dec = opts.decimals == null ? 0 : opts.decimals;
    var prefix = opts.prefix || "";
    var suffix = opts.suffix || "";
    function render(v) { el.textContent = prefix + v.toFixed(dec) + suffix; }
    if (REDUCED) { render(to); return; }
    var start = null;
    var easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
    function tick(now) {
      if (start == null) start = now;
      var p = Math.min((now - start) / dur, 1);
      render(from + (to - from) * easeOutCubic(p));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /**
   * 页面切换重放：监听 deck-runtime 派发的 deckchange 事件。
   * @param root 监听目标，通常为 document
   * @param handler function(slideEl, detail){...}
   */
  function onDeckChange(root, handler) {
    root = root || document;
    root.addEventListener("deckchange", function (event) {
      handler(event.detail && event.detail.slide, event.detail || {});
    });
  }

  /**
   * 滚动进入触发：滚动长页的主力交互原语。元素滚进视口时调用 handler——
   * 用来"滚到才播概念动画 / 才入场"，没看见就不空转。
   * @param targets 选择器 / 元素 / 元素数组
   * @param handler function(el){...}，元素进入视口时调用（典型：el.classList.add('play')）
   * @param opts { once 只触发一次(默认 true), threshold 露出比例(默认 .35), rootMargin }
   */
  function onEnterView(targets, handler, opts) {
    opts = opts || {};
    var once = opts.once !== false;
    var threshold = opts.threshold == null ? 0.35 : opts.threshold;
    var els = toEls(targets);
    // 不支持 IntersectionObserver（极旧浏览器）或 reduced-motion：直接触发，给终态
    if (REDUCED || !global.IntersectionObserver) {
      els.forEach(function (el) { handler(el); });
      return;
    }
    var io = new global.IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        handler(e.target);
        if (once) io.unobserve(e.target);
      });
    }, { threshold: threshold, rootMargin: opts.rootMargin || "0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  global.MX = {
    revealStagger: revealStagger,
    countUp: countUp,
    onDeckChange: onDeckChange,
    onEnterView: onEnterView
  };
})(window);
