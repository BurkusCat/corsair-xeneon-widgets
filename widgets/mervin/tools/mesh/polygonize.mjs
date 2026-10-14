// Turns a list of SDF parts into a triangle mesh: narrow-band sampling with block culling,
// then surface nets (one vertex per sign-changing cell, one quad per sign-changing edge).

import { smax, smin } from "./sdf.mjs";

// Field value at a point using the given subset of parts (indexes into `parts`).
export function fieldAt(parts, x, y, z, subset = null) {
  let d = 1e9;
  const list = subset ?? parts.map((_, i) => i);
  for (const i of list) {
    const p = parts[i];
    if (p.op !== "add") continue;
    d = smin(d, p.prim.dist(x, y, z), p.k);
  }
  for (const i of list) {
    const p = parts[i];
    if (p.op !== "sub") continue;
    d = smax(d, -p.prim.dist(x, y, z), p.k);
  }
  return d;
}

export function gradientAt(parts, x, y, z, eps = 0.0004) {
  const gx = fieldAt(parts, x + eps, y, z) - fieldAt(parts, x - eps, y, z);
  const gy = fieldAt(parts, x, y + eps, z) - fieldAt(parts, x, y - eps, z);
  const gz = fieldAt(parts, x, y, z + eps) - fieldAt(parts, x, y, z - eps);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l, l / (2 * eps)];
}

export function bounds(parts, pad = 0.02) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    if (p.op !== "add") continue;
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a], p.prim.centre[a] - p.prim.reach - pad);
      max[a] = Math.max(max[a], p.prim.centre[a] + p.prim.reach + pad);
    }
  }
  return { min, max };
}

export function polygonize(parts, { cell = 0.003, block = 16 } = {}) {
  const { min, max } = bounds(parts);
  const nx = Math.ceil((max[0] - min[0]) / cell) + 2;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 2;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 2;
  const values = new Float32Array(nx * ny * nz).fill(1);
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  const half = (block * cell * Math.sqrt(3)) / 2;
  let evaluated = 0;

  for (let bk = 0; bk < nz; bk += block) {
    for (let bj = 0; bj < ny; bj += block) {
      for (let bi = 0; bi < nx; bi += block) {
        const cx = min[0] + (bi + block / 2) * cell;
        const cy = min[1] + (bj + block / 2) * cell;
        const cz = min[2] + (bk + block / 2) * cell;
        const subset = [];
        for (let p = 0; p < parts.length; p += 1) {
          const prim = parts[p].prim;
          const dc = Math.hypot(cx - prim.centre[0], cy - prim.centre[1], cz - prim.centre[2]);
          if (dc - prim.reach < half + 0.06) subset.push(p);
        }
        const i1 = Math.min(nx, bi + block);
        const j1 = Math.min(ny, bj + block);
        const k1 = Math.min(nz, bk + block);
        let fill = null;
        if (!subset.some((p) => parts[p].op === "add")) fill = half * 2;
        else {
          const dc = fieldAt(parts, cx, cy, cz, subset);
          if (Math.abs(dc) > half * 1.5 + cell) fill = dc;
        }
        for (let k = bk; k < k1; k += 1) {
          for (let j = bj; j < j1; j += 1) {
            for (let i = bi; i < i1; i += 1) {
              if (fill !== null) values[idx(i, j, k)] = fill;
              else {
                values[idx(i, j, k)] = fieldAt(parts, min[0] + i * cell, min[1] + j * cell, min[2] + k * cell, subset);
                evaluated += 1;
              }
            }
          }
        }
      }
    }
  }

  // Surface nets: a vertex per cell whose corners change sign.
  const cellVertex = new Map();
  const positions = [];
  const corner = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k += 1) {
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        let mask = 0;
        for (let c = 0; c < 8; c += 1) {
          const [a, b, d] = corner[c];
          cv[c] = values[idx(i + a, j + b, k + d)];
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [e0, e1] of edges) {
          const v0 = cv[e0];
          const v1 = cv[e1];
          if (v0 < 0 === v1 < 0) continue;
          const t = v0 / (v0 - v1);
          sx += corner[e0][0] + (corner[e1][0] - corner[e0][0]) * t;
          sy += corner[e0][1] + (corner[e1][1] - corner[e0][1]) * t;
          sz += corner[e0][2] + (corner[e1][2] - corner[e0][2]) * t;
          n += 1;
        }
        cellVertex.set(idx(i, j, k), positions.length / 3);
        positions.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
      }
    }
  }

  // Quads across every sign-changing grid edge.
  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (a === undefined || b === undefined || c === undefined || d === undefined) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (const [key] of cellVertex) {
    const i = key % nx;
    const j = Math.floor(key / nx) % ny;
    const k = Math.floor(key / (nx * ny));
    const v0 = values[key];
    if (j > 0 && k > 0) {
      const v1 = values[idx(i + 1, j, k)];
      if (v0 < 0 !== v1 < 0) {
        quad(cellVertex.get(idx(i, j, k)), cellVertex.get(idx(i, j - 1, k)), cellVertex.get(idx(i, j - 1, k - 1)), cellVertex.get(idx(i, j, k - 1)), v0 < 0);
      }
    }
    if (i > 0 && k > 0) {
      const v1 = values[idx(i, j + 1, k)];
      if (v0 < 0 !== v1 < 0) {
        quad(cellVertex.get(idx(i, j, k)), cellVertex.get(idx(i, j, k - 1)), cellVertex.get(idx(i - 1, j, k - 1)), cellVertex.get(idx(i - 1, j, k)), v0 < 0);
      }
    }
    if (i > 0 && j > 0) {
      const v1 = values[idx(i, j, k + 1)];
      if (v0 < 0 !== v1 < 0) {
        quad(cellVertex.get(idx(i, j, k)), cellVertex.get(idx(i - 1, j, k)), cellVertex.get(idx(i - 1, j - 1, k)), cellVertex.get(idx(i, j - 1, k)), v0 < 0);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    stats: { grid: [nx, ny, nz], evaluated },
  };
}
