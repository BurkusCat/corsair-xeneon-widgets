// Builds Mervin's skinned mesh from the SDF sculpt and writes it as a classic script
// (window.MERVIN_MESH) for the widget. Called by widgets/mervin/build.mjs.
//
// Pipeline: narrow-band surface nets (3 mm) -> project onto the surface -> tangential
// relaxation -> meshoptimizer simplify -> per-vertex normals, colours, baked AO and skin
// weights (softmax over nearby primitives per bone, then smoothed over the mesh).

import { MeshoptSimplifier } from "meshoptimizer";
import { anchors, COLOURS, paints, parts as sculptParts, skeleton } from "./mervin-sdf.mjs";
import { fieldAt, gradientAt, polygonize } from "./polygonize.mjs";

const TARGET_TRIANGLES = 32000;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function adjacency(count, indices) {
  const sets = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  return sets.map((s) => Array.from(s));
}

function project(parts, pos, iterations = 3) {
  for (let i = 0; i < pos.length; i += 3) {
    for (let it = 0; it < iterations; it += 1) {
      const d = fieldAt(parts, pos[i], pos[i + 1], pos[i + 2]);
      if (Math.abs(d) < 1e-5) break;
      const g = gradientAt(parts, pos[i], pos[i + 1], pos[i + 2]);
      const step = d / Math.max(0.2, g[3]);
      pos[i] -= g[0] * step;
      pos[i + 1] -= g[1] * step;
      pos[i + 2] -= g[2] * step;
    }
  }
}

function relax(parts, pos, neighbours, iterations = 3, lambda = 0.5) {
  const next = new Float32Array(pos.length);
  for (let it = 0; it < iterations; it += 1) {
    for (let v = 0; v < neighbours.length; v += 1) {
      const nb = neighbours[v];
      const i = v * 3;
      if (!nb.length) {
        next[i] = pos[i];
        next[i + 1] = pos[i + 1];
        next[i + 2] = pos[i + 2];
        continue;
      }
      let ax = 0;
      let ay = 0;
      let az = 0;
      for (const n of nb) {
        ax += pos[n * 3];
        ay += pos[n * 3 + 1];
        az += pos[n * 3 + 2];
      }
      ax = ax / nb.length - pos[i];
      ay = ay / nb.length - pos[i + 1];
      az = az / nb.length - pos[i + 2];
      const g = gradientAt(parts, pos[i], pos[i + 1], pos[i + 2]);
      const along = ax * g[0] + ay * g[1] + az * g[2];
      next[i] = pos[i] + lambda * (ax - along * g[0]);
      next[i + 1] = pos[i + 1] + lambda * (ay - along * g[1]);
      next[i + 2] = pos[i + 2] + lambda * (az - along * g[2]);
    }
    pos.set(next);
    project(parts, pos, 2);
  }
}

function fixWinding(parts, pos, indices) {
  let agree = 0;
  const step = Math.max(3, Math.floor(indices.length / 3 / 400) * 3);
  for (let t = 0; t < indices.length; t += step) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const wx = pos[c] - pos[a];
    const wy = pos[c + 1] - pos[a + 1];
    const wz = pos[c + 2] - pos[a + 2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const g = gradientAt(parts, (pos[a] + pos[b] + pos[c]) / 3, (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3);
    agree += Math.sign(nx * g[0] + ny * g[1] + nz * g[2]);
  }
  if (agree < 0) {
    for (let t = 0; t < indices.length; t += 3) {
      const tmp = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = tmp;
    }
  }
  return agree < 0;
}

function compact(pos, indices) {
  const remap = new Int32Array(pos.length / 3).fill(-1);
  const out = [];
  let count = 0;
  const newIndices = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) {
    const v = indices[i];
    if (remap[v] < 0) {
      remap[v] = count++;
      out.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    }
    newIndices[i] = remap[v];
  }
  return { positions: new Float32Array(out), indices: newIndices };
}

function b64(typed) {
  return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString("base64");
}

