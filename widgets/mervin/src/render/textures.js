// Every texture is drawn on a canvas at startup: the widget runs from file://, where image
// loading is unreliable, and procedural textures keep the package small. Tileable noise
// keeps repeats seamless.

import * as THREE from "three";
import { createRng } from "../core/rng.js";

const textureRng = createRng(616);

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Tileable fractal value noise, values 0..1. `cells` is the coarsest grid size.
export function tileNoise(w, h, cells = 8, octaves = 4, seed = 1) {
  const rng = createRng(seed);
  const out = new Float32Array(w * h);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o += 1) {
    const cx = cells * 2 ** o;
    const cy = Math.max(1, Math.round((cells * 2 ** o * h) / w));
    const grid = new Float32Array(cx * cy);
    for (let i = 0; i < grid.length; i += 1) grid[i] = rng.next();
    for (let y = 0; y < h; y += 1) {
      const gy = (y / h) * cy;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      const r0 = (y0 % cy) * cx;
      const r1 = ((y0 + 1) % cy) * cx;
      for (let x = 0; x < w; x += 1) {
        const gx = (x / w) * cx;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const c0 = x0 % cx;
        const c1 = (x0 + 1) % cx;
        const a = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * sx;
        const b = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * sx;
        out[y * w + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= total;
  return out;
}

function hexRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function finish(c, { repeat = [1, 1], srgb = true, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = anisotropy;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Honey oak floorboards. The canvas covers `size` metres square; boards run along z.
export function woodFloor({ size = 1.92, boards = 12, base = "#b5844f" } = {}) {
  const W = 1024;
  const c = canvas(W, W);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, W);
  const grain = tileNoise(W, W, 3, 5, 11);
  const fine = tileNoise(W, W, 48, 3, 12);
  const [br, bg, bb] = hexRgb(base);
  const boardW = W / boards;
  // Each board column has butt joints at random offsets (staggered).
  const joints = [];
  for (let b = 0; b < boards; b += 1) {
    const list = [];
    let y = textureRng.next() * W;
    while (list.length < 3) {
      list.push(Math.floor(y) % W);
      y += W * (0.35 + textureRng.next() * 0.4);
    }
    joints.push(list.sort((p, q) => p - q));
  }
  const tones = Array.from({ length: boards * 4 }, () => 0.84 + textureRng.next() * 0.3);
  const hueShift = Array.from({ length: boards * 4 }, () => (textureRng.next() - 0.5) * 0.08);
  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const b = Math.floor(x / boardW);
      const js = joints[b];
      let seg = 0;
      while (seg < js.length && y >= js[seg]) seg += 1;
      const key = b * 4 + (seg % 4);
      const tone = tones[key];
      // Grain: noise stretched along the board, plus fine pores.
      const gx = (x + b * 37) % W;
      const g = grain[(Math.floor(y * 0.06 + b * 130) % W) * W + gx];
      const rings = 0.5 + 0.5 * Math.sin((g * 28 + gx / 9) * 1.0);
      const pore = fine[y * W + x];
      let shade = tone * (0.86 + rings * 0.12 + (pore - 0.5) * 0.1);
      const lx = x - b * boardW;
      if (lx < 1.4 || lx > boardW - 1.4) shade *= 0.55;
      for (const j of js) if (Math.abs(y - j) < 1.2) shade *= 0.6;
      const hs = hueShift[key];
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, br * shade * (1 + hs));
      img.data[i + 1] = Math.min(255, bg * shade);
      img.data[i + 2] = Math.min(255, bb * shade * (1 - hs));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = finish(c);
  tex.userData.size = size;
  return tex;
}

// Warm wallpaper with a soft repeating leaf motif. Covers 0.64 m square.
export function wallpaper({ base = "#e9d9bd", motif = "#d8c39f", stripe = "#e2cfae" } = {}) {
  const W = 512;
  const c = canvas(W, W);
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, W);
  ctx.fillStyle = stripe;
  for (let x = 0; x < W; x += 128) ctx.fillRect(x + 54, 0, 20, W);
  ctx.fillStyle = motif;
  const leaf = (cx, cy, r, rot) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.7, 0, 0, r);
    ctx.quadraticCurveTo(-r * 0.7, 0, 0, -r);
    ctx.fill();
    ctx.restore();
  };
  for (let y = 0; y < W + 128; y += 128) {
    for (let x = 0; x < W + 128; x += 128) {
      const ox = (y / 128) % 2 ? 64 : 0;
      leaf(x + ox, y, 14, 0.5);
      leaf(x + ox + 9, y + 12, 10, -0.6);
      ctx.beginPath();
      ctx.arc(x + ox - 6, y + 18, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  paperGrain(ctx, W, W, 0.05, 21);
  return finish(c);
}

function paperGrain(ctx, w, h, strength, seed) {
  const img = ctx.getImageData(0, 0, w, h);
  const n = tileNoise(w, h, 64, 2, seed);
  const m = tileNoise(w, h, 6, 3, seed + 1);
  for (let i = 0; i < w * h; i += 1) {
    const f = 1 + (n[i] - 0.5) * strength + (m[i] - 0.5) * strength * 0.8;
    img.data[i * 4] *= f;
    img.data[i * 4 + 1] *= f;
    img.data[i * 4 + 2] *= f;
  }
  ctx.putImageData(img, 0, 0);
}

export function plaster({ base = "#f1ebe1", strength = 0.06, seed = 31 } = {}) {
  const W = 256;
  const c = canvas(W, W);
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, W);
  paperGrain(ctx, W, W, strength, seed);
  return finish(c);
}

// White metro tiles with grey grout. Covers 0.6 m x 0.3 m (4 x 4 tiles).
export function metroTiles({ base = "#f4f2ec", grout = "#b8b2a6" } = {}) {
  const W = 512;
  const H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, W, H);
  const tw = W / 4;
  const th = H / 4;
  for (let row = 0; row < 4; row += 1) {
    for (let col = -1; col < 5; col += 1) {
      const x = col * tw + (row % 2 ? tw / 2 : 0);
      const y = row * th;
      const g = ctx.createLinearGradient(0, y, 0, y + th);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.5, base);
      g.addColorStop(1, "#e2ded4");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 3, tw - 6, th - 6, 7);
      ctx.fill();
    }
  }
  return finish(c);
}

