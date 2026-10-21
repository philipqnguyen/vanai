// Draggable HUD windows: where a dragged window is allowed to land.
//   node --test          (from client/ — Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import { clampWindow } from "../src/window-drag.ts";

const VW = 1440, VH = 900, HEAD = 40;

test("a window dropped inside the screen stays exactly where it was dropped", () => {
  assert.deepEqual(clampWindow(300, 120, 360, 500, VW, VH, HEAD), { left: 300, top: 120 });
});

test("a window dragged past any edge stops wholly on screen", () => {
  assert.deepEqual(clampWindow(-80, -30, 360, 500, VW, VH, HEAD), { left: 0, top: 0 });
  assert.deepEqual(clampWindow(1300, 700, 360, 500, VW, VH, HEAD), { left: 1080, top: 400 });
});

test("a window taller than the screen may hang off the bottom but keeps its header reachable", () => {
  const c = clampWindow(100, 2000, 360, 1200, VW, VH, HEAD);
  assert.equal(c.top, 0);
  const free = clampWindow(100, 500, 360, 1200, VW, 1000, HEAD);
  assert.ok(free.top <= 1000 - HEAD);
});

test("a window wider than the screen pins to the left edge", () => {
  assert.equal(clampWindow(200, 50, 1600, 400, VW, VH, HEAD).left, 0);
});

test("a saved spot from a bigger monitor is pulled back onto a small one", () => {
  assert.deepEqual(clampWindow(2200, 1300, 360, 500, 1280, 720, HEAD), { left: 920, top: 220 });
});

test("positions land on whole pixels", () => {
  const c = clampWindow(100.6, 50.4, 360, 500, VW, VH, HEAD);
  assert.deepEqual(c, { left: 101, top: 50 });
});
