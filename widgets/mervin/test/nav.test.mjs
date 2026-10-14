import assert from "node:assert/strict";
import test from "node:test";
import { SPOTS, WALKABLE } from "../src/core/layout.js";
import { createNavGrid, pathLength } from "../src/core/nav.js";

const grid = createNavGrid();

test("every activity spot's approach point is reachable from the middle of the room", () => {
  const start = [1.2, 2.8];
  for (const [name, spot] of Object.entries(SPOTS)) {
    const path = grid.findPath(start, spot.approach);
    assert.ok(path, `no path to ${name}`);
    const end = path[path.length - 1];
    assert.ok(Math.hypot(end[0] - spot.approach[0], end[1] - spot.approach[1]) < 0.45, `${name}: path ends ${end} far from ${spot.approach}`);
  }
});

test("every pair of approach points is connected", () => {
  const spots = Object.entries(SPOTS);
  for (const [a, sa] of spots) {
    for (const [b, sb] of spots) {
      if (a >= b) continue;
      assert.ok(grid.findPath(sa.approach, sb.approach), `${a} -> ${b}`);
    }
  }
});

test("paths stay inside the walkable area and only bend where they must", () => {
  const path = grid.findPath([-2.5, 3.4], [3.6, 2.4]);
  assert.ok(path.length >= 2);
  for (const [x, z] of path) {
    assert.ok(x >= WALKABLE.minX - 0.05 && x <= WALKABLE.maxX + 0.05 && z >= WALKABLE.minZ - 0.05 && z <= WALKABLE.maxZ + 0.05);
  }
  assert.ok(pathLength(path) < Math.hypot(6.1, 1.0) * 1.4);
});

test("a straight line across open floor needs no corners", () => {
  const path = grid.findPath([1.0, 3.5], [2.2, 3.5]);
  assert.equal(path.length, 2);
});