export async function buildMesh() {
  const parts = sculptParts();
  const bones = skeleton();
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]));
  for (const p of parts) {
    const names = p.op === "add" ? (Array.isArray(p.bone) ? p.bone : [p.bone]) : [];
    for (const n of names) if (!boneIndex.has(n)) throw new Error(`Unknown bone ${n}`);
  }

  const raw = polygonize(parts, { cell: 0.003 });
  const flipped = fixWinding(parts, raw.positions, raw.indices);
  project(parts, raw.positions, 3);

  await MeshoptSimplifier.ready;
  const [simplified] = MeshoptSimplifier.simplify(raw.indices, raw.positions, 3, TARGET_TRIANGLES * 3, 0.002, []);
  const mesh = compact(raw.positions, simplified);
  const pos = mesh.positions;
  const indices = mesh.indices;
  const count = pos.length / 3;
  const neighbours = adjacency(count, indices);
  relax(parts, pos, neighbours, 2, 0.35);

  // Per-vertex attributes.
  const normals = new Int8Array(count * 3);
  const colours = new Uint8Array(count * 4);
  const material = new Uint8Array(count);
  const nBones = bones.length;
  const weights = new Float32Array(count * nBones);
  const paintList = paints();
  const addParts = parts.map((p, i) => ({ p, i })).filter(({ p }) => p.op === "add");
  const subParts = parts.filter((p) => p.op === "sub");
  const SIGMA = 0.007;

  for (let v = 0; v < count; v += 1) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    const g = gradientAt(parts, x, y, z);
    normals[v * 3] = Math.round(g[0] * 127);
    normals[v * 3 + 1] = Math.round(g[1] * 127);
    normals[v * 3 + 2] = Math.round(g[2] * 127);

    // Distances to every additive part: region from the nearest, weights from a softmax.
    let dMin = Infinity;
    let nearest = null;
    const dists = addParts.map(({ p }) => {
      const d = p.prim.dist(x, y, z);
      if (d < dMin) {
        dMin = d;
        nearest = p;
      }
      return d;
    });
    addParts.forEach(({ p }, k) => {
      const w = Math.exp(-(dists[k] - dMin) / SIGMA);
      if (w < 1e-3) return;
      if (Array.isArray(p.bone)) {
        const s = smoothstep(0.25, 0.85, p.prim.t(x, y, z));
        weights[v * nBones + boneIndex.get(p.bone[0])] += w * (1 - s);
        weights[v * nBones + boneIndex.get(p.bone[1])] += w * s;
      } else {
        weights[v * nBones + boneIndex.get(p.bone)] += w;
      }
    });

    let region = nearest.region;
    for (const s of subParts) {
      if (Math.abs(s.prim.dist(x, y, z)) < 0.0035) region = s.region;
    }
    let colour = (COLOURS[region] ?? COLOURS.skin).slice();
    if (region === "skin") {
      for (const paint of paintList) {
        const d = paint.shape.dist(x, y, z);
        const t = smoothstep(paint.soft, -paint.soft, d) * paint.strength;
        if (t > 0) colour = colour.map((c, ci) => c + (paint.colour[ci] - c) * t);
      }
    }
    // Baked ambient occlusion from the field.
    let occ = 0;
    let sca = 1;
    for (let s = 1; s <= 5; s += 1) {
      const h = 0.004 + 0.011 * s;
      const d = fieldAt(parts, x + g[0] * h, y + g[1] * h, z + g[2] * h);
      occ += (h - d) * sca;
      sca *= 0.72;
    }
    const ao = Math.min(1, Math.max(0, 1 - 4.2 * occ));
    colours[v * 4] = Math.round(colour[0]);
    colours[v * 4 + 1] = Math.round(colour[1]);
    colours[v * 4 + 2] = Math.round(colour[2]);
    colours[v * 4 + 3] = Math.round(ao * 255);
    material[v] = region === "shorts" ? 1 : region === "mouth" ? 2 : 0;
  }

  // Smooth the weights over the mesh, so joints bend softly.
  const tmp = new Float32Array(weights.length);
  for (let it = 0; it < 10; it += 1) {
    for (let v = 0; v < count; v += 1) {
      const nb = neighbours[v];
      for (let b = 0; b < nBones; b += 1) {
        let sum = 0;
        for (const n of nb) sum += weights[n * nBones + b];
        tmp[v * nBones + b] = nb.length ? weights[v * nBones + b] * 0.5 + (sum / nb.length) * 0.5 : weights[v * nBones + b];
      }
    }
    weights.set(tmp);
  }
  const skinIndex = new Uint8Array(count * 4);
  const skinWeight = new Uint8Array(count * 4);
  for (let v = 0; v < count; v += 1) {
    const list = [];
    for (let b = 0; b < nBones; b += 1) {
      const w = weights[v * nBones + b];
      if (w > 0) list.push([b, w]);
    }
    list.sort((a, b) => b[1] - a[1]);
    const first = list.length ? list[0][1] : 0;
    const top = list.slice(0, 4).filter(([, w]) => w >= first * 0.02);
    const total = top.reduce((s, [, w]) => s + w, 0) || 1;
    // Quantise, then give any rounding error to the largest weight so the sum is exactly 255.
    const q = top.map(([, w]) => Math.round((w / total) * 255));
    if (q.length) q[0] += 255 - q.reduce((s, n) => s + n, 0);
    top.forEach(([b], k) => {
      skinIndex[v * 4 + k] = b;
      skinWeight[v * 4 + k] = q[k];
    });
    if (!top.length) skinWeight[v * 4] = 255;
  }

  // Quantise positions to 16 bits over the bounding box.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < count; v += 1) {
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a], pos[v * 3 + a]);
      max[a] = Math.max(max[a], pos[v * 3 + a]);
    }
  }
  const qpos = new Uint16Array(count * 3);
  for (let v = 0; v < count; v += 1) {
    for (let a = 0; a < 3; a += 1) qpos[v * 3 + a] = Math.round(((pos[v * 3 + a] - min[a]) / (max[a] - min[a])) * 65535);
  }
  const index = count < 65536 ? new Uint16Array(indices) : indices;

  // Lay the chain on his skin: project each point onto the surface, then lift it a little.
  const anchorData = anchors();
  anchorData.chain = anchorData.chain.map((p) => {
    const q = Float32Array.from(p);
    project(parts, q, 6);
    const g = gradientAt(parts, q[0], q[1], q[2]);
    return [q[0] + g[0] * 0.0075, q[1] + g[1] * 0.0075, q[2] + g[2] * 0.0075].map((n) => +n.toFixed(5));
  });

  const data = {
    version: 1,
    count,
    triangles: indices.length / 3,
    min,
    max,
    position: b64(qpos),
    normal: b64(normals),
    colour: b64(colours),
    material: b64(material),
    skinIndex: b64(skinIndex),
    skinWeight: b64(skinWeight),
    index: b64(index),
    indexType: index instanceof Uint16Array ? "u16" : "u32",
    bones: bones.map((b) => ({ name: b.name, parent: b.parent, pos: b.pos.map((n) => +n.toFixed(5)) })),
    anchors: anchorData,
  };
  const script = `window.MERVIN_MESH = ${JSON.stringify(data)};\n`;
  return {
    script,
    data,
    stats: `${count} vertices, ${indices.length / 3} triangles (from ${raw.indices.length / 3}${flipped ? ", flipped" : ""}), ${(script.length / 1024).toFixed(0)} KB`,
  };
}
