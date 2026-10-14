// Light for the time of day. The sun shines in through the back window (so the wall's
// shadow leaves a bright patch on the floor), a hemisphere light fills, and at night the
// lamps take over. With "Day and night follow the clock" off, it is always mid-afternoon.

import * as THREE from "three";
import { hourOf } from "../core/clock.js";
import { ROOM, WINDOW } from "../core/layout.js";

const SUNRISE = 6.5;
const SUNSET = 19.5;

function mixColour(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t)));
}

// Sky and light settings for an hour of the day. Pure apart from THREE.Color.
export function skyAt(hour) {
  const dayLength = SUNSET - SUNRISE;
  const t = (hour - SUNRISE) / dayLength; // 0 at sunrise, 1 at sunset
  const elevation = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI); // 0..1
  const isDay = t > 0 && t < 1;
  // Twilight: an hour either side of sunrise and sunset.
  const dusk = Math.max(0, 1 - Math.min(Math.abs(hour - SUNRISE), Math.abs(hour - SUNSET)));
  const night = isDay ? 0 : Math.min(1, Math.min(Math.abs(hour - SUNSET + (hour < SUNRISE ? 24 : 0)), Math.abs(SUNRISE - hour + (hour > SUNSET ? 24 : 0))));
  const day = isDay ? Math.min(1, elevation * 2.2) : 0;
  return {
    t,
    isDay,
    elevation,
    day,
    dusk,
    night: Math.max(0, Math.min(1, night)),
    top: isDay ? mixColour("#e6905c", "#4f97e0", day) : mixColour("#2a2a55", "#0b1026", night),
    horizon: isDay ? mixColour("#ffc48a", "#cfe5f6", day) : mixColour("#e48c66", "#1b2244", night),
    sunColour: mixColour("#ff9a5a", "#fff4dc", day),
  };
}

