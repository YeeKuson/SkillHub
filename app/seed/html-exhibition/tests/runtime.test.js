"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const runtime = require("../assets/runtime/deck-runtime.js");

function event(key, extras) {
  return Object.assign({ key, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }, extras || {});
}

test("maps common clicker next keys", () => {
  ["ArrowRight", "ArrowDown", "PageDown", " "].forEach((key) => {
    assert.equal(runtime.actionForKeyboardEvent(event(key)), "next");
  });
});

test("maps common clicker previous keys", () => {
  ["ArrowLeft", "ArrowUp", "PageUp"].forEach((key) => {
    assert.equal(runtime.actionForKeyboardEvent(event(key)), "previous");
  });
  assert.equal(runtime.actionForKeyboardEvent(event(" ", { shiftKey: true })), "previous");
});

test("preserves browser and system modifier shortcuts", () => {
  assert.equal(runtime.actionForKeyboardEvent(event("ArrowRight", { ctrlKey: true })), null);
  assert.equal(runtime.actionForKeyboardEvent(event("f", { metaKey: true })), null);
});

test("maps first, last, fullscreen, help and escape", () => {
  assert.equal(runtime.actionForKeyboardEvent(event("Home")), "first");
  assert.equal(runtime.actionForKeyboardEvent(event("End")), "last");
  assert.equal(runtime.actionForKeyboardEvent(event("F")), "fullscreen");
  assert.equal(runtime.actionForKeyboardEvent(event("?")), "help");
  assert.equal(runtime.actionForKeyboardEvent(event("Escape")), "escape");
});
