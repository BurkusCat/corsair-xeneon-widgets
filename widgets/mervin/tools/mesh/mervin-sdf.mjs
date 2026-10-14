// Mervin, sculpted as a signed-distance field, plus his skeleton and the anchor points the
// runtime needs (eyes, teeth, chain, bracelet, hand grips). Build time only.
//
// Model space: metres, feet on y = 0, facing +z. His left is +x ("L").
// Rest pose is an A-pose: arms 40 degrees below horizontal, legs slightly apart, fingers
// spread, mouth a little open, so skin weights never bridge two body parts.
//
// Reference: blue-violet mottled skin, a big bald cranium, heavy brow, small sleepy eyes,
// wide flat nose, long upper lip, wide thin mouth, huge pointed ears swept out and back,
// thick short neck, sloping shoulders, saggy chest, pot belly, thin long arms, big hands
// with long fingers, short legs, long feet and toes. Baggy dark shorts, gold chain.

import { blade, ellipsoid, roundCone, sphere, v } from "./sdf.mjs";

const DEG = Math.PI / 180;

// ---- Skeleton -----------------------------------------------------------------------------

const ARM_DOWN = 40 * DEG;
const SHOULDER = [0.152, 0.792, -0.012];
const ARM_DIR = [Math.cos(ARM_DOWN), -Math.sin(ARM_DOWN), 0];
const UPPER_ARM = 0.215;
const FOREARM = 0.205;
const ELBOW = v.add(SHOULDER, v.scale(ARM_DIR, UPPER_ARM));
const WRIST = v.add(ELBOW, v.scale(ARM_DIR, FOREARM));
const PALM_NORMAL = v.norm(v.cross(ARM_DIR, [0, 0, 1])); // points down and in
const FRONT = [0, 0, 1];

const HIP = [0.088, 0.452, 0.0];
const KNEE = [0.104, 0.252, 0.022];
const ANKLE = [0.114, 0.072, -0.004];
const BALL = [0.122, 0.026, 0.118];

// Fingers fan in the hand plane (spanned by the arm direction and +z).
function fanDir(theta) {
  return v.norm(v.add(v.scale(ARM_DIR, Math.cos(theta)), v.scale(FRONT, Math.sin(theta))));
}
const FINGERS = [
  { name: "finger1", offset: -0.024, theta: -0.22, len: [0.052, 0.046], r: [0.0082, 0.0068] },
  { name: "finger2", offset: 0.0, theta: 0.0, len: [0.058, 0.05], r: [0.0085, 0.007] },
  { name: "finger3", offset: 0.024, theta: 0.2, len: [0.05, 0.044], r: [0.0082, 0.0068] },
];
const THUMB = { name: "thumb", base: v.add(v.add(WRIST, v.scale(ARM_DIR, 0.024)), v.scale(FRONT, 0.034)), theta: 0.95, len: [0.04, 0.034], r: [0.0095, 0.0078] };

function fingerJoints(f) {
  const base = f.base ?? v.add(v.add(WRIST, v.scale(ARM_DIR, 0.078)), v.scale(FRONT, f.offset));
  const dir = fanDir(f.theta);
  const mid = v.add(base, v.scale(dir, f.len[0]));
  const tip = v.add(mid, v.scale(dir, f.len[1]));
  return { base, mid, tip, dir };
}

// Bones: name, parent, rest position (model space). Rotations are identity in the rest pose.
export function skeleton() {
  const bones = [
    ["root", null, [0, 0, 0]],
    ["hips", "root", [0, 0.48, 0.0]],
    ["spine", "hips", [0, 0.6, 0.0]],
    ["chest", "spine", [0, 0.735, -0.012]],
    ["neck", "chest", [0, 0.85, -0.014]],
    ["head", "neck", [0, 0.95, -0.004]],
    ["jaw", "head", [0, 0.968, 0.012]],
  ];
  for (const s of ["L", "R"]) {
    const m = s === "L" ? (p) => p : v.mirror;
    bones.push([`ear1${s}`, "head", m([0.104, 1.056, -0.02])]);
    bones.push([`ear2${s}`, `ear1${s}`, m([0.205, 1.08, -0.048])]);
    bones.push([`clavicle${s}`, "chest", m([0.04, 0.808, -0.012])]);
    bones.push([`upperArm${s}`, `clavicle${s}`, m(SHOULDER)]);
    bones.push([`forearm${s}`, `upperArm${s}`, m(ELBOW)]);
    bones.push([`hand${s}`, `forearm${s}`, m(WRIST)]);
    for (const f of [...FINGERS, THUMB]) {
      const j = fingerJoints(f);
      bones.push([`${f.name}a${s}`, `hand${s}`, m(j.base)]);
      bones.push([`${f.name}b${s}`, `${f.name}a${s}`, m(j.mid)]);
    }
    bones.push([`thigh${s}`, "hips", m(HIP)]);
    bones.push([`shin${s}`, `thigh${s}`, m(KNEE)]);
    bones.push([`foot${s}`, `shin${s}`, m(ANKLE)]);
    bones.push([`toes${s}`, `foot${s}`, m(BALL)]);
  }
  return bones.map(([name, parent, pos]) => ({ name, parent, pos }));
}

