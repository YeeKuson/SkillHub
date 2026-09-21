(function () {
  "use strict";

  var reducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var sections = Array.prototype.slice.call(document.querySelectorAll("[data-section]"));
  var dots = Array.prototype.slice.call(document.querySelectorAll(".nav-dot"));
  var progress = document.querySelector(".progress");
  var flowStage = document.querySelector(".flow-stage");
  var counted = new WeakSet();

  function setProgress() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    var ratio = maxScroll > 0 ? Math.min(Math.max(scrollTop / maxScroll, 0), 1) : 0;
    progress.style.transform = "scaleX(" + ratio + ")";
  }

  function setActiveSection(index) {
    dots.forEach(function (dot, dotIndex) {
      if (dotIndex === index) {
        dot.setAttribute("aria-current", "true");
      } else {
        dot.removeAttribute("aria-current");
      }
    });
  }

  function countUp(element) {
    if (counted.has(element)) {
      return;
    }
    counted.add(element);
    var target = Number(element.getAttribute("data-count"));
    if (reducedMotion) {
      element.textContent = String(target);
      return;
    }

    var startedAt = null;
    var duration = 900;

    function tick(now) {
      if (startedAt === null) {
        startedAt = now;
      }
      var progressValue = Math.min((now - startedAt) / duration, 1);
      var eased = 1 - Math.pow(1 - progressValue, 3);
      element.textContent = String(Math.round(target * eased));
      if (progressValue < 1) {
        window.requestAnimationFrame(tick);
      }
    }

    window.requestAnimationFrame(tick);
  }

  function playFlow() {
    window.VoidDatabaseConcept.replayFlow(flowStage, reducedMotion);
  }

  function revealElement(element) {
    element.classList.add("in-view");
    element.querySelectorAll("[data-count]").forEach(countUp);
  }

  if (!("IntersectionObserver" in window) || reducedMotion) {
    document.querySelectorAll(".reveal-item, .stagger").forEach(revealElement);
    document.querySelectorAll("[data-count]").forEach(countUp);
    if (flowStage) {
      flowStage.classList.add("play");
    }
  } else {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        revealElement(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.24 });

    document.querySelectorAll(".reveal-item, .stagger").forEach(function (element) {
      revealObserver.observe(element);
    });

    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        var sectionIndex = Number(entry.target.getAttribute("data-section"));
        setActiveSection(sectionIndex);
        if (entry.target.id === "s4") {
          playFlow();
        }
      });
    }, { threshold: 0.52 });

    sections.forEach(function (section) {
      sectionObserver.observe(section);
    });
  }

  document.querySelectorAll(".replay-flow").forEach(function (button) {
    button.addEventListener("click", playFlow);
  });

  window.addEventListener("scroll", setProgress, { passive: true });
  window.addEventListener("resize", setProgress, { passive: true });
  setProgress();
}());
