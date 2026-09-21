(function () {
  "use strict";

  function replayConceptAnimation(stage) {
    stage.classList.remove("is-playing");
    void stage.offsetWidth;
    stage.classList.add("is-playing");
  }

  window.ShowcaseConcept = {
    replay: replayConceptAnimation
  };
}());
