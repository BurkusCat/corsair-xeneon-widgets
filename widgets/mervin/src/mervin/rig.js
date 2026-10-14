// Poses Mervin's skeleton every frame. Layers, bottom to top:
//   1. base pose: a pose from poses.js (static, or a function of time for loops like dancing),
//      crossfaded over a duration when it changes
//   2. walk cycle, weighted by ground speed
//   3. procedural life: breathing, look-at (neck, head, eyes), blinking and lid level,
//      jaw while talking, ear twitches
// Rotations are relative to the sculpted A-pose (identity bone rotations).
//
// Pose values are Euler [x, y, z] except for elbows and wrists (forearm*, hand*), which take
// [flex, twist, side]: flex bends toward the front of the arm, about the palm-normal axis.
// Upper arms take [x, y, z, twist].

import * as THREE from "three";
import { expandPose, POSES } from "./poses.js";

const D = Math.PI / 180;
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();

export function createRig(body) {
  const { bones, eyes, anchors } = body;
  const names = Object.keys(bones);
  const armDir = { L: new THREE.Vector3(...anchors.armDir), R: new THREE.Vector3(-anchors.armDir[0], anchors.armDir[1], anchors.armDir[2]) };
  // The elbow axis: bending it swings the forearm toward the front of the body.
  const elbowAxis = {
    L: new THREE.Vector3().crossVectors(armDir.L, new THREE.Vector3(0, 0, 1)).normalize(),
    R: new THREE.Vector3().crossVectors(armDir.R, new THREE.Vector3(0, 0, 1)).normalize(),
  };
  const hipsRest = bones.hips.position.clone();

  function quatFor(name, value, out) {
    const elbowSide = /^(forearm|hand)([LR])$/.exec(name);
    if (elbowSide) {
      const side = elbowSide[2];
      const [flex = 0, twist = 0, sideways = 0] = value;
      out.setFromAxisAngle(elbowAxis[side], flex);
      tmpQ2.setFromAxisAngle(armDir[side], side === "L" ? twist : -twist);
      out.multiply(tmpQ2);
      if (sideways) {
        tmpQ2.setFromAxisAngle(tmpV.set(0, 0, 1), side === "L" ? sideways : -sideways);
        out.premultiply(tmpQ2);
      }
      return out;
    }
    tmpE.set(value[0] || 0, value[1] || 0, value[2] || 0, "XYZ");
    out.setFromEuler(tmpE);
    // Upper arms take an optional 4th value: twist about the arm's own axis (positive turns
    // the inside of the elbow toward the body), applied before the swing.
    const upper = /^upperArm([LR])$/.exec(name);
    if (upper && value[3]) {
      const side = upper[1];
      tmpQ2.setFromAxisAngle(armDir[side], side === "L" ? value[3] : -value[3]);
      out.multiply(tmpQ2);
    }
    return out;
  }

  // Resolve a pose (name, object or function of time) into bone quaternions and offsets.
  function evaluate(source, time) {
    let pose = source;
    if (typeof pose === "string") pose = POSES[pose] ?? POSES.stand;
    if (typeof pose === "function") pose = pose(time);
    const flat = expandPose(pose);
    const quats = {};
    for (const name of names) {
      const value = flat[name];
      quats[name] = value ? quatFor(name, value, new THREE.Quaternion()) : new THREE.Quaternion();
    }
    return { quats, hipsY: flat.hipsY ?? 0, hipsZ: flat.hipsZ ?? 0, hipsX: flat.hipsX ?? 0 };
  }

  const state = {
    from: null,
    to: "stand",
    toTime0: 0,
    blend: 1,
    duration: 0.5,
    time: 0,
    walk: { phase: 0, weight: 0, speed: 0 },
    look: { yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0, target: null, weight: 1 },
    lids: { level: 0.45, blink: 0, nextBlink: 2, blinkT: -1, override: null },
    jaw: 0,
    jawTarget: 0,
    ears: { twitch: 0, nextTwitch: 4, side: 1, droop: 0 },
    breathe: 0,
  };
  let current = evaluate("stand", 0);

  function setPose(source, duration = 0.6) {
    state.from = current;
    state.to = source;
    state.toTime0 = state.time;
    state.blend = duration <= 0 ? 1 : 0;
    state.duration = Math.max(0.0001, duration);
  }

  function walkLayer(out, w, phase) {
    if (w <= 0.001) return;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const add = (name, x, y, z) => {
      tmpE.set(x * w, y * w, z * w, "XYZ");
      tmpQ.setFromEuler(tmpE);
      out.quats[name].premultiply(tmpQ);
    };
    // Legs: a short, unhurried stride with a soft knee lift on the swing.
    add("thighL", -s * 24 * D, 0, 0);
    add("thighR", s * 24 * D, 0, 0);
    add("shinL", Math.max(0, -c) * 38 * D + 6 * D, 0, 0);
    add("shinR", Math.max(0, c) * 38 * D + 6 * D, 0, 0);
    add("footL", (s * 10 - Math.max(0, -c) * 14) * D, 0, 0);
    add("footR", (-s * 10 - Math.max(0, c) * 14) * D, 0, 0);
    // Body: a little sway, roll and a relaxed slouch.
    add("hips", 0, s * 6 * D, s * 3 * D);
    add("spine", 4 * D + Math.cos(2 * phase) * 1.5 * D, -s * 4 * D, -s * 2 * D);
    add("chest", 0, -s * 3 * D, 0);
    add("head", 0, s * 3 * D, s * 1.5 * D);
    // Arms swing against the legs.
    add("upperArmL", s * 16 * D, 0, 0);
    add("upperArmR", -s * 16 * D, 0, 0);
    out.hipsY += (Math.cos(2 * phase) * 0.011 - 0.006) * w;
  }

  // Head turns toward a target; eyes lead.
  function lookLayer(out, dt, rootWorld) {
    const look = state.look;
    let yaw = 0;
    let pitch = 0;
    if (look.target) {
      tmpV.copy(look.target);
      rootWorld.worldToLocal(tmpV);
      const headY = 1.0 + out.hipsY;
      const dx = tmpV.x;
      const dy = tmpV.y - headY;
      const dz = tmpV.z;
      yaw = Math.atan2(dx, Math.max(0.05, dz) + (dz < 0 ? 0 : 0));
      if (dz < 0) yaw = Math.sign(dx || 1) * Math.min(Math.PI * 0.45, Math.abs(yaw));
      pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    }
    const maxYaw = 70 * D;
    yaw = THREE.MathUtils.clamp(yaw, -maxYaw, maxYaw) * look.weight;
    pitch = THREE.MathUtils.clamp(pitch, -35 * D, 40 * D) * look.weight;
    const k = Math.min(1, dt * 3);
    look.yaw += (yaw - look.yaw) * k;
    look.pitch += (pitch - look.pitch) * k;
    const ke = Math.min(1, dt * 12);
    look.eyeYaw += (THREE.MathUtils.clamp(yaw - look.yaw, -25 * D, 25 * D) + look.yaw * 0.25 - look.eyeYaw) * ke;
    look.eyePitch += (THREE.MathUtils.clamp(pitch - look.pitch, -20 * D, 20 * D) + look.pitch * 0.2 - look.eyePitch) * ke;
    tmpE.set(look.pitch * 0.35, look.yaw * 0.4, 0, "XYZ");
    out.quats.neck.premultiply(tmpQ.setFromEuler(tmpE));
    tmpE.set(look.pitch * 0.65, look.yaw * 0.6, 0, "XYZ");
    out.quats.head.premultiply(tmpQ.setFromEuler(tmpE));
  }

  function faceLayer(dt) {
    // Blinks every 2-6 s; lids rest at `level` (0 wide open, 1 shut).
    const lids = state.lids;
    lids.nextBlink -= dt;
    if (lids.nextBlink <= 0 && lids.blinkT < 0) {
      lids.blinkT = 0;
      lids.nextBlink = 1.8 + Math.random() * 4.5;
    }
    let blink = 0;
    if (lids.blinkT >= 0) {
      lids.blinkT += dt;
      blink = Math.sin(Math.min(1, lids.blinkT / 0.18) * Math.PI);
      if (lids.blinkT > 0.18) lids.blinkT = -1;
    }
    const level = lids.override ?? lids.level;
    const closed = Math.max(level, blink);
    for (const side of ["L", "R"]) {
      const eye = eyes[side];
      // Upper lid: -55 deg is wide open, +62 deg is shut.
      eye.upperPivot.rotation.x = THREE.MathUtils.lerp(-58 * D, 64 * D, closed) + state.look.eyePitch * 0.4;
      eye.lowerPivot.rotation.x = THREE.MathUtils.lerp(8 * D, -14 * D, closed * 0.7);
      eye.pivot.rotation.set(state.look.eyePitch, state.look.eyeYaw, 0, "YXZ");
    }
    // Jaw follows the talk signal quickly.
    state.jaw += (state.jawTarget - state.jaw) * Math.min(1, dt * 22);
    // Ears: an occasional twitch.
    const ears = state.ears;
    ears.nextTwitch -= dt;
    if (ears.nextTwitch <= 0) {
      ears.twitch = 1;
      ears.side = Math.random() < 0.5 ? 1 : -1;
      ears.nextTwitch = 3 + Math.random() * 9;
    }
    ears.twitch = Math.max(0, ears.twitch - dt * 4);
  }

  return {
    state,
    setPose,
    lookAt(target, weight = 1) {
      state.look.target = target;
      state.look.weight = weight;
    },
    setLids(level) {
      state.lids.level = level;
    },
    setLidOverride(level) {
      state.lids.override = level;
    },
    setJaw(open) {
      state.jawTarget = open;
    },
    blink() {
      state.lids.nextBlink = 0;
    },
    update(dt, rootWorld) {
      state.time += dt;
      state.blend = Math.min(1, state.blend + dt / state.duration);
      const target = evaluate(state.to, state.time - state.toTime0);
      let out = target;
      if (state.blend < 1 && state.from) {
        const t = state.blend * state.blend * (3 - 2 * state.blend);
        out = { quats: {}, hipsY: 0, hipsZ: 0, hipsX: 0 };
        for (const name of names) out.quats[name] = state.from.quats[name].clone().slerp(target.quats[name], t);
        out.hipsY = THREE.MathUtils.lerp(state.from.hipsY, target.hipsY, t);
        out.hipsZ = THREE.MathUtils.lerp(state.from.hipsZ, target.hipsZ, t);
        out.hipsX = THREE.MathUtils.lerp(state.from.hipsX, target.hipsX, t);
      }
      // Keep a copy as the crossfade source for the next change (before additive layers).
      current = { quats: {}, hipsY: out.hipsY, hipsZ: out.hipsZ, hipsX: out.hipsX };
      for (const name of names) current.quats[name] = out.quats[name].clone();
      if (out === target) out = current;
      const work = { quats: {}, hipsY: out.hipsY, hipsZ: out.hipsZ, hipsX: out.hipsX };
      for (const name of names) work.quats[name] = out.quats[name].clone();

      walkLayer(work, state.walk.weight, state.walk.phase);
      // Breathing: slow chest and belly movement.
      state.breathe += dt * 1.35;
      const b = Math.sin(state.breathe);
      work.quats.chest.multiply(tmpQ.setFromEuler(tmpE.set(-b * 1.6 * D, 0, 0)));
      work.quats.spine.multiply(tmpQ.setFromEuler(tmpE.set(b * 0.8 * D, 0, 0)));
      work.quats["clavicleL"].multiply(tmpQ.setFromEuler(tmpE.set(0, 0, b * 1.2 * D)));
      work.quats["clavicleR"].multiply(tmpQ.setFromEuler(tmpE.set(0, 0, -b * 1.2 * D)));
      if (rootWorld) lookLayer(work, dt, rootWorld);
      faceLayer(dt);
      // The sculpt has the mouth slightly open; at rest the jaw closes it, and opens to talk.
      work.quats.jaw.multiply(tmpQ.setFromEuler(tmpE.set(-4.5 * D + state.jaw * 19 * D, 0, 0)));
      const tw = state.ears.twitch;
      if (tw > 0) {
        const side = state.ears.side > 0 ? "L" : "R";
        const sign = side === "L" ? 1 : -1;
        work.quats[`ear1${side}`].multiply(tmpQ.setFromEuler(tmpE.set(0, sign * Math.sin(tw * 9) * 7 * D * tw, sign * 6 * D * tw)));
      }

      for (const name of names) bones[name].quaternion.copy(work.quats[name]);
      bones.hips.position.set(hipsRest.x + work.hipsX, hipsRest.y + work.hipsY, hipsRest.z + work.hipsZ);
    },
  };
}
