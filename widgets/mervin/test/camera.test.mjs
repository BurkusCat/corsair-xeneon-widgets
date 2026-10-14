import assert from "node:assert/strict";
import test from "node:test";
import { cameraTarget, lensFor, project, stretchAt } from "../src/core/camera-math.js";
import { MERVIN_HEIGHT, ROOM, WALKABLE } from "../src/core/layout.js";

const SIZES = [
  ["XL", 2536, 696],
  ["L", 1688, 696],
  ["M", 840, 696],
  ["S", 840, 344],
];

function framesFor(width, height, mode) {
  const lens = lensFor(width, height);
  const out = [];
  for (let x = WALKABLE.minX + 0.1; x <= WALKABLE.maxX - 0.1; x += 0.6) {
    for (let z = WALKABLE.minZ + 0.2; z <= WALKABLE.maxZ; z += 0.5) {
      // Settle the dead-zone logic as the spring would.
      let cam = cameraTarget(lens, { x, z }, mode, null);
      cam = cameraTarget(lens, { x, z }, mode, cam);
      out.push({ lens, cam, x, z });
    }
  }
  return out;
}

for (const portrait of [false, true]) {
  for (const [name, w0, h0] of SIZES) {
    const [w, h] = portrait ? [h0, w0] : [w0, h0];
    for (const mode of ["normal", "chat"]) {
      test(`${name}${portrait ? " portrait" : ""} ${mode}: Mervin's head and feet stay in frame`, () => {
        for (const { lens, cam, x, z } of framesFor(w, h, mode)) {
          const feet = project(lens, cam, { x, y: 0, z });
          const head = project(lens, cam, { x, y: MERVIN_HEIGHT, z });
          const where = `at (${x.toFixed(1)}, ${z.toFixed(1)}) cam (${cam.x.toFixed(2)}, ${cam.z.toFixed(2)})`;
          assert.ok(feet && head, where);
          assert.ok(feet.py <= h * 0.985, `feet below frame ${where}: ${feet.py.toFixed(0)}`);
          assert.ok(head.py >= h * 0.015, `head above frame ${where}: ${head.py.toFixed(0)}`);
          assert.ok(feet.px >= 0 && feet.px <= w, `off the side ${where}: ${feet.px.toFixed(0)}`);
        }
      });
    }
    test(`${name}${portrait ? " portrait" : ""}: little distortion and the camera stays in the room`, () => {
      for (const { cam, x, z } of framesFor(w, h, "normal")) {
        const d = cam.z - z;
        assert.ok(stretchAt((x - cam.x) / d, (0.6 - cam.y) / d) <= 1.25, `stretch at ${x}, ${z}`);
        assert.ok(Math.abs(cam.x) < ROOM.halfWidth && cam.z < ROOM.extendTo && cam.z > z);
      }
    });
  }
}

test("layout names follow the widget sizes", () => {
  assert.equal(lensFor(2536, 696).name, "xl");
  assert.equal(lensFor(1688, 696).name, "l");
  assert.equal(lensFor(840, 696).name, "m");
  assert.equal(lensFor(840, 344).name, "s");
  assert.equal(lensFor(696, 2536).name, "tall-xl");
});
