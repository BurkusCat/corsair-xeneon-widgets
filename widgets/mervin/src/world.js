// The world: room, lighting, Mervin, his brain, speech bubbles and input, ticked together.

import * as THREE from "three";
import { createBrain } from "./brain/brain.js";
import { createMemory } from "./core/memory.js";
import { createNavGrid } from "./core/nav.js";
import { createPicker } from "./core/picker.js";
import { log } from "./core/log.js";
import { createMervin } from "./mervin/index.js";
import { createProps } from "./mervin/props.js";
import { createEnvironment } from "./render/environment.js";
import { buildRoom } from "./room/index.js";
import { buildLighting } from "./room/lighting.js";
import { QUALITY } from "./settings.js";
import { createBubbles } from "./ui/bubbles.js";

// Bones whose screen positions bound Mervin for taps.
const HIT_BONES = ["head", "jaw", "neck", "chest", "spine", "hips", "handL", "handR", "forearmL", "forearmR", "footL", "footR", "shinL", "shinR", "ear2L", "ear2R"];

const EMPTY_CONTENT = {
  lexicons: {},
  lines: [{ id: 0, c: "viewer", t: [], w: 1, x: "Hello." }],
  chains: [{ id: "hello", topic: "hello", start: "idle", tags: [], steps: [{ o: 0, e: 0, a: ["Oh, hello."] }, { o: 0, e: 0, a: ["Nice to see you."] }, { o: 0, e: 1, a: ["Anyway."] }] }],
};