// ---- Sculpt ------------------------------------------------------------------------------
// Each part: prim, op ("add" | "sub"), k (blend radius), bone (string) or split [boneA, boneB]
// (weights move from A to B along the primitive's axis), region ("skin" | "shorts" | "mouth").

export function parts() {
  const P = [];
  const add = (prim, bone, k = 0.02, region = "skin") => P.push({ prim, op: "add", k, bone, region });
  const sub = (prim, k = 0.006, region = "mouth") => P.push({ prim, op: "sub", k, region });
  const both = (fn) => {
    fn((p) => p, "L", 1);
    fn(v.mirror, "R", -1);
  };

  // Torso.
  add(ellipsoid([0, 0.47, -0.008], [0.152, 0.088, 0.112]), "hips", 0.04);
  add(ellipsoid([0, 0.585, 0.044], [0.158, 0.148, 0.148]), "spine", 0.05);
  add(ellipsoid([0, 0.738, -0.012], [0.142, 0.1, 0.094]), "chest", 0.05);
  add(ellipsoid([0, 0.762, -0.048], [0.125, 0.085, 0.075]), "chest", 0.04);
  both((m, s) => {
    add(ellipsoid(m([0.06, 0.715, 0.062]), [0.058, 0.046, 0.038]), "chest", 0.03);
    add(sphere(m([0.146, 0.79, -0.012]), 0.042), `clavicle${s}`, 0.035);
  });
  add(roundCone([0, 0.8, -0.016], [0, 0.955, -0.002], 0.074, 0.07), ["neck", "head"], 0.035);

  // Head.
  add(ellipsoid([0, 1.074, -0.02], [0.121, 0.128, 0.138]), "head", 0.03);
  add(ellipsoid([0, 1.09, -0.06], [0.108, 0.108, 0.108]), "head", 0.03);
  add(ellipsoid([0, 0.988, 0.045], [0.097, 0.084, 0.094]), "head", 0.035);
  add(ellipsoid([0, 0.952, 0.07], [0.083, 0.05, 0.072]), "head", 0.025);
  add(ellipsoid([0, 0.918, 0.042], [0.082, 0.04, 0.082]), "jaw", 0.025);
  both((m) => {
    add(ellipsoid(m([0.066, 1.0, 0.074]), [0.045, 0.038, 0.04]), "head", 0.025);
    // Heavy brow, in two halves meeting over the nose.
    add(roundCone(m([0.09, 1.064, 0.08]), [0, 1.074, 0.116], 0.021, 0.024), "head", 0.024);
    // Bags under the eyes.
    add(ellipsoid(m([0.05, 1.013, 0.104]), [0.03, 0.011, 0.014]), "head", 0.012);
  });
  // Nose: bridge, wide flat ball.
  add(roundCone([0, 1.048, 0.118], [0, 1.0, 0.142], 0.014, 0.017), "head", 0.018);
  add(ellipsoid([0, 0.993, 0.139], [0.037, 0.024, 0.027]), "head", 0.016);
  // Lips: long upper lip, thin lower lip on the jaw.
  add(ellipsoid([0, 0.958, 0.126], [0.058, 0.019, 0.026]), "head", 0.016);
  add(ellipsoid([0, 0.927, 0.12], [0.052, 0.016, 0.024]), "jaw", 0.014);

  // Ears: big flat blades swept out and back, slightly up.
  both((m, s) => {
    const base = m([0.098, 1.05, -0.016]);
    const tip = m([0.31, 1.108, -0.078]);
    const flat = v.norm([0.12 * (s === "L" ? 1 : -1), 0.15, 1]);
    add(blade(base, tip, 0.048, 0.006, flat, 0.36), [`ear1${s}`, `ear2${s}`], 0.02);
  });

  // Arms and hands.
  both((m, s) => {
    add(roundCone(m(SHOULDER), m(ELBOW), 0.031, 0.025), `upperArm${s}`, 0.018);
    add(roundCone(m(ELBOW), m(WRIST), 0.025, 0.021), `forearm${s}`, 0.014);
    const palmC = v.add(WRIST, v.scale(ARM_DIR, 0.042));
    const axisZ = m(FRONT);
    add(ellipsoid(m(palmC), [0.048, 0.016, 0.04], [m(ARM_DIR), m(PALM_NORMAL), axisZ]), `hand${s}`, 0.016);
    for (const f of [...FINGERS, THUMB]) {
      const j = fingerJoints(f);
      add(roundCone(m(j.base), m(j.mid), f.r[0], f.r[1] * 1.04), `${f.name}a${s}`, 0.008);
      add(roundCone(m(j.mid), m(j.tip), f.r[1], f.r[1] * 0.92), `${f.name}b${s}`, 0.006);
    }
  });

  // Legs and feet.
  both((m, s) => {
    add(roundCone(m(HIP), m(KNEE), 0.062, 0.045), `thigh${s}`, 0.03);
    add(roundCone(m(KNEE), m(ANKLE), 0.043, 0.03), `shin${s}`, 0.02);
    add(ellipsoid(m([0.118, 0.033, 0.045]), [0.046, 0.033, 0.098]), `foot${s}`, 0.022);
    for (const [ox, len] of [[-0.024, 0.06], [0.0, 0.066], [0.024, 0.056]]) {
      const base = [BALL[0] + ox, 0.02, BALL[2] - 0.01];
      add(roundCone(m(base), m(v.add(base, [ox * 0.3, -0.004, len])), 0.0125, 0.0105), `toes${s}`, 0.012);
    }
  });

  // Baggy shorts: an inflated pelvis and flared legs with a crisp hem.
  add(ellipsoid([0, 0.47, -0.004], [0.168, 0.1, 0.13]), "hips", 0.012, "shorts");
  both((m, s) => {
    add(roundCone(m([0.086, 0.452, 0.0]), m([0.106, 0.335, 0.016]), 0.072, 0.077), [`hips`, `thigh${s}`], 0.012, "shorts");
  });

  // Carving: nostrils, eye sockets, mouth slit and the mouth bag behind it.
  both((m) => {
    sub(sphere(m([0.017, 0.983, 0.155]), 0.0062), 0.005, "nostril");
    sub(sphere(m([0.049, 1.039, 0.099]), 0.0245), 0.014, "socket");
  });
  sub(ellipsoid([0, 0.943, 0.13], [0.06, 0.0035, 0.036]), 0.004, "mouth");
  sub(ellipsoid([0, 0.94, 0.088], [0.048, 0.019, 0.046]), 0.006, "mouth");
  return P;
}

