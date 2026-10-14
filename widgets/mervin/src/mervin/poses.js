// Pose library. A pose maps bone names to rotations relative to the A-pose the mesh was
// sculpted in. Values are Euler [x, y, z] in radians, except forearm/hand which take
// [flex, twist, side] (see rig.js). Keys ending in "*" apply to the left bone and, mirrored,
// to the right one. Write one-sided values as if for the LEFT side and wrap them with R()
// to put them on the right arm or leg.
// Extra keys: hipsY / hipsZ / hipsX move the hips (metres) relative to the rest pose.
//
// Directions (left side): z negative lowers the arm, x negative swings a limb forward,
// forearm flex positive bends the elbow; thigh x negative lifts the knee forward, shin x
// positive bends the knee; spine/neck/head x positive lean or nod forward, y turns toward
// his left, z tilts.
//
// A pose can also be a function of time (seconds) returning a pose, for loops.

const D = Math.PI / 180;

const mirrorValue = (v) => (v.length > 3 ? [v[0], -v[1], -v[2], v[3]] : [v[0], -v[1], -v[2]]);

// Put left-side values on the right side.
export function R(pose) {
  const out = {};
  for (const [key, value] of Object.entries(pose)) out[key.replace(/L$/, "R")] = Array.isArray(value) ? mirrorValue(value) : value;
  return out;
}

const fingersLoose = {
  "finger1a*": [0, 0, -16 * D],
  "finger2a*": [0, 0, -18 * D],
  "finger3a*": [0, 0, -16 * D],
  "finger1b*": [0, 0, -20 * D],
  "finger2b*": [0, 0, -22 * D],
  "finger3b*": [0, 0, -20 * D],
  "thumba*": [0, -12 * D, -8 * D],
};

const fingersCurled = {
  "finger1a*": [0, 0, -55 * D],
  "finger2a*": [0, 0, -60 * D],
  "finger3a*": [0, 0, -55 * D],
  "finger1b*": [0, 0, -70 * D],
  "finger2b*": [0, 0, -75 * D],
  "finger3b*": [0, 0, -70 * D],
  "thumba*": [0, -30 * D, -25 * D],
  "thumbb*": [0, 0, -30 * D],
};

const relaxedArms = {
  "clavicle*": [0, 0, -4 * D],
  "upperArm*": [-2 * D, 8 * D, -47 * D],
  "forearm*": [16 * D, 10 * D],
  "hand*": [4 * D, 0, 0],
  ...fingersLoose,
};

const slouch = {
  spine: [5 * D, 0, 0],
  chest: [-1 * D, 0, 0],
  neck: [8 * D, 0, 0],
  head: [-6 * D, 0, 0],
};

const standLegs = {
  "thigh*": [0, 0, 3 * D],
  "shin*": [2 * D, 0, -2 * D],
  "foot*": [-2 * D, 0, -1 * D],
};

const stand = { ...relaxedArms, ...slouch, ...standLegs, "ear1*": [0, 0, -5 * D] };

// Sitting on a seat at about hip height: thighs level, short legs dangling.
const sitLegs = {
  "thigh*": [-84 * D, 0, 6 * D],
  "shin*": [72 * D, 0, -4 * D],
  "foot*": [-8 * D, 0, 0],
};

const sit = {
  ...sitLegs,
  hips: [-6 * D, 0, 0],
  spine: [-6 * D, 0, 0],
  chest: [-4 * D, 0, 0],
  neck: [10 * D, 0, 0],
  head: [-2 * D, 0, 0],
  "clavicle*": [0, 0, -5 * D],
  "upperArm*": [-24 * D, 10 * D, -44 * D],
  "forearm*": [52 * D, 20 * D],
  "hand*": [-10 * D, 0, 0],
  ...fingersLoose,
};