// A retro rug: teal field, mustard and terracotta borders, a soft medallion. Not tiled.
export function rug({ field = "#2f7f7a", border = "#e2a33b", accent = "#c4553a", cream = "#efe2c4" } = {}) {
  const W = 1024;
  const H = 768;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, W, H);
  const band = (inset, color, radius) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(inset, inset, W - inset * 2, H - inset * 2, radius);
    ctx.fill();
  };
  band(18, border, 60);
  band(52, cream, 48);
  band(64, accent, 44);
  band(84, field, 36);
  // Medallion.
  ctx.save();
  ctx.translate(W / 2, H / 2);
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = [cream, border, accent][i];
    ctx.beginPath();
    ctx.ellipse(0, 0, 230 - i * 62, 160 - i * 44, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = field;
  for (let k = 0; k < 8; k += 1) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(150, 0, 34, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Corner diamonds.
  ctx.fillStyle = border;
  for (const [x, y] of [[170, 170], [W - 170, 170], [170, H - 170], [W - 170, H - 170]]) {
    ctx.beginPath();
    ctx.moveTo(x, y - 40);
    ctx.lineTo(x + 40, y);
    ctx.lineTo(x, y + 40);
    ctx.lineTo(x - 40, y);
    ctx.fill();
  }
  // Pile: fibre noise.
  const img = ctx.getImageData(0, 0, W, H);
  const n = tileNoise(W, H, 160, 2, 41);
  const m = tileNoise(W, H, 12, 3, 42);
  for (let i = 0; i < W * H; i += 1) {
    const f = 0.82 + n[i] * 0.26 + (m[i] - 0.5) * 0.12;
    img.data[i * 4] *= f;
    img.data[i * 4 + 1] *= f;
    img.data[i * 4 + 2] *= f;
  }
  ctx.putImageData(img, 0, 0);
  const tex = finish(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Woven upholstery: a fine cross-hatch with soft colour variation.
export function fabric(base, { seed = 51, weave = 4, strength = 0.18 } = {}) {
  const W = 256;
  const c = canvas(W, W);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, W);
  const [r, g, b] = hexRgb(base);
  const n = tileNoise(W, W, 8, 3, seed);
  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const wx = Math.sin((x / weave) * Math.PI) ** 2;
      const wy = Math.sin((y / weave) * Math.PI) ** 2;
      const thread = ((Math.floor(x / weave) + Math.floor(y / weave)) % 2 ? wx : wy) * strength;
      const f = 1 - strength / 2 + thread + (n[y * W + x] - 0.5) * 0.12;
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, r * f);
      img.data[i + 1] = Math.min(255, g * f);
      img.data[i + 2] = Math.min(255, b * f);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

// Painted wood grain for furniture (not floorboards): long soft streaks.
export function woodGrain(base = "#8a5a36", { seed = 61, contrast = 0.22 } = {}) {
  const W = 512;
  const c = canvas(W, W);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, W);
  const [r, g, b] = hexRgb(base);
  const n = tileNoise(W, W, 4, 5, seed);
  const p = tileNoise(W, W, 64, 2, seed + 1);
  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const v = n[(Math.floor(y * 0.08) % W) * W + x];
      const rings = 0.5 + 0.5 * Math.sin(v * 40 + x * 0.05);
      const f = 1 - contrast / 2 + rings * contrast + (p[y * W + x] - 0.5) * 0.08;
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, r * f);
      img.data[i + 1] = Math.min(255, g * f);
      img.data[i + 2] = Math.min(255, b * f);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

// Soft round shadow for contact-shadow decals (white = shadow, used as alphaMap).
export function blobShadow() {
  const W = 128;
  const c = canvas(W, W);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, W);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// Soft rectangular shadow (for furniture footprints), feathered on all sides.
export function boxShadow() {
  const W = 128;
  const c = canvas(W, W);
  const ctx = c.getContext("2d");
  ctx.filter = "blur(14px)";
  ctx.fillStyle = "#fff";
  ctx.fillRect(28, 28, W - 56, W - 56);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// The Planet 6 painting: a pastel ringed planet with its fourteen moons.
export function planetPainting() {
  const W = 512;
  const H = 384;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#1c1840");
  sky.addColorStop(1, "#4a2e66");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const rng = createRng(6);
  for (let i = 0; i < 140; i += 1) {
    ctx.fillStyle = `rgba(255,255,240,${0.3 + rng.next() * 0.7})`;
    ctx.fillRect(rng.next() * W, rng.next() * H, 1.6, 1.6);
  }
  // Rings behind.
  ctx.save();
  ctx.translate(W * 0.46, H * 0.52);
  ctx.rotate(-0.28);
  ctx.strokeStyle = "rgba(255, 210, 160, 0.55)";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.ellipse(0, 0, 200, 46, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const body = ctx.createRadialGradient(W * 0.4, H * 0.42, 10, W * 0.46, H * 0.52, 130);
  body.addColorStop(0, "#ffd3a6");
  body.addColorStop(0.55, "#e88e8e");
  body.addColorStop(1, "#7e4f9a");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(W * 0.46, H * 0.52, 118, 0, Math.PI * 2);
  ctx.fill();
  // Bands.
  ctx.save();
  ctx.beginPath();
  ctx.arc(W * 0.46, H * 0.52, 118, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let k = -3; k < 4; k += 1) ctx.fillRect(0, H * 0.52 + k * 30, W, 9);
  ctx.restore();
  // Rings in front.
  ctx.save();
  ctx.translate(W * 0.46, H * 0.52);
  ctx.rotate(-0.28);
  ctx.strokeStyle = "rgba(255, 220, 170, 0.8)";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.ellipse(0, 0, 200, 46, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
  // Fourteen moons, one noticeably plain (Gary).
  const moons = [[60, 60], [110, 300], [430, 70], [470, 330], [380, 40], [30, 200], [490, 200], [250, 30], [300, 350], [160, 40], [70, 340], [420, 260], [200, 345], [340, 100]];
  moons.forEach(([x, y], i) => {
    ctx.fillStyle = i === 3 ? "#9a9488" : ["#cfe8ff", "#ffe5a8", "#d7c6ff", "#b9f0d0"][i % 4];
    ctx.beginPath();
    ctx.arc(x, y, i === 3 ? 13 : 5 + (i % 3) * 2, 0, Math.PI * 2);
    ctx.fill();
  });
  return finish(c, { anisotropy: 4 });
}

// A framed photo of Mervin's mum, who is mostly weather.
export function mumPhoto() {
  const W = 256;
  const H = 320;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#9cc9f0");
  sky.addColorStop(1, "#e8f2fb");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  for (const [x, y, r] of [[90, 140, 52], [140, 120, 62], [180, 150, 46], [120, 170, 50], [70, 175, 36], [170, 180, 40]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#4a4f6a";
  ctx.beginPath();
  ctx.arc(112, 150, 4, 0, Math.PI * 2);
  ctx.arc(148, 150, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4a4f6a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(130, 162, 14, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.fillStyle = "#6a8f5a";
  ctx.fillRect(0, H - 50, W, 50);
  return finish(c, { anisotropy: 4 });
}

// A hand-lettered sign. Text only, so it reads at small sizes.
export function sign(text, { bg = "#f7efdc", fg = "#7a4b2a", w = 512, h = 160, font = "italic 700 64px Georgia, serif" } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 4);
  return finish(c, { anisotropy: 4 });
}

// Book spine colours (muted, varied) for instanced books.
export const SPINE_COLOURS = ["#8e3b2f", "#2f5f8a", "#c79a3a", "#3f6b45", "#6d4a7e", "#c2672d", "#2e4a5e", "#a8a08a", "#7b2f3f", "#d9c9a3", "#476f6a", "#b05a5a"];