// ---- Colour -----------------------------------------------------------------------------

export const COLOURS = {
  skin: [86, 98, 222],
  shorts: [44, 46, 58],
  mouth: [70, 30, 52],
  nostril: [70, 66, 150],
  socket: [72, 78, 182],
};

// Paint volumes: soft tints on top of the region colour. {shape, colour, strength}.
export function paints() {
  const P = [];
  const both = (fn) => {
    fn((p) => p, 1);
    fn(v.mirror, -1);
  };
  P.push({ shape: ellipsoid([0, 0.56, 0.17], [0.13, 0.13, 0.09]), colour: [132, 140, 236], strength: 0.7, soft: 0.04 });
  P.push({ shape: ellipsoid([0, 0.73, 0.1], [0.12, 0.06, 0.05]), colour: [116, 124, 230], strength: 0.4, soft: 0.04 });
  P.push({ shape: ellipsoid([0, 1.15, -0.04], [0.13, 0.08, 0.15]), colour: [66, 74, 190], strength: 0.6, soft: 0.06 });
  P.push({ shape: ellipsoid([0, 0.78, -0.12], [0.14, 0.12, 0.06]), colour: [68, 76, 190], strength: 0.5, soft: 0.05 });
  P.push({ shape: ellipsoid([0, 0.94, 0.135], [0.06, 0.028, 0.02]), colour: [92, 80, 176], strength: 0.55, soft: 0.01 });
  both((m, s) => {
    // Inner ear: pink-mauve on the front face of the blade.
    P.push({ shape: blade(m([0.11, 1.052, -0.006]), m([0.29, 1.104, -0.06]), 0.036, 0.004, v.norm([0.12 * s, 0.15, 1]), 0.5), colour: [168, 120, 206], strength: 0.85, soft: 0.012 });
    // Darker around the eyes and lighter fingertips.
    P.push({ shape: ellipsoid(m([0.049, 1.04, 0.112]), [0.034, 0.028, 0.02]), colour: [70, 74, 178], strength: 0.5, soft: 0.012 });
  });
  return P;
}

// ---- Anchors for the runtime -------------------------------------------------------------

export function anchors() {
  const eyes = {};
  for (const [s, m] of [["L", (p) => p], ["R", v.mirror]]) {
    eyes[s] = { centre: m([0.049, 1.038, 0.0815]), radius: 0.0225 };
  }
  // Gold chain: a loop around the neck base that hangs onto the chest at the front.
  const chain = [];
  const N = 48;
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const front = Math.max(0, Math.cos(a));
    chain.push([Math.sin(a) * (0.088 + front * 0.012), 0.83 - front * front * 0.1, -0.012 + Math.cos(a) * (0.09 + front * 0.012)]);
  }
  const wristL = v.add(WRIST, v.scale(ARM_DIR, -0.012));
  return {
    eyes,
    teeth: { upper: [0, 0.951, 0.106], lower: [0, 0.933, 0.104], width: 0.08 },
    chain,
    bracelet: { centre: wristL, axis: ARM_DIR, radius: 0.027, bone: "forearmL" },
    // Where held props sit, relative to each hand bone's rest position.
    grip: { L: v.add(WRIST, v.add(v.scale(ARM_DIR, 0.06), v.scale(PALM_NORMAL, 0.03))), R: v.mirror(v.add(WRIST, v.add(v.scale(ARM_DIR, 0.06), v.scale(PALM_NORMAL, 0.03)))) },
    armDir: ARM_DIR,
    palmNormal: PALM_NORMAL,
  };
}
