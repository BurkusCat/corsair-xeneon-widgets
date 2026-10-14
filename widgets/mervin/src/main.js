// Entry point: iCUE lifecycle, renderer, camera framing, the frame loop.
// Built by build.mjs into widget/scripts/mervin.js as a classic script (IIFE).

import * as THREE from "three";
import { cameraTarget, lensFor, smoothDamp } from "./core/camera-math.js";
import { createClock } from "./core/clock.js";
import { createRng, hashString } from "./core/rng.js";
import { OnePointCamera } from "./render/one-point-camera.js";
import { drawDebug } from "./ui/debug.js";
import { createWorld } from "./world.js";
import { QUALITY, readSettings } from "./settings.js";
import { log, warn } from "./core/log.js";

const params = new URLSearchParams(location.search);
const debug = params.get("debug") === "1";

const app = {
  started: false,
  settings: null,
  renderer: null,
  scene: null,
  camera: null,
  lens: null,
  world: null,
  cam: { x: { value: 0, velocity: 0 }, z: { value: 9.5, velocity: 0 } },
  frames: 0,
  lastFrame: 0,
  fpsSamples: [],
};

function webglAvailable() {
  try {
    const probe = document.createElement("canvas");
    return !!probe.getContext("webgl2");
  } catch {
    return false;
  }
}

function showFallback(text) {
  const box = document.getElementById("fallback");
  box.textContent = text;
  box.hidden = false;
}

function resize() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const scale = QUALITY[app.settings.quality].renderScale;
  app.lens = lensFor(w, h);
  app.camera.setLens(app.lens);
  app.renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
  app.world.resize(w, h);
  if (debug) {
    const overlay = document.getElementById("debug");
    overlay.width = w;
    overlay.height = h;
  }
}

function applySettings() {
  const before = app.settings?.ignoreFpsLimit;
  app.settings = readSettings(params);
  // Report the measured frame rate again 10 s after the frame-limit switch changes.
  if (before !== undefined && before !== app.settings.ignoreFpsLimit) {
    app.reported = false;
    app.reportAt = performance.now() + 10000;
  }
  if (app.renderer) {
    app.world.applySettings(app.settings);
    resize();
  }
}

function updateCamera(dt, snap) {
  const override = app.world.cameraOverride?.(app.lens.width, app.lens.height);
  if (override) {
    app.camera.setLens(override.lens);
    app.camera.position.copy(override.position);
    app.camera.updateMatrixWorld();
    return;
  }
  const focus = app.world.cameraFocus();
  const current = { x: app.cam.x.value, z: app.cam.z.value };
  const target = cameraTarget(app.lens, focus, app.world.cameraMode(), current);
  if (snap) {
    app.cam.x = { value: target.x, velocity: 0 };
    app.cam.z = { value: target.z, velocity: 0 };
  } else {
    smoothDamp(app.cam.x, target.x, 0.9, dt);
    smoothDamp(app.cam.z, target.z, 1.1, dt);
  }
  app.camera.position.set(app.cam.x.value, target.y, app.cam.z.value);
  app.camera.updateMatrixWorld();
}

function frame(now) {
  requestAnimationFrame(frame);
  // iCUE suggests a frame limit (10 for this widget on the EDGE), but the EDGE does show more:
  // "Smooth motion (30 fps)" (on by default) renders up to 30 fps; off honours iCUE's limit.
  const icueLimit = Number(window.iCUE?.fpsLimit) || 30;
  const fpsLimit = app.settings.ignoreFpsLimit ? Math.max(30, icueLimit) : icueLimit;
  const wanted = Math.min(fpsLimit, app.world.wantedFps(fpsLimit));
  const elapsed = now - app.lastFrame;
  if (elapsed < 1000 / wanted - 2) return;
  const dt = Math.min(0.1, elapsed / 1000);
  const snap = app.frames === 0 || elapsed > 60000;
  app.lastFrame = now;

  app.world.update(snap ? 0 : dt, now / 1000);
  updateCamera(dt, snap);
  app.world.setFrameDt?.(dt);
  app.world.beforeRender(app.camera);
  app.renderer.render(app.scene, app.camera);
  app.world.afterRender(app.camera, app.lens);
  app.frames += 1;

  app.fpsSamples.push(now);
  while (app.fpsSamples.length && now - app.fpsSamples[0] > 1000) app.fpsSamples.shift();
  window.__widgetStats = {
    frames: app.frames,
    fps: app.fpsSamples.length,
    layout: app.lens.name,
    calls: app.renderer.info.render.calls,
    triangles: app.renderer.info.render.triangles,
  };
  if (debug) drawDebug(document.getElementById("debug"), app, window.__widgetStats);
  if (app.frames === 3) window.__widgetReady = true;
  // iCUE only logs warnings and errors from widgets, so report how it's running as a warning.
  if (!app.reported && now > (app.reportAt ?? 10000)) {
    app.reported = true;
    warn(`running: ${app.rendererName}; ${app.fpsSamples.length} fps (iCUE limit ${icueLimit}${app.settings.ignoreFpsLimit ? ", ignored" : ""}); ${app.lens.width}x${app.lens.height} ${app.lens.name}; quality ${app.settings.quality}`);
  }
}

function init() {
  if (app.started) {
    applySettings();
    return;
  }
  app.started = true;
  app.settings = readSettings(params);
  if (!webglAvailable()) {
    showFallback("Mervin needs WebGL, which isn't available here.");
    log("WebGL2 unavailable");
    window.__widgetReady = true;
    return;
  }

  const canvas = document.getElementById("scene");
  app.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  app.renderer.setPixelRatio(1);
  app.renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  app.renderer.toneMappingExposure = 1.0;
  app.renderer.shadowMap.enabled = true;
  app.renderer.shadowMap.type = THREE.PCFShadowMap;

  // Shader compile notes (D3D's "gradient in flow control" hints) would fill iCUE's log.
  app.renderer.debug.checkShaderErrors = debug;
  const gl = app.renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  app.rendererName = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "renderer hidden";
  log(`WebGL2 ${app.rendererName}; fpsLimit ${window.iCUE?.fpsLimit ?? "n/a"}; instance ${window.uniqueId ?? "none"}`);

  const seed = params.has("seed") ? Number(params.get("seed")) : hashString(String(window.uniqueId || "mervin")) ^ Date.now();
  app.scene = new THREE.Scene();
  app.camera = new OnePointCamera();
  app.world = createWorld({
    renderer: app.renderer,
    scene: app.scene,
    camera: app.camera,
    settings: app.settings,
    clock: createClock({ now: params.get("now"), speed: Number(params.get("speed")) || 1 }),
    rng: createRng(seed),
    params,
    debug,
    storageKey: `mervin:${window.uniqueId || "default"}`,
    stage: document.getElementById("stage"),
    bubbleLayer: document.getElementById("bubbles"),
  });
  if (debug) document.getElementById("debug").hidden = false;

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    log("WebGL context lost");
    app.lostAt = Date.now();
    setTimeout(() => {
      if (app.lostAt) location.reload();
    }, 5000);
  });
  canvas.addEventListener("webglcontextrestored", () => {
    log("WebGL context restored");
    app.lostAt = 0;
    app.world.contextRestored();
  });

  window.addEventListener("resize", resize);
  resize();
  app.world.start();
  requestAnimationFrame(frame);
}

window.icueEvents = {
  onICUEInitialized: init,
  onDataUpdated: applySettings,
};

if (window.iCUE_initialized || typeof window.iCUE === "undefined") init();
else setTimeout(init, 3000);