export const POSES = {
  rest: {},
  stand,

  // Weight on one leg, hand on hip: the default "chilling" stance.
  standChill: {
    ...stand,
    hips: [0, 0, 3 * D],
    spine: [5 * D, 0, -3 * D],
    head: [-6 * D, 0, 4 * D],
    thighL: [-4 * D, 0, 6 * D],
    shinL: [12 * D, 0, 0],
    upperArmL: [6 * D, 0, -30 * D, 75 * D],
    forearmL: [100 * D, 0],
    handL: [-20 * D, 0, 0],
    hipsY: -0.008,
  },

  handsBehindBack: {
    ...stand,
    "upperArm*": [30 * D, 0, -50 * D, 88 * D],
    "forearm*": [80 * D, 0],
    "hand*": [0, 0, 0],
    chest: [-5 * D, 0, 0],
    neck: [4 * D, 0, 0],
  },

  sit,

  // On the sofa: leaning back with hands behind his head.
  sitLean: {
    ...sitLegs,
    hips: [-10 * D, 0, 0],
    spine: [-12 * D, 0, 0],
    chest: [-6 * D, 0, 0],
    neck: [12 * D, 0, 0],
    head: [-4 * D, 0, 0],
    "clavicle*": [0, 0, 8 * D],
    "upperArm*": [32 * D, 0, 112 * D],
    "forearm*": [138 * D, 0],
    "hand*": [20 * D, 0, 0],
    ...fingersLoose,
    hipsZ: -0.02,
  },

  // Sitting forward with elbows on knees, chin in hands.
  sitChin: {
    ...sitLegs,
    spine: [18 * D, 0, 0],
    chest: [10 * D, 0, 0],
    neck: [-6 * D, 0, 0],
    head: [-12 * D, 0, 0],
    "upperArm*": [-52 * D, 10 * D, -40 * D],
    "forearm*": [128 * D, 30 * D],
    "hand*": [-30 * D, 0, 0],
    ...fingersLoose,
  },

  // Sitting, holding something in front (book, mug, remote, game).
  sitHold: {
    ...sit,
    "upperArm*": [-30 * D, 14 * D, -42 * D],
    "forearm*": [82 * D, 50 * D],
    "hand*": [-16 * D, 0, 0],
    neck: [16 * D, 0, 0],
    head: [8 * D, 0, 0],
  },

  // Lying on his back (the activity rotates the root); arms resting on his belly.
  lieBack: {
    "thigh*": [-4 * D, 0, 4 * D],
    "shin*": [6 * D, 0, 0],
    "foot*": [24 * D, 0, -6 * D],
    spine: [-4 * D, 0, 0],
    neck: [-6 * D, 0, 0],
    head: [-10 * D, 0, 0],
    // Forearms folded across his belly: the upper arm twisted in so the elbow bends inward.
    "upperArm*": [-12 * D, 0, -50 * D, 80 * D],
    "forearm*": [96 * D, 0],
    "hand*": [10 * D, 0, 0],
    ...fingersLoose,
    "ear1*": [0, 0, 10 * D],
  },

  // Curled on his side, knees up, hands under his cheek.
  sleepCurled: {
    "thigh*": [-64 * D, 0, 2 * D],
    "shin*": [96 * D, 0, 0],
    "foot*": [24 * D, 0, 0],
    spine: [16 * D, 0, 0],
    chest: [10 * D, 0, 0],
    neck: [12 * D, 0, 0],
    head: [6 * D, 0, 0],
    "upperArm*": [-58 * D, 10 * D, -46 * D],
    "forearm*": [128 * D, 40 * D],
    "hand*": [20 * D, 0, 0],
    ...fingersCurled,
    "ear1*": [0, 0, -14 * D],
  },

  // Cross-legged, floating, hands resting on the knees.
  meditate: {
    "thigh*": [-78 * D, -10 * D, 44 * D],
    "shin*": [118 * D, 0, 18 * D],
    "foot*": [10 * D, 40 * D, 0],
    spine: [-2 * D, 0, 0],
    neck: [4 * D, 0, 0],
    head: [2 * D, 0, 0],
    "upperArm*": [-20 * D, 12 * D, -40 * D],
    "forearm*": [36 * D, 60 * D],
    "hand*": [10 * D, 0, 0],
    "finger1a*": [0, 0, -10 * D],
    "thumba*": [0, -30 * D, -30 * D],
    "ear1*": [0, 0, 6 * D],
    hipsY: -0.18,
  },

  squat: {
    "thigh*": [-100 * D, 0, 12 * D],
    "shin*": [118 * D, 0, 0],
    "foot*": [-14 * D, 0, 0],
    spine: [26 * D, 0, 0],
    neck: [-10 * D, 0, 0],
    head: [-14 * D, 0, 0],
    "upperArm*": [-76 * D, 0, -34 * D],
    "forearm*": [10 * D, 0],
    ...fingersLoose,
    hipsY: -0.2,
    hipsZ: -0.06,
  },

  stretch: {
    ...standLegs,
    spine: [-12 * D, 0, 0],
    chest: [-10 * D, 0, 0],
    neck: [-8 * D, 0, 0],
    head: [-16 * D, 0, 0],
    "clavicle*": [0, 0, 14 * D],
    "upperArm*": [-6 * D, 0, 118 * D],
    "forearm*": [20 * D, 0],
    "hand*": [0, 0, 0],
    "finger1a*": [0, 0, 10 * D],
    "finger2a*": [0, 0, 10 * D],
    "finger3a*": [0, 0, 10 * D],
    "ear1*": [0, 0, 12 * D],
    hipsY: 0.012,
  },

  shrug: {
    ...stand,
    "clavicle*": [0, 0, 14 * D],
    "upperArm*": [-14 * D, 30 * D, -44 * D],
    "forearm*": [84 * D, 80 * D],
    "hand*": [-30 * D, 0, 0],
    neck: [6 * D, 0, 0],
    head: [-4 * D, 0, 10 * D],
    "ear1*": [0, 0, 8 * D],
  },

  // Hand on chin, thinking.
  think: {
    ...stand,
    ...R({
      upperArmL: [-40 * D, 20 * D, -36 * D],
      forearmL: [136 * D, 50 * D],
      handL: [-30 * D, 0, 0],
    }),
    upperArmL: [-14 * D, 30 * D, -44 * D],
    forearmL: [86 * D, 70 * D],
    head: [-6 * D, 0, -6 * D],
  },

  // Holding something in both hands in front of his belly.
  hold: {
    ...stand,
    "upperArm*": [-18 * D, 16 * D, -44 * D],
    "forearm*": [84 * D, 50 * D],
    "hand*": [-16 * D, 0, 0],
    neck: [14 * D, 0, 0],
  },

  // Hand to the ear (phone call).
  phone: {
    ...stand,
    ...R({
      upperArmL: [-30 * D, 30 * D, -10 * D],
      forearmL: [150 * D, 40 * D],
      handL: [-30 * D, 0, 0],
    }),
    head: [-4 * D, 0, -8 * D],
  },

  // Looking up at something high (the clock, the ceiling).
  lookUp: {
    ...stand,
    neck: [-14 * D, 0, 0],
    head: [-22 * D, 0, 0],
  },

  // Bending toward the lens, hands on his knees.
  peek: {
    ...standLegs,
    spine: [22 * D, 0, 0],
    chest: [12 * D, 0, 0],
    neck: [-12 * D, 0, 0],
    head: [-20 * D, 0, 0],
    "upperArm*": [-36 * D, 10 * D, -50 * D],
    "forearm*": [6 * D, 20 * D],
    ...fingersLoose,
    "shin*": [16 * D, 0, 0],
    "thigh*": [-14 * D, 0, 3 * D],
    hipsY: -0.02,
  },

  // Arm out, tipping a watering can or pressing a button.
  reach: {
    ...stand,
    ...R({
      upperArmL: [-58 * D, 10 * D, -40 * D],
      forearmL: [20 * D, 30 * D],
      handL: [-10 * D, 0, 0],
    }),
    spine: [10 * D, 0, 0],
  },

  // Waving at the viewer: the right arm up, the hand swinging.
  wave: (t) => ({
    ...stand,
    ...R({
      clavicleL: [0, 0, 10 * D],
      upperArmL: [-10 * D, 0, 60 * D],
      forearmL: [70 * D + Math.sin(t * 9) * 22 * D, 70 * D],
      handL: [Math.sin(t * 9 + 0.6) * 14 * D, 0, 0],
      finger1aL: [0, 0, 0],
      finger2aL: [0, 0, 0],
      finger3aL: [0, 0, 0],
    }),
    head: [-4 * D, 0, Math.sin(t * 2) * 4 * D],
  }),

  // A loose, unbothered dance: hip sway, shoulder roll, head bob.
  dance: (t) => {
    const b = Math.sin(t * 5.2);
    const c = Math.cos(t * 2.6);
    return {
      ...standLegs,
      hips: [0, c * 14 * D, b * 6 * D],
      spine: [4 * D, -c * 10 * D, -b * 5 * D],
      chest: [0, -c * 6 * D, -b * 3 * D],
      neck: [8 * D + Math.abs(b) * 8 * D, 0, 0],
      head: [-6 * D, c * 8 * D, b * 6 * D],
      "clavicle*": [0, 0, 6 * D],
      upperArmL: [-20 * D + b * 16 * D, 10 * D, -10 * D + c * 30 * D],
      ...R({ upperArmL: [-20 * D - b * 16 * D, 10 * D, -10 * D - c * 30 * D] }),
      "forearm*": [90 * D, 40 * D],
      ...fingersLoose,
      thighL: [-Math.max(0, b) * 24 * D, 0, 4 * D],
      thighR: [-Math.max(0, -b) * 24 * D, 0, -4 * D],
      shinL: [Math.max(0, b) * 34 * D, 0, 0],
      shinR: [Math.max(0, -b) * 34 * D, 0, 0],
      "ear1*": [0, 0, Math.abs(b) * 10 * D],
      hipsY: -Math.abs(b) * 0.02,
    };
  },

  // Lazy sweeping: both hands on a broom, swinging side to side.
  sweep: (t) => {
    const s = Math.sin(t * 2.4);
    return {
      ...standLegs,
      ...slouch,
      spine: [14 * D, s * 10 * D, 0],
      upperArmL: [-40 * D, 20 * D, -40 * D + s * 10 * D],
      forearmL: [60 * D, 40 * D],
      ...R({ upperArmL: [-30 * D, 20 * D, -46 * D - s * 10 * D], forearmL: [70 * D, 40 * D] }),
      ...fingersCurled,
    };
  },

  // Eating: one hand comes up to his mouth now and then.
  eat: (t) => {
    const bite = Math.max(0, Math.sin(t * 1.3)) ** 3;
    return {
      ...stand,
      ...R({
        upperArmL: [-20 * D - bite * 24 * D, 20 * D, -42 * D],
        forearmL: [80 * D + bite * 56 * D, 50 * D],
        handL: [-20 * D, 0, 0],
        ...Object.fromEntries(Object.entries(fingersCurled).map(([k, v]) => [k.replace("*", "L"), v])),
      }),
      neck: [10 * D - bite * 6 * D, 0, 0],
    };
  },

  // Three half-hearted squats, then a sit-down-and-forget-it.
  exercise: (t) => {
    const s = (1 - Math.cos(Math.min(t, 9) * 2.1)) / 2;
    const down = t < 9 ? s : 0;
    return {
      "thigh*": [-80 * D * down, 0, 8 * D],
      "shin*": [100 * D * down, 0, 0],
      "foot*": [-10 * D * down, 0, 0],
      spine: [18 * D * down, 0, 0],
      neck: [-8 * D * down, 0, 0],
      "upperArm*": [-80 * D * down, 0, -40 * D],
      "forearm*": [10 * D, 0],
      ...fingersLoose,
      hipsY: -0.17 * down,
      hipsZ: -0.04 * down,
    };
  },

  // A long yawn with a stretch.
  yawn: (t) => {
    const k = Math.min(1, t / 1.2);
    return {
      ...stand,
      spine: [-6 * D * k, 0, 0],
      neck: [-10 * D * k, 0, 0],
      head: [-14 * D * k, 0, 0],
      "upperArm*": [-6 * D, 0, -47 * D + 80 * D * k],
      "forearm*": [60 * D * k, 0],
      "clavicle*": [0, 0, 10 * D * k],
    };
  },
};

// Expand mirrored entries into explicit L and R bones.
export function expandPose(pose) {
  const out = {};
  for (const [key, value] of Object.entries(pose)) {
    if (!Array.isArray(value)) {
      out[key] = value;
      continue;
    }
    if (key.endsWith("*")) {
      const base = key.slice(0, -1);
      if (out[`${base}L`] === undefined || !(`${base}L` in pose)) out[`${base}L`] = value;
      if (out[`${base}R`] === undefined || !(`${base}R` in pose)) out[`${base}R`] = mirrorValue(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
