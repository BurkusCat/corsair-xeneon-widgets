// The box of the room: floor, walls (back wall with window and door openings), ceiling,
// skirting, the view out of the window and the hallway behind the door.

import * as THREE from "three";
import { DOOR, ROOM, WINDOW } from "../core/layout.js";
import * as T from "../render/textures.js";
import { standard, withCornerShade } from "./materials.js";

const WALL_THICKNESS = 0.16;

function plane(width, height, uvScale) {
  const geo = new THREE.PlaneGeometry(width, height);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * width * uvScale[0], uv.getY(i) * height * uvScale[1]);
  return geo;
}

function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

export function buildShell(ctx) {
  const group = new THREE.Group();
  group.name = "shell";
  const W = ROOM.halfWidth;
  const H = ROOM.height;
  const L = ROOM.extendTo;

  // Floor: honey oak boards running toward the viewer.
  const floorTex = T.woodFloor();
  const floorMat = withCornerShade(standard({ map: floorTex, roughness: 0.58, metalness: 0 }), ["floor"], { strength: 0.35, radius: 0.32 });
  const floorSize = floorTex.userData.size;
  const floor = new THREE.Mesh(plane(W * 2, L, [1 / floorSize, 1 / floorSize]), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, L / 2);
  floor.receiveShadow = true;
  floor.name = "floor";
  group.add(floor);

  // Walls: warm wallpaper.
  const paper = T.wallpaper();
  const paperSize = 0.64;
  const wallOptions = { map: paper, roughness: 0.92, metalness: 0 };

  // Back wall with the window and door cut out. ShapeGeometry UVs are shape coordinates (m).
  const shape = new THREE.Shape();
  shape.moveTo(-W, 0);
  shape.lineTo(W, 0);
  shape.lineTo(W, H);
  shape.lineTo(-W, H);
  shape.closePath();
  const windowHole = new THREE.Path();
  windowHole.moveTo(WINDOW.x0, WINDOW.y0);
  windowHole.lineTo(WINDOW.x0, WINDOW.y1);
  windowHole.lineTo(WINDOW.x1, WINDOW.y1);
  windowHole.lineTo(WINDOW.x1, WINDOW.y0);
  windowHole.closePath();
  const doorHole = new THREE.Path();
  doorHole.moveTo(DOOR.x0, 0);
  doorHole.lineTo(DOOR.x0, DOOR.height);
  doorHole.lineTo(DOOR.x1, DOOR.height);
  doorHole.lineTo(DOOR.x1, 0);
  doorHole.closePath();
  shape.holes.push(windowHole, doorHole);
  const backGeo = new THREE.ShapeGeometry(shape);
  const uv = backGeo.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) / paperSize, uv.getY(i) / paperSize);
  const backMat = withCornerShade(standard({ ...wallOptions, shadowSide: THREE.DoubleSide }), ["back"]);
  const back = new THREE.Mesh(backGeo, backMat);
  back.receiveShadow = true;
  back.castShadow = true;
  back.name = "backWall";
  group.add(back);

  // Walls and ceiling cast shadows from both faces, so the sun only gets in at the window.
  const sideMat = (skip) => withCornerShade(standard({ ...wallOptions, map: paper.clone(), shadowSide: THREE.DoubleSide }), [skip]);
  const leftMat = sideMat("left");
  leftMat.map.repeat.set(1, 1);
  const left = new THREE.Mesh(plane(L, H, [1 / paperSize, 1 / paperSize]), leftMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-W, H / 2, L / 2);
  left.receiveShadow = true;
  left.castShadow = true;
  group.add(left);
  const right = new THREE.Mesh(plane(L, H, [1 / paperSize, 1 / paperSize]), sideMat("right"));
  right.rotation.y = -Math.PI / 2;
  right.position.set(W, H / 2, L / 2);
  right.receiveShadow = true;
  right.castShadow = true;
  group.add(right);

  // Ceiling: plain plaster.
  const ceilingMat = withCornerShade(standard({ map: T.plaster(), roughness: 0.95, shadowSide: THREE.DoubleSide }), ["ceiling"], { strength: 0.3, radius: 0.45 });
  const ceiling = new THREE.Mesh(plane(W * 2, L, [1, 1]), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H, L / 2);
  ceiling.castShadow = true;
  group.add(ceiling);

  // Painted woodwork: skirting, coving, window and door frames.
  const trim = withCornerShade(standard({ color: "#f3efe6", roughness: 0.45 }), [], { strength: 0.25, radius: 0.3 });
  const skirtH = 0.11;
  const skirtD = 0.018;
  const addSkirt = (x0, x1) => {
    const s = box(x1 - x0, skirtH, skirtD, trim);
    s.position.set((x0 + x1) / 2, skirtH / 2, skirtD / 2);
    s.receiveShadow = true;
    group.add(s);
  };
  addSkirt(-W, DOOR.x0 - 0.06);
  addSkirt(DOOR.x1 + 0.06, W);
  for (const side of [-1, 1]) {
    const s = box(skirtD, skirtH, L, trim);
    s.position.set(side * (W - skirtD / 2), skirtH / 2, L / 2);
    s.receiveShadow = true;
    group.add(s);
    const cove = box(0.05, 0.06, L, trim);
    cove.position.set(side * (W - 0.025), H - 0.03, L / 2);
    group.add(cove);
  }
  const coveBack = box(W * 2, 0.06, 0.05, trim);
  coveBack.position.set(0, H - 0.03, 0.025);
  group.add(coveBack);

  const windowParts = buildWindow(ctx, trim);
  group.add(windowParts.group);
  const doorParts = buildDoor(ctx, trim);
  group.add(doorParts.group);

  return {
    group,
    floor,
    window: windowParts,
    door: doorParts,
    update(dt, state) {
      windowParts.update(dt, state);
      doorParts.update(dt, state);
    },
  };
}

