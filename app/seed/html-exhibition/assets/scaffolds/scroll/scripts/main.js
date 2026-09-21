(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealItems = Array.prototype.slice.call(document.querySelectorAll(".reveal-item"));
  var conceptStage = document.querySelector("[data-concept-stage]");
  var replayButton = document.querySelector("[data-replay]");
  var deck = window.DeckRuntime.create();

  function revealElement(element) {
    element.classList.add("in-view");
  }

  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach(revealElement);
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        revealElement(entry.target);
        if (entry.target === conceptStage) {
          window.ShowcaseConcept.replay(conceptStage);
        }
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.18 });

    revealItems.forEach(function (element) {
      observer.observe(element);
    });
  }

  if (replayButton && conceptStage) {
    replayButton.addEventListener("click", function () {
      window.ShowcaseConcept.replay(conceptStage);
    });
  }

  window.ShowcaseDeck = deck;
}());
