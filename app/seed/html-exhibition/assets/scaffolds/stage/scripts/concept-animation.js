(function () {
  "use strict";

  function replay(stage) {
    if (!stage) return;
    stage.classList.remove("is-playing");
    void stage.offsetWidth;
    stage.classList.add("is-playing");
  }

  window.ShowcaseConcept = { replay: replay };
}());