// The window: a white frame with a transom, glass, a sill, curtains, and the view outside
// (sky shader plus rooftop and tree silhouettes that light up at night).
function buildWindow(ctx, trim) {
  const group = new THREE.Group();
  group.name = "window";
  const { x0, x1, y0, y1 } = WINDOW;
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  const h = y1 - y0;
  const t = WALL_THICKNESS;

  // Reveal: the inside faces of the opening, so the wall reads as thick.
  const reveal = withCornerShade(standard({ color: "#efe6d6", roughness: 0.9 }), [], { strength: 0.2, radius: 0.3 });
  const top = box(w, 0.01, t, reveal);
  top.position.set(cx, y1, -t / 2);
  const leftSide = box(0.01, h, t, reveal);
  leftSide.position.set(x0, (y0 + y1) / 2, -t / 2);
  const rightSide = leftSide.clone();
  rightSide.position.x = x1;
  group.add(top, leftSide, rightSide);
  const sill = box(w + 0.12, 0.035, t + 0.1, trim);
  sill.position.set(cx, y0 - 0.0175, -t / 2 + 0.05);
  sill.receiveShadow = true;
  sill.castShadow = true;
  group.add(sill);

  // Frame and glazing bars, set back in the opening.
  const frameZ = -t * 0.55;
  const bar = 0.05;
  const frameParts = [
    [w, bar, cx, y1 - bar / 2],
    [w, bar, cx, y0 + bar / 2],
    [bar, h, x0 + bar / 2, (y0 + y1) / 2],
    [bar, h, x1 - bar / 2, (y0 + y1) / 2],
    [bar * 0.8, h, cx, (y0 + y1) / 2],
    [w, bar * 0.8, cx, y1 - h * 0.3],
  ];
  for (const [bw, bh, bx, by] of frameParts) {
    const part = box(bw, bh, 0.06, trim);
    part.position.set(bx, by, frameZ);
    part.castShadow = true;
    group.add(part);
  }
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: "#dfefff", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false }),
  );
  glass.position.set(cx, (y0 + y1) / 2, frameZ - 0.005);
  group.add(glass);

  // Outside: sky.
  const sky = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color("#5aa0e6") },
      uHorizon: { value: new THREE.Color("#cfe6f7") },
      uSun: { value: new THREE.Vector3(0.3, 0.6, 0) },
      uSunColour: { value: new THREE.Color("#fff3d6") },
      uStars: { value: 0 },
      uRain: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunColour;
      uniform float uStars; uniform float uTime; uniform float uRain;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float y = clamp(vUv.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.85, y));
        vec2 p = vec2(vUv.x * 2.0, vUv.y);
        float d = distance(p, uSun.xy);
        col += uSunColour * (smoothstep(0.06, 0.045, d) * uSun.z + exp(-d * 7.0) * 0.25 * uSun.z);
        // Soft drifting clouds.
        vec2 q = vec2(vUv.x * 5.0 + uTime * 0.01, vUv.y * 9.0);
        float c = noise(q) * 0.6 + noise(q * 2.1) * 0.3 + noise(q * 4.3) * 0.1;
        c = smoothstep(0.55, 0.85, c) * smoothstep(0.25, 0.6, y);
        col = mix(col, mix(uHorizon, vec3(1.0), 0.6 * (1.0 - uStars)), c * 0.65);
        float s = step(0.9975, hash(floor(vUv * vec2(900.0, 500.0)))) * uStars * smoothstep(0.2, 0.6, y) * (1.0 - uRain);
        col += vec3(s);
        // Rain: a grey sky and thin falling streaks.
        col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))) * 0.85, uRain * 0.65);
        float lane = floor(vUv.x * 900.0);
        float fall = fract(vUv.y * 7.0 + uTime * (2.2 + hash(vec2(lane, 1.0))) + hash(vec2(lane, 2.0)));
        float streak = step(0.72, hash(vec2(lane, 3.0))) * smoothstep(0.0, 0.02, fall) * smoothstep(0.09, 0.03, fall);
        col += vec3(0.78, 0.82, 0.9) * streak * uRain * 0.35;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: true,
  });
  const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(22, 9), sky);
  skyMesh.position.set(cx, 2.4, -9);
  group.add(skyMesh);

  // Rooftops and a tree, drawn once; windows lit at night on a second layer.
  const { day, lit } = sceneryTextures();
  const sceneryMat = new THREE.MeshBasicMaterial({ map: day, transparent: true, depthWrite: false });
  const scenery = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), sceneryMat);
  scenery.position.set(cx, 1.1, -4.5);
  group.add(scenery);
  const litMat = new THREE.MeshBasicMaterial({ map: lit, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const litMesh = new THREE.Mesh(scenery.geometry, litMat);
  litMesh.position.copy(scenery.position);
  litMesh.position.z += 0.01;
  group.add(litMesh);

  // Curtains: two gathered panels on a rod.
  const curtainTex = T.fabric("#c86a4a", { seed: 77, weave: 3, strength: 0.12 });
  curtainTex.repeat.set(3, 6);
  const curtainMat = withCornerShade(standard({ map: curtainTex, roughness: 0.95, side: THREE.DoubleSide }), [], { strength: 0.25, radius: 0.4 });
  const curtainH = y1 + 0.22;
  const makeCurtain = (width) => {
    const geo = new THREE.PlaneGeometry(width, curtainH, 40, 12);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const flare = 1 + 0.25 * (0.5 - y / curtainH);
      pos.setZ(i, Math.sin((x / width) * Math.PI * 9) * 0.035 * flare + 0.045);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, curtainMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const curtainL = makeCurtain(0.5);
  curtainL.position.set(x0 - 0.06, curtainH / 2, 0.02);
  const curtainR = makeCurtain(0.5);
  curtainR.position.set(x1 + 0.06, curtainH / 2, 0.02);
  group.add(curtainL, curtainR);
  const rodMat = standard({ color: "#3b2d24", roughness: 0.4, metalness: 0.3 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, w + 1.0, 10), rodMat);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(cx, curtainH + 0.02, 0.07);
  group.add(rod);
  for (const end of [-1, 1]) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), rodMat);
    finial.position.set(cx + end * (w / 2 + 0.5), curtainH + 0.02, 0.07);
    group.add(finial);
  }

  return {
    group,
    sky,
    sceneryMat,
    litMat,
    update(dt, state) {
      sky.uniforms.uTime.value += dt;
    },
  };
}