// Weather: rain in about a quarter of three-hour blocks, the same for everyone on a day.
export function isRaining(date) {
  const block = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${Math.floor(date.getHours() / 3)}`;
  let h = 2166136261;
  for (let i = 0; i < block.length; i += 1) h = Math.imul(h ^ block.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100) < 24;
}

export function buildLighting(ctx, room) {
  const group = new THREE.Group();
  group.name = "lighting";

  const hemi = new THREE.HemisphereLight("#fff4e6", "#7a5a40", 1.2);
  group.add(hemi);

  // Sun: behind the back wall, shining in through the window and down.
  const sun = new THREE.DirectionalLight("#fff1d6", 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  const cam = sun.shadow.camera;
  cam.left = -6;
  cam.right = 6;
  cam.top = 6;
  cam.bottom = -6;
  cam.near = 0.5;
  cam.far = 30;
  const sunTarget = new THREE.Object3D();
  sunTarget.position.set((WINDOW.x0 + WINDOW.x1) / 2, 0, 2.2);
  sun.target = sunTarget;
  group.add(sun, sunTarget);

  // Light bouncing in from the window, so the room is not flat when the sun is low.
  const bounce = new THREE.PointLight("#ffe7cc", 0, 9, 1.6);
  bounce.position.set((WINDOW.x0 + WINDOW.x1) / 2, 1.6, 1.2);
  group.add(bounce);

  // Front fill from the viewer's side (the "fourth wall"): soft, so faces read.
  const front = new THREE.DirectionalLight("#fff0e0", 0.6);
  front.position.set(0, 2.4, 12);
  front.target.position.set(0, 0.8, 1.5);
  group.add(front, front.target);

  // Ceiling pendant: warm, used in the evening.
  const ceiling = new THREE.PointLight("#ffcf94", 0, 12, 1.6);
  ceiling.position.set(-0.4, ROOM.height - 0.55, 2.2);
  group.add(ceiling);

  // TV glow from the fourth wall, flickering while he watches.
  const tv = new THREE.PointLight("#8ab4ff", 0, 7, 1.5);
  tv.position.set(-0.85, 0.95, 4.6);
  group.add(tv);

  const state = { lampsOn: false, tvOn: false, tvPhase: 0, hour: -1, lampsForced: null, raining: false };

  // Fit the sun's shadow camera around the whole room box (in light space), so nothing in
  // the room is ever outside the shadow map (which would leave it lit through the walls).
  const corners = [];
  for (const x of [-ROOM.halfWidth, ROOM.halfWidth]) {
    for (const y of [0, ROOM.height]) for (const z of [-0.3, ROOM.extendTo]) corners.push(new THREE.Vector3(x, y, z));
  }
  const lightView = new THREE.Matrix4();
  const p = new THREE.Vector3();
  function fitShadowCamera() {
    sun.updateMatrixWorld();
    sunTarget.updateMatrixWorld();
    cam.position.copy(sun.position);
    cam.lookAt(sunTarget.position);
    cam.updateMatrixWorld();
    lightView.copy(cam.matrixWorldInverse);
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const c of corners) {
      p.copy(c).applyMatrix4(lightView);
      min.min(p);
      max.max(p);
    }
    cam.left = min.x - 0.2;
    cam.right = max.x + 0.2;
    cam.bottom = min.y - 0.2;
    cam.top = max.y + 0.2;
    cam.near = Math.max(0.1, -max.z - 1);
    cam.far = -min.z + 1;
    cam.updateProjectionMatrix();
  }

  function applyHour(hour) {
    state.hour = hour;
    const s = skyAt(hour);
    const rain = state.raining ? 1 : 0;
    const sky = room.shell.window.sky;
    sky.uniforms.uTop.value.copy(s.top);
    sky.uniforms.uHorizon.value.copy(s.horizon);
    sky.uniforms.uStars.value = s.night;
    sky.uniforms.uRain.value = rain;
    // Sun disc position in sky UV space (x 0..2 across, y 0..1 up).
    sky.uniforms.uSun.value.set(0.3 + s.t * 1.4, 0.15 + s.elevation * 0.75, s.isDay ? 1 : 0);
    sky.uniforms.uSunColour.value.copy(s.sunColour);
    room.shell.window.sceneryMat.color.copy(mixColour("#20253a", "#ffffff", s.day + s.dusk * 0.5));
    room.shell.window.litMat.opacity = Math.max(s.night, s.dusk * 0.6);

    // The sun comes in from behind the window, from the left in the morning and the right later.
    // Kept low (14-24 degrees) so the window's patch of sunlight lands on the rug, past the sofa.
    const az = (s.t - 0.5) * 1.4;
    const el = 0.25 + s.elevation * 0.17;
    const reach = 9;
    sun.position.set(
      sunTarget.position.x - Math.sin(az) * reach,
      Math.tan(el) * reach,
      sunTarget.position.z - Math.cos(az) * reach,
    );
    fitShadowCamera();
    sun.color.copy(s.sunColour);
    sun.intensity = s.isDay ? (1.2 + s.day * 3.2) * (1 - rain * 0.8) : 0;
    // Moonlight at night: cool and dim.
    if (!s.isDay) {
      sun.color.set("#8aa3ff");
      sun.intensity = 0.35 * s.night;
    }
    hemi.intensity = (0.35 + s.day * 0.9 + s.dusk * 0.2) * (1 - rain * 0.2);
    hemi.color.copy(mixColour("#9aa8d8", "#fff4e6", s.day + s.dusk * 0.4));
    hemi.groundColor.copy(mixColour("#2c2430", "#7a5a40", s.day));
    bounce.intensity = s.day * 6;
    front.intensity = 0.2 + s.day * 0.45;
    const lamps = state.lampsForced ?? (hour >= SUNSET - 1.2 || hour < SUNRISE + 0.6);
    state.lampsOn = lamps;
    ceiling.intensity = lamps ? 9 : 0;
    if (room.setLamps) room.setLamps(lamps, s);
    if (ctx.params?.get("lights") === "sun") {
      hemi.intensity = 0;
      bounce.intensity = 0;
      front.intensity = 0;
      ceiling.intensity = 0;
    }
  }

  return {
    group,
    sun,
    hemi,
    state,
    applyHour,
    setTv(on) {
      state.tvOn = on;
    },
    setShadows(quality) {
      sun.castShadow = quality.sunShadows;
      sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    },
    update(dt, clockDate, realTimeLighting) {
      const hour = realTimeLighting ? hourOf(clockDate) : 15.5;
      const raining = ctx.params?.get("rain") ? ctx.params.get("rain") === "1" : isRaining(clockDate);
      if (raining !== state.raining) {
        state.raining = raining;
        state.hour = -1;
      }
      if (Math.abs(hour - state.hour) > 1 / 120) applyHour(hour);
      // TV flicker: slow colour drift with quick brightness cuts, like scene changes.
      if (state.tvOn) {
        state.tvPhase += dt;
        const cut = Math.floor(state.tvPhase / 2.3);
        const hue = (Math.sin(cut * 12.9898) * 43758.5453) % 1;
        tv.color.setHSL(Math.abs(hue) * 0.7 + 0.5, 0.45, 0.62);
        tv.intensity = 7 + Math.sin(state.tvPhase * 7.3) * 1.2 + Math.sin(state.tvPhase * 17.1) * 0.8;
      } else {
        tv.intensity = Math.max(0, tv.intensity - dt * 20);
      }
    },
  };
}
