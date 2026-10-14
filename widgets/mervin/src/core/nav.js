// Navigation for Mervin: a 0.1 m occupancy grid over the floor built from furniture
// footprints, A* between cells, then string pulling so he walks in straight lines.
// Pure (no THREE), so tests can check every activity spot is reachable.

import { FURNITURE, ROOM, WALKABLE } from "./layout.js";

const CELL = 0.1;
const BODY_RADIUS = 0.24; // clearance for low furniture
const EAR_RADIUS = 0.36; // tall furniture also has to clear his ears

export function createNavGrid(furniture = FURNITURE) {
  const x0 = -ROOM.halfWidth;
  const z0 = 0;
  const cols = Math.round((ROOM.halfWidth * 2) / CELL);
  const rows = Math.round((WALKABLE.maxZ + 0.6) / CELL);
  const blocked = new Uint8Array(cols * rows);
  const centre = (c, r) => [x0 + (c + 0.5) * CELL, z0 + (r + 0.5) * CELL];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const [x, z] = centre(c, r);
      let block = x < WALKABLE.minX || x > WALKABLE.maxX || z < WALKABLE.minZ || z > WALKABLE.maxZ;
      for (const f of furniture) {
        if (block) break;
        const pad = f.tall ? EAR_RADIUS : BODY_RADIUS;
        if (f.r !== undefined) block = Math.hypot(x - f.x, z - f.z) < f.r + pad;
        else block = x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad;
      }
      blocked[r * cols + c] = block ? 1 : 0;
    }
  }

  const cellOf = (x, z) => [
    Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / CELL))),
    Math.min(rows - 1, Math.max(0, Math.floor((z - z0) / CELL))),
  ];
  const isFree = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !blocked[r * cols + c];

  // Nearest free cell to a point (spiral search).
  function nearestFree(x, z) {
    const [c0, r0] = cellOf(x, z);
    if (isFree(c0, r0)) return [c0, r0];
    for (let radius = 1; radius < 30; radius += 1) {
      let best = null;
      let bestD = Infinity;
      for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          if (!isFree(c0 + dc, r0 + dr)) continue;
          const [cx, cz] = centre(c0 + dc, r0 + dr);
          const d = Math.hypot(cx - x, cz - z);
          if (d < bestD) {
            bestD = d;
            best = [c0 + dc, r0 + dr];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Straight walk between two points without touching a blocked cell?
  function lineFree(ax, az, bx, bz) {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(dist / (CELL * 0.4)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const [c, r] = cellOf(ax + (bx - ax) * t, az + (bz - az) * t);
      if (!isFree(c, r)) return false;
    }
    return true;
  }

  // A* over 8-connected cells. Returns [[x, z], ...] from start to goal, or null.
  function findPath(from, to) {
    const start = nearestFree(from[0], from[1]);
    const goal = nearestFree(to[0], to[1]);
    if (!start || !goal) return null;
    const key = (c, r) => r * cols + c;
    const g = new Float32Array(cols * rows).fill(Infinity);
    const came = new Int32Array(cols * rows).fill(-1);
    const closed = new Uint8Array(cols * rows);
    const open = [[0, start[0], start[1]]];
    g[key(start[0], start[1])] = 0;
    const h = (c, r) => Math.hypot(c - goal[0], r - goal[1]);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i += 1) if (open[i][0] < open[bi][0]) bi = i;
      const [, c, r] = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      const k = key(c, r);
      if (closed[k]) continue;
      closed[k] = 1;
      if (c === goal[0] && r === goal[1]) break;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dr && !dc) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (!isFree(nc, nr)) continue;
          // No corner cutting.
          if (dr && dc && (!isFree(c + dc, r) || !isFree(c, r + dr))) continue;
          const nk = key(nc, nr);
          const cost = g[k] + (dr && dc ? Math.SQRT2 : 1);
          if (cost < g[nk]) {
            g[nk] = cost;
            came[nk] = k;
            open.push([cost + h(nc, nr), nc, nr]);
          }
        }
      }
    }
    const goalKey = key(goal[0], goal[1]);
    if (!Number.isFinite(g[goalKey])) return null;
    const cells = [];
    for (let k = goalKey; k !== -1; k = came[k]) cells.push(centre(k % cols, Math.floor(k / cols)));
    cells.reverse();
    // Exact endpoints when they are free; otherwise the nearest free cell centres.
    const [sc, sr] = cellOf(from[0], from[1]);
    if (isFree(sc, sr)) cells[0] = [from[0], from[1]];
    const [gc, gr] = cellOf(to[0], to[1]);
    if (isFree(gc, gr)) cells[cells.length - 1] = [to[0], to[1]];
    // String pulling: keep only the corners needed for straight, clear lines.
    const path = [cells[0]];
    let anchor = 0;
    for (let i = 2; i < cells.length; i += 1) {
      if (!lineFree(cells[anchor][0], cells[anchor][1], cells[i][0], cells[i][1])) {
        path.push(cells[i - 1]);
        anchor = i - 1;
      }
    }
    if (cells.length > 1) path.push(cells[cells.length - 1]);
    return path;
  }

  return { cols, rows, cell: CELL, x0, z0, blocked, isFree, cellOf, centre, nearestFree, lineFree, findPath };
}

export function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return total;
}