export function createWorld(ctx) {
  const { scene, renderer, camera, clock, params, rng } = ctx;
  let settings = ctx.settings;
  scene.background = new THREE.Color("#1b1714");

  const room = buildRoom(ctx);
  scene.add(room.group);
  const lighting = buildLighting(ctx, room);
  scene.add(lighting.group);
  lighting.setShadows(QUALITY[settings.quality]);
  const environment = createEnvironment(renderer, scene);

  const mervin = createMervin(window.MERVIN_MESH);
  scene.add(mervin.root);
  environment.hide(mervin.root);
  const props = createProps(mervin, scene);

  const memory = createMemory(ctx.storageKey);
  const content = window.MERVIN_CONTENT ?? EMPTY_CONTENT;
  const picker = createPicker(content, rng, memory.data);
  const bubbles = createBubbles(ctx.bubbleLayer);
  const nav = createNavGrid();
  const brain = createBrain({ mervin, room, lighting, nav, picker, memory, bubbles, props, clock, rng, camera, settings });
  log(`content: ${content.lines.length} lines, ${content.chains.length} chains; day ${memory.daysTogether()} together, visit ${memory.data.visits}`);

  // A fly, for the "follow the fly" activity.
  const fly = new THREE.Group();
  fly.add(new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: "#151515" })));
  const wingMat = new THREE.MeshBasicMaterial({ color: "#dfe8ff", transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const wings = [new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.007), wingMat), new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.007), wingMat)];
  wings[0].position.x = 0.008;
  wings[1].position.x = -0.008;
  fly.add(...wings);
  fly.visible = false;
  scene.add(fly);

  // Debug: ?view=face|body close-ups; ?poses=a,b cycles poses; ?pose=x holds one.
  const viewMode = params.get("view");
  const simSpeed = Math.max(0.1, Number(params.get("sim")) || 1);
  const debugPose = params.get("pose");
  window.__mervinDebug = {
    brain,
    pose(name, duration = 0) {
      mervin.rig.setPose(name, duration);
      document.title = name;
      return name;
    },
    poseAt(list, i) {
      const names = list.split(",");
      return this.pose(names[i % names.length]);
    },
    activity(id) {
      brain.startActivity(id);
      return id;
    },
    tap() {
      brain.tapMervin();
    },
  };

  let size = { w: 1, h: 1 };
  const projected = new THREE.Vector3();
  const headAnchor = new THREE.Vector3();

  function toScreen(world) {
    projected.copy(world).project(camera);
    return { x: ((projected.x + 1) / 2) * size.w, y: ((1 - projected.y) / 2) * size.h, behind: projected.z > 1 };
  }

  function mervinScreenBox() {
    if (!mervin.root.visible) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const p = new THREE.Vector3();
    for (const name of HIT_BONES) {
      mervin.body.bones[name].getWorldPosition(p);
      const s = toScreen(p);
      x0 = Math.min(x0, s.x);
      y0 = Math.min(y0, s.y);
      x1 = Math.max(x1, s.x);
      y1 = Math.max(y1, s.y);
    }
    const head = toScreen(mervin.headWorld(p));
    y0 = Math.min(y0, head.y);
    // Pad to at least 60 px each way, plus a little margin.
    const padX = Math.max(14, (64 - (x1 - x0)) / 2);
    const padY = Math.max(14, (64 - (y1 - y0)) / 2);
    return { x0: x0 - padX, y0: y0 - padY, x1: x1 + padX, y1: y1 + padY };
  }

  const box3 = new THREE.Box3();
  function furnitureAt(x, y) {
    let best = null;
    for (const item of room.interactables) {
      box3.setFromObject(item.object);
      if (box3.isEmpty()) continue;
      let sx0 = Infinity;
      let sy0 = Infinity;
      let sx1 = -Infinity;
      let sy1 = -Infinity;
      for (let i = 0; i < 8; i += 1) {
        const c = new THREE.Vector3(i & 1 ? box3.max.x : box3.min.x, i & 2 ? box3.max.y : box3.min.y, i & 4 ? box3.max.z : box3.min.z);
        const s = toScreen(c);
        if (s.behind) continue;
        sx0 = Math.min(sx0, s.x);
        sy0 = Math.min(sy0, s.y);
        sx1 = Math.max(sx1, s.x);
        sy1 = Math.max(sy1, s.y);
      }
      const pad = item.pad ?? 0;
      if (x < sx0 - pad || x > sx1 + pad || y < sy0 - pad || y > sy1 + pad) continue;
      const area = (sx1 - sx0) * (sy1 - sy0);
      const score = (item.priority ?? 1) * 1e9 - area;
      if (!best || score > best.score) best = { id: item.id, score };
    }
    return best?.id ?? null;
  }

  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function onTap(x, y) {
    if (viewMode) return;
    const box = mervinScreenBox();
    if (bubbles.hit(x, y) || (box && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1)) {
      brain.tapMervin();
      return;
    }
    const id = furnitureAt(x, y);
    if (id) {
      brain.tapFurniture(id);
      return;
    }
    raycaster.setFromCamera(new THREE.Vector2((x / size.w) * 2 - 1, 1 - (y / size.h) * 2), camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(floorPlane, hit)) brain.tapFloor(hit);
  }

  // Pointer input, debounced. Touch arrives as pointer events in iCUE.
  let lastTap = 0;
  ctx.stage.addEventListener("pointerdown", (event) => {
    const now = performance.now();
    if (now - lastTap < 400) return;
    lastTap = now;
    const rect = ctx.stage.getBoundingClientRect();
    onTap(event.clientX - rect.left, event.clientY - rect.top);
  });

  function lightKey() {
    return `${Math.round(lighting.state.hour * 2)}:${lighting.state.lampsOn}`;
  }

  return {
    room,
    lighting,
    mervin,
    brain,
    start() {
      lighting.update(0, clock.date(), settings.realTimeLighting);
      environment.refresh(lightKey(), true);
      if (viewMode || debugPose || params.get("poses")) {
        mervin.root.position.set(Number(params.get("x") ?? -0.4), 0, Number(params.get("z") ?? 3.0));
        brain.state.yaw = (Number(params.get("yaw") ?? 0) * Math.PI) / 180;
        mervin.root.rotation.set(0, brain.state.yaw, 0);
        mervin.rig.setPose(debugPose ?? "stand", 0);
      } else {
        brain.start();
        if (params.get("activity")) brain.startActivity(params.get("activity"));
      }
    },
    applySettings(next) {
      settings = next;
      lighting.setShadows(QUALITY[settings.quality]);
      brain.setSettings(settings);
      bubbles.setScale(size.w, size.h, settings.bubbleSize);
    },
    resize(w, h) {
      size = { w, h };
      bubbles.setScale(w, h, settings.bubbleSize);
    },
    cameraFocus() {
      const hips = mervin.body.bones.hips.getWorldPosition(new THREE.Vector3());
      return { x: hips.x, z: Math.min(hips.z, 4.6) };
    },
    cameraMode() {
      return brain.cameraMode;
    },
    cameraOverride(width, height) {
      // ?cam=x,y,z,vfov puts a debug camera anywhere (still looking straight at the back wall).
      if (params.get("cam")) {
        const [cx, cy, cz, fov = 40] = params.get("cam").split(",").map(Number);
        const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
        const tanH = tanV * (width / height);
        return { position: new THREE.Vector3(cx, cy, cz), lens: { name: "debug", width, height, tanLeft: tanH, tanRight: tanH, tanTop: tanV, tanBottom: tanV, span: tanV * 2 } };
      }
      if (!viewMode) return null;
      const p = mervin.root.position;
      const face = viewMode === "face";
      const vfov = face ? 14 : 34;
      const tanV = Math.tan(((vfov / 2) * Math.PI) / 180);
      const tanH = tanV * (width / height);
      return {
        position: new THREE.Vector3(p.x, face ? 1.02 : 0.62, p.z + (face ? 1.25 : 2.3)),
        lens: { name: "debug", width, height, tanLeft: tanH, tanRight: tanH, tanTop: tanV, tanBottom: tanV, span: tanV * 2 },
      };
    },
    wantedFps(limit = 30) {
      if (brain.state.sleeping && !brain.state.chain && !bubbles.active) return Math.max(8, limit / 3);
      if (brain.state.speed > 0.05 || bubbles.active || brain.state.chain) return limit;
      return Math.max(10, limit * 0.67);
    },
    update(dt, time) {
      // ?sim=4 runs his behaviour faster (for screenshots).
      dt *= simSpeed;
      const date = clock.date();
      room.update(dt, { date });
      lighting.update(dt, date, settings.realTimeLighting);
      environment.refresh(lightKey());
      if (viewMode || debugPose || params.get("poses")) {
        if (params.get("poses")) {
          const list = params.get("poses").split(",");
          const index = Math.floor(time / Number(params.get("every") || 1.5)) % list.length;
          if (index !== this._poseIndex) {
            this._poseIndex = index;
            mervin.rig.setPose(list[index], 0);
          }
        }
        mervin.rig.lookAt(params.get("look") === "0" ? null : camera.getWorldPosition(new THREE.Vector3()));
      } else {
        brain.update(dt);
      }
      // Hats come off after a while.
      if (brain.state.hatUntil && brain.state.time > brain.state.hatUntil) {
        brain.state.hatUntil = 0;
        props.removeHat();
        room.parts.hatShelf?.(null, true);
      }
      mervin.update(dt);
      props.update();
      // Fly.
      const target = brain.state.flyTarget;
      fly.visible = !!target;
      if (target) {
        fly.position.copy(target);
        wings[0].rotation.y = Math.sin(time * 90) * 0.8;
        wings[1].rotation.y = -wings[0].rotation.y;
      }
    },
    beforeRender() {},
    afterRender() {
      // Bubbles follow the top of his head.
      mervin.headWorld(headAnchor);
      const s = toScreen(headAnchor);
      const mouth = bubbles.update(this._lastDt ?? 1 / 30, { x: s.x, y: s.y });
      brain.setMouth(mouth);
    },
    setFrameDt(dt) {
      this._lastDt = dt;
    },
    contextRestored() {
      lighting.setShadows(QUALITY[settings.quality]);
      environment.refresh(lightKey(), true);
    },
    debugLines() {
      const s = brain.state;
      return [
        `hour ${lighting.state.hour.toFixed(2)}  act ${s.currentActivity ?? "-"}  ${s.chain ? `chain ${s.chain.id} ${s.chain.index + 1}/${s.chain.steps.length}` : ""}`,
        `energy ${s.energy.toFixed(2)}  chatter in ${Number.isFinite(s.chatterIn) ? s.chatterIn.toFixed(0) : "off"}  cam ${brain.cameraMode}`,
      ];
    },
    drawDebug(ctx2d) {
      const box = mervinScreenBox();
      if (!box) return;
      ctx2d.strokeStyle = "rgba(255,220,0,0.8)";
      ctx2d.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    },
  };
}
