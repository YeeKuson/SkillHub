/*
 * HTML Exhibition deck runtime.
 * Contract: navigation changes slide/fragment state only; it never rewrites content.
 */
(function (global) {
  "use strict";

  var NEXT_KEYS = ["ArrowRight", "ArrowDown", "PageDown", " ", "Spacebar"];
  var PREVIOUS_KEYS = ["ArrowLeft", "ArrowUp", "PageUp"];

  function actionForKeyboardEvent(event) {
    if (!event || event.ctrlKey || event.altKey || event.metaKey) return null;
    var key = event.key;
    if ((key === " " || key === "Spacebar") && event.shiftKey) return "previous";
    if (NEXT_KEYS.indexOf(key) !== -1) return "next";
    if (PREVIOUS_KEYS.indexOf(key) !== -1) return "previous";
    if (key === "Home") return "first";
    if (key === "End") return "last";
    if (key === "f" || key === "F") return "fullscreen";
    if (key === "?" || (key === "/" && event.shiftKey)) return "help";
    if (key === "Escape") return "escape";
    return null;
  }

  function isEditableTarget(target) {
    if (!target || !target.closest) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
  }

  function isNativeActivationTarget(target) {
    if (!target || !target.closest) return false;
    return Boolean(target.closest("button, a[href], summary"));
  }

  function create(options) {
    options = options || {};
    var documentRef = options.document || global.document;
    if (!documentRef) throw new Error("DeckRuntime requires a document.");

    var root = options.root || documentRef.querySelector("[data-deck]");
    if (!root) throw new Error("DeckRuntime could not find [data-deck].");

    var slides = Array.prototype.slice.call(root.querySelectorAll("[data-slide]"));
    if (!slides.length) throw new Error("DeckRuntime requires at least one [data-slide].");

    var mode = root.dataset.deckMode || documentRef.documentElement.dataset.deckMode || "scroll";
    var reducedMotion = Boolean(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var help = documentRef.querySelector("[data-deck-help]");
    var debug = documentRef.querySelector("[data-key-debug]");
    var progress = documentRef.querySelector("[data-deck-progress]");
    var index = 0;
    var observer = null;

    function indexFromHash() {
      var hash = (global.location && global.location.hash || "").replace(/^#\/?/, "");
      if (!hash) return 0;
      var numeric = Number(hash);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= slides.length) return numeric - 1;
      var found = slides.findIndex(function (slide) { return slide.id === hash; });
      return found >= 0 ? found : 0;
    }

    function updateProgress() {
      if (!progress) return;
      var ratio = (index + 1) / slides.length;
      progress.style.transform = "scaleX(" + ratio + ")";
      progress.setAttribute("aria-valuenow", String(index + 1));
      progress.setAttribute("aria-valuemin", "1");
      progress.setAttribute("aria-valuemax", String(slides.length));
    }

    function updateHash() {
      var slide = slides[index];
      if (!slide || !slide.id || !global.history || !global.history.replaceState) return;
      global.history.replaceState(null, "", "#" + slide.id);
    }

    function emitChange() {
      if (!global.CustomEvent || !root.dispatchEvent) return;
      root.dispatchEvent(new global.CustomEvent("deckchange", {
        bubbles: true,
        detail: { index: index, slide: slides[index], mode: mode }
      }));
    }

    function setCurrent(nextIndex, navigationOptions) {
      navigationOptions = navigationOptions || {};
      var bounded = Math.max(0, Math.min(slides.length - 1, nextIndex));
      index = bounded;
      slides.forEach(function (slide, slideIndex) {
        var active = slideIndex === index;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-current", active ? "page" : "false");
        if (mode === "stage") slide.setAttribute("aria-hidden", active ? "false" : "true");
      });
      if (mode === "scroll" && navigationOptions.scroll !== false) {
        slides[index].scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }
      updateProgress();
      if (navigationOptions.hash !== false) updateHash();
      emitChange();
      return index;
    }

    function hiddenFragments(slide) {
      return Array.prototype.slice.call(slide.querySelectorAll("[data-fragment]:not(.is-visible)"));
    }

    function visibleFragments(slide) {
      return Array.prototype.slice.call(slide.querySelectorAll("[data-fragment].is-visible"));
    }

    function next() {
      var fragments = hiddenFragments(slides[index]);
      if (fragments.length) {
        fragments[0].classList.add("is-visible");
        fragments[0].setAttribute("aria-hidden", "false");
        return index;
      }
      return setCurrent(index + 1);
    }

    function previous() {
      var fragments = visibleFragments(slides[index]);
      if (fragments.length) {
        var fragment = fragments[fragments.length - 1];
        fragment.classList.remove("is-visible");
        fragment.setAttribute("aria-hidden", "true");
        return index;
      }
      return setCurrent(index - 1);
    }

    function toggleFullscreen() {
      if (documentRef.fullscreenElement && documentRef.exitFullscreen) {
        return documentRef.exitFullscreen();
      }
      if (root.requestFullscreen) return root.requestFullscreen();
      return null;
    }

    function setOverlayVisible(element, visible) {
      if (!element) return false;
      element.hidden = !visible;
      element.setAttribute("aria-hidden", visible ? "false" : "true");
      return visible;
    }

    function toggleHelp() {
      if (!help) return false;
      return setOverlayVisible(help, help.hidden);
    }

    function closeOverlays() {
      var changed = false;
      if (help && !help.hidden) { setOverlayVisible(help, false); changed = true; }
      if (debug && !debug.hidden) { setOverlayVisible(debug, false); changed = true; }
      return changed;
    }

    function execute(action) {
      if (action === "next") { next(); return true; }
      if (action === "previous") { previous(); return true; }
      if (action === "first") { setCurrent(0); return true; }
      if (action === "last") { setCurrent(slides.length - 1); return true; }
      if (action === "fullscreen") {
        var result = toggleFullscreen();
        if (result && result.catch) result.catch(function (error) { global.console.warn("Fullscreen request failed:", error); });
        return Boolean(result);
      }
      if (action === "help") { toggleHelp(); return Boolean(help); }
      if (action === "escape") return closeOverlays();
      return false;
    }

    function showDebug(event, action) {
      if (!debug) return;
      debug.hidden = false;
      debug.setAttribute("aria-hidden", "false");
      debug.textContent = "key=" + String(event.key) + " | code=" + String(event.code) + " | action=" + String(action || "none");
    }

    function onKeyDown(event) {
      if (isEditableTarget(event.target)) return;
      var action = actionForKeyboardEvent(event);
      var params = global.URLSearchParams && global.location ? new global.URLSearchParams(global.location.search) : null;
      if (params && params.get("keydebug") === "1") showDebug(event, action);
      if (!action || event.repeat) return;
      if (isNativeActivationTarget(event.target) && (event.key === " " || event.key === "Spacebar")) return;
      if (execute(action)) event.preventDefault();
    }

    function observeScrollMode() {
      if (mode !== "scroll" || !global.IntersectionObserver) return;
      observer = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
          var nextIndex = slides.indexOf(entry.target);
          if (nextIndex >= 0 && nextIndex !== index) setCurrent(nextIndex, { scroll: false });
        });
      }, { threshold: [0.5, 0.75] });
      slides.forEach(function (slide) { observer.observe(slide); });
    }

    index = indexFromHash();
    setCurrent(index, { scroll: false, hash: false });
    slides.forEach(function (slide) {
      Array.prototype.slice.call(slide.querySelectorAll("[data-fragment]")).forEach(function (fragment) {
        fragment.setAttribute("aria-hidden", fragment.classList.contains("is-visible") ? "false" : "true");
      });
    });
    documentRef.addEventListener("keydown", onKeyDown);
    observeScrollMode();

    return {
      destroy: function () {
        documentRef.removeEventListener("keydown", onKeyDown);
        if (observer) observer.disconnect();
      },
      getIndex: function () { return index; },
      getMode: function () { return mode; },
      goTo: setCurrent,
      next: next,
      previous: previous,
      execute: execute
    };
  }

  var api = {
    create: create,
    actionForKeyboardEvent: actionForKeyboardEvent,
    isEditableTarget: isEditableTarget
  };

  global.DeckRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(typeof window !== "undefined" ? window : globalThis));
