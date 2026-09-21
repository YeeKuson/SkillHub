(function () {
  "use strict";

  var deck = window.DeckRuntime.create();
  var stage = document.querySelector("[data-concept-stage]");
  var replay = document.querySelector("[data-replay]");

  if (replay && stage) replay.addEventListener("click", function () { window.ShowcaseConcept.replay(stage); });
  document.querySelector("[data-deck]").addEventListener("deckchange", function (event) {
    var activeStage = event.detail.slide.querySelector("[data-concept-stage]");
    if (activeStage) window.ShowcaseConcept.replay(activeStage);
  });

  window.ShowcaseDeck = deck;
}());