function sceneryTextures() {
  const W = 2048;
  const H = 512;
  const day = document.createElement("canvas");
  day.width = W;
  day.height = H;
  const lit = document.createElement("canvas");
  lit.width = W;
  lit.height = H;
  const d = day.getContext("2d");
  const l = lit.getContext("2d");
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Far rooftops.
  let x = 0;
  while (x < W) {
    const bw = 120 + rand() * 180;
    const bh = 140 + rand() * 170;
    const tone = 150 + rand() * 30;
    d.fillStyle = `rgb(${tone * 0.82},${tone * 0.8},${tone * 0.9})`;
    d.fillRect(x, H - bh, bw, bh);
    if (rand() < 0.6) {
      d.beginPath();
      d.moveTo(x - 6, H - bh);
      d.lineTo(x + bw / 2, H - bh - 40 - rand() * 30);
      d.lineTo(x + bw + 6, H - bh);
      d.fill();
    }
    if (rand() < 0.5) d.fillRect(x + bw * 0.7, H - bh - 46, 16, 46);
    for (let wy = H - bh + 22; wy < H - 30; wy += 44) {
      for (let wx = x + 16; wx < x + bw - 26; wx += 38) {
        d.fillStyle = "rgba(90,100,130,0.55)";
        d.fillRect(wx, wy, 18, 24);
        if (rand() < 0.45) {
          l.fillStyle = `rgba(255,${200 + rand() * 40},${120 + rand() * 60},0.95)`;
          l.fillRect(wx, wy, 18, 24);
        }
      }
    }
    x += bw + 6 + rand() * 30;
  }
  // A big tree near the window, to the left.
  d.fillStyle = "#4d6b3c";
  for (let i = 0; i < 26; i += 1) {
    d.beginPath();
    d.arc(560 + (rand() - 0.5) * 260, 170 + rand() * 220, 50 + rand() * 50, 0, Math.PI * 2);
    d.fill();
  }
  d.fillStyle = "#5a4535";
  d.fillRect(550, 330, 26, 200);
  const mk = (c) => {
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  return { day: mk(day), lit: mk(lit) };
}

// The front door, a hinged panel that swings out into a dim hallway.
function buildDoor(ctx, trim) {
  const group = new THREE.Group();
  group.name = "door";
  const { x0, x1, height } = DOOR;
  const w = x1 - x0;
  const t = WALL_THICKNESS;

  // Frame (architrave) around the opening.
  for (const [bw, bh, bx, by] of [
    [0.07, height + 0.07, x0 - 0.035, (height + 0.07) / 2],
    [0.07, height + 0.07, x1 + 0.035, (height + 0.07) / 2],
    [w + 0.14, 0.07, (x0 + x1) / 2, height + 0.035],
  ]) {
    const part = box(bw, bh, 0.025, trim);
    part.position.set(bx, by, 0.012);
    part.castShadow = true;
    group.add(part);
  }

  // The hallway: a small dim box behind the wall.
  const hallMat = withCornerShade(standard({ color: "#8d7a6a", roughness: 0.95, side: THREE.BackSide, shadowSide: THREE.DoubleSide }), [], { strength: 0.3, radius: 0.4 });
  const hall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 2.4), hallMat);
  hall.position.set((x0 + x1) / 2, 1.2, -t - 1.2);
  hall.castShadow = true;
  group.add(hall);
  const hallLight = new THREE.PointLight("#ffd9a0", 0.6, 4, 2);
  hallLight.position.set((x0 + x1) / 2, 2.0, -t - 1.2);
  group.add(hallLight);

  // Door leaf, hinged on the left edge, with panels and a brass knob.
  const doorMat = withCornerShade(standard({ color: "#5f8f8a", roughness: 0.55 }), [], { strength: 0.25, radius: 0.35 });
  const hinge = new THREE.Group();
  hinge.position.set(x0 + 0.01, 0, -t * 0.4);
  const leaf = box(w - 0.02, height - 0.01, 0.045, doorMat);
  leaf.position.set((w - 0.02) / 2, height / 2, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  hinge.add(leaf);
  const panelMat = withCornerShade(standard({ color: "#557f7a", roughness: 0.6 }), [], { strength: 0.25, radius: 0.35 });
  for (const [py, ph] of [[0.55, 0.75], [1.45, 0.75]]) {
    const panel = box(w - 0.22, ph, 0.012, panelMat);
    panel.position.set((w - 0.02) / 2, py, 0.028);
    hinge.add(panel);
  }
  const brass = standard({ color: "#d4a84a", roughness: 0.25, metalness: 1 });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), brass);
  knob.position.set(w - 0.12, 1.0, 0.06);
  hinge.add(knob);
  group.add(hinge);

  let open = 0;
  let target = 0;
  return {
    group,
    hinge,
    brass,
    setOpen(value) {
      target = value ? 1 : 0;
    },
    get isOpen() {
      return open > 0.6;
    },
    update(dt) {
      open += (target - open) * Math.min(1, dt * 2.5);
      hinge.rotation.y = open * 1.7;
    },
  };
}
