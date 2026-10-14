// One-point-perspective framing for every widget size. Pure maths, no THREE.
//
// The camera never yaws or pitches: it looks straight down -z, so verticals stay vertical
// and every receding line meets one vanishing point (VP), like a one-point interior drawing.
// Vertical framing comes from lens shift (an asymmetric frustum) instead of tilting, and
// following Mervin means trucking along x and dollying along z.

import { MERVIN_HEIGHT, ROOM } from "./layout.js";

const DEG = Math.PI / 180;

// hFov: horizontal field of view. vp: vanishing point height as a fraction from the top.
// mode "room": fixed distance from the back wall, x follows within ±xLimit.
// mode "follow": distance chosen so Mervin fills `frac` of the frame height.
// chatFrac: how much of the height he fills during a conversation (a gentle close-up).
const LAYOUTS = {
  xl: { hFov: 80, vp: 0.42, camY: 1.25, mode: "room", roomDist: 9.5, xLimit: 0, chatFrac: 0.6 },
  l: { hFov: 58, vp: 0.42, camY: 1.25, mode: "room", roomDist: 9.5, xLimit: 1.6, chatFrac: 0.56 },
  m: { hFov: 56, vp: 0.4, camY: 1.2, mode: "follow", frac: 0.34, xLimit: 3.0, chatFrac: 0.44 },
  s: { hFov: 54, vp: 0.36, camY: 1.0, mode: "follow", frac: 0.5, xLimit: 3.4, chatFrac: 0.62 },
  "tall-xl": { hFov: 26, vp: 0.46, camY: 1.3, mode: "follow", frac: 0.12, xLimit: 4.0, chatFrac: 0.16 },
  "tall-l": { hFov: 32, vp: 0.45, camY: 1.25, mode: "follow", frac: 0.18, xLimit: 4.0, chatFrac: 0.23 },
  "tall-m": { hFov: 44, vp: 0.42, camY: 1.2, mode: "follow", frac: 0.36, xLimit: 3.6, chatFrac: 0.46 },
};

export const MAX_CAMERA_Z = 9.5;
const MIN_DISTANCE = 1.6;
const MARGIN = 0.04;

// S 840x344, M 840x696, L 1688x696, XL 2536x696, swapped in portrait. S and L share an
// aspect ratio, so height separates them (as in claude-control's updateLayout).
export function layoutName(width, height) {
  const aspect = width / height;
  if (aspect < 0.85) {
    if (aspect < 0.33) return "tall-xl";
    if (aspect < 0.6) return "tall-l";
    return "tall-m";
  }
  if (aspect >= 3) return "xl";
  if (aspect >= 1.8 && height < 450) return "s";
  if (aspect >= 1.8) return "l";
  return "m";
}

export function lensFor(width, height) {
  const name = layoutName(width, height);
  const layout = LAYOUTS[name];
  const aspect = width / height;
  const tanH = Math.tan((layout.hFov / 2) * DEG);
  const span = (2 * tanH) / aspect;
  return {
    name,
    layout,
    width,
    height,
    tanLeft: tanH,
    tanRight: tanH,
    tanTop: layout.vp * span,
    tanBottom: (1 - layout.vp) * span,
    span,
  };
}

// Distance at which Mervin fills `frac` of the frame height.
function distanceForFrac(lens, frac) {
  return MERVIN_HEIGHT / (frac * lens.span);
}

// The nearest distance that keeps his feet and head inside the margins.
function fitDistance(lens, camY) {
  const below = camY / (lens.tanBottom * (1 - MARGIN * 2));
  const above = (MERVIN_HEIGHT - camY) / (lens.tanTop * (1 - MARGIN * 2));
  return Math.max(MIN_DISTANCE, below, above);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Where the camera wants to be. `focus` is Mervin's floor position {x, z}; `current` is the
// camera's present position (for the horizontal dead zone); mode is "normal", "chat" or
// "freeze" (hold position, used while he walks up to peek into the lens).
export function cameraTarget(lens, focus, mode = "normal", current = null) {
  const { layout } = lens;
  const camY = layout.camY;
  if (mode === "freeze" && current) return { x: current.x, y: camY, z: current.z };

  let z;
  let xLimit = layout.xLimit;
  if (mode === "chat") {
    z = focus.z + Math.max(distanceForFrac(lens, layout.chatFrac), fitDistance(lens, camY));
    // Wide lenses would see the wardrobe or fridge side-on from near the side walls.
    xLimit = layout.mode === "room" ? ROOM.halfWidth - 2.2 : Math.max(layout.xLimit, ROOM.halfWidth - 1.2);
  } else if (layout.mode === "room") {
    z = layout.roomDist;
  } else {
    z = focus.z + Math.max(distanceForFrac(lens, layout.frac), fitDistance(lens, camY));
  }
  z = clamp(z, focus.z + MIN_DISTANCE, MAX_CAMERA_Z);

  // Horizontal: re-centre only when he leaves the middle half of the frame.
  const distance = Math.max(MIN_DISTANCE, z - focus.z);
  const halfWidthAtFocus = lens.tanRight * distance;
  let x = current ? current.x : 0;
  if (mode === "chat" || !current || Math.abs(focus.x - x) > halfWidthAtFocus * 0.5) x = focus.x;
  x = clamp(x, -xLimit, xLimit);
  // Never let him leave the frame because of the clamp.
  const edge = halfWidthAtFocus * (1 - MARGIN * 3) - 0.35;
  if (focus.x - x > edge) x = focus.x - edge;
  if (x - focus.x > edge) x = focus.x + edge;
  x = clamp(x, -(ROOM.halfWidth - 0.3), ROOM.halfWidth - 0.3);
  return { x, y: camY, z };
}

// Project a world point for a camera at `cam` with lens `lens`: returns pixel coordinates and
// the tangents (for distortion checks). Points behind the camera return null.
export function project(lens, cam, point) {
  const depth = cam.z - point.z;
  if (depth <= 0.01) return null;
  const tx = (point.x - cam.x) / depth;
  const ty = (point.y - cam.y) / depth;
  const px = ((tx + lens.tanLeft) / (lens.tanLeft + lens.tanRight)) * lens.width;
  const py = ((lens.tanTop - ty) / (lens.tanTop + lens.tanBottom)) * lens.height;
  return { px, py, tx, ty, depth };
}

// How much a small round object at this point is stretched radially by the rectilinear
// projection, relative to the centre of the frame.
export function stretchAt(tx, ty) {
  return Math.sqrt(1 + tx * tx + ty * ty);
}

// Critically damped spring (Unity's SmoothDamp), per axis. state: {value, velocity}.
export function smoothDamp(state, target, smoothTime, dt) {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.value - target;
  const temp = (state.velocity + omega * change) * dt;
  state.velocity = (state.velocity - omega * temp) * exp;
  state.value = target + (change + temp) * exp;
  return state.value;
}
