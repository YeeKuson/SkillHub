(function () {
  "use strict";

  function replayFlow(flowStage, reducedMotion) {
    if (!flowStage || reducedMotion) {
      return;
    }
    flowStage.classList.remove("play");
    void flowStage.getBoundingClientRect();
    flowStage.classList.add("play");
  }

  window.VoidDatabaseConcept = {
    replayFlow: replayFlow
  };
}());
