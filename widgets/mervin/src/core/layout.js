// The studio flat: dimensions, furniture footprints and the spots where Mervin does things.
// Shared by the renderer (room/), navigation (core/nav.js), the brain and the tests.
//
// Units are metres. x runs left to right, y up, z from the back wall (z = 0) toward the
// viewer. The furnished room is ROOM.depth deep; floor, ceiling and side walls carry on to
// ROOM.extendTo so the camera (z about 9.5) is always inside a box and no void shows.
//
// Facing angles are rotations about y: 0 faces the viewer (+z), PI faces the back wall,
// PI/2 faces right (+x), -PI/2 faces left (-x).

export const ROOM = {
  halfWidth: 4.8,
  height: 2.6,
  depth: 5.0,
  extendTo: 11.5,
};

// Where Mervin may walk normally. The strip in front of it (up to PEEK_Z) is only used by
// the "peek at the viewer" activity, which walks straight there.
export const WALKABLE = { minX: -4.45, maxX: 4.45, minZ: 0.3, maxZ: 3.9 };
export const PEEK_Z = 8.0;

// Mervin's height including the ears, used for framing.
export const MERVIN_HEIGHT = 1.22;

// Openings in the back wall.
export const WINDOW = { x0: -1.95, x1: 0.05, y0: 0.92, y1: 2.22 };
export const DOOR = { x0: 2.35, x1: 3.25, height: 2.05 };

// Footprints for navigation. `tall` pieces also block his ears (wider clearance).
// Round pieces give {x, z, r}; boxes give {x0, x1, z0, z1}.
export const FURNITURE = [
  { id: "bedside", x0: -4.78, x1: -4.3, z0: 0.02, z1: 0.48, tall: false },
  { id: "bed", x0: -4.2, x1: -2.95, z0: 0.02, z1: 2.12, tall: false },
  { id: "plant", x: -2.6, z: 0.38, r: 0.3, tall: true },
  { id: "radiator", x0: -1.6, x1: -0.35, z0: 0.0, z1: 0.14, tall: false },
  { id: "sofa", x0: -2.0, x1: 0.1, z0: 1.3, z1: 2.22, tall: false },
  { id: "coffeeTable", x0: -1.55, x1: -0.55, z0: 2.95, z1: 3.45, tall: false },
  { id: "floorLamp", x: 0.55, z: 0.32, r: 0.22, tall: true },
  { id: "sideboard", x0: 0.85, x1: 2.15, z0: 0.02, z1: 0.5, tall: false },
  { id: "counterBack", x0: 3.4, x1: 4.8, z0: 0.0, z1: 0.64, tall: false },
  { id: "counterRight", x0: 4.16, x1: 4.8, z0: 0.64, z1: 1.9, tall: false },
  { id: "fridge", x0: 4.08, x1: 4.8, z0: 2.0, z1: 2.74, tall: true },
  { id: "bistroTable", x: 3.25, z: 3.0, r: 0.36, tall: false },
  { id: "stool", x: 3.25, z: 2.45, r: 0.2, tall: false },
  { id: "wardrobe", x0: -4.8, x1: -4.18, z0: 2.55, z1: 3.75, tall: true },
];

// Spots where activities happen. `approach` must be reachable on the nav grid; the last
// stretch from approach to `at` is walked in a straight line (it may brush furniture).
export const SPOTS = {
  sofaSeat: { at: [-1.25, 1.66], approach: [-1.25, 2.62], facing: 0, seatY: 0.46 },
  sofaSeatRight: { at: [-0.45, 1.66], approach: [-0.45, 2.62], facing: 0, seatY: 0.46 },
  sofaLie: { at: [-0.95, 1.7], approach: [-0.95, 2.62], facing: 0, seatY: 0.46 },
  window: { at: [-0.95, 0.62], approach: [-0.95, 0.75], facing: Math.PI },
  plant: { at: [-2.6, 1.02], approach: [-2.6, 1.05], facing: Math.PI },
  bed: { at: [-3.58, 1.05], approach: [-2.62, 1.2], facing: 0, seatY: 0.56 },
  bedRead: { at: [-3.58, 0.62], approach: [-2.62, 1.0], facing: 0, seatY: 0.56 },
  mirror: { at: [-3.75, 3.15], approach: [-3.7, 3.15], facing: -Math.PI / 2 },
  wardrobe: { at: [-3.75, 2.9], approach: [-3.7, 2.9], facing: -Math.PI / 2 },
  recordPlayer: { at: [1.25, 0.95], approach: [1.25, 0.95], facing: Math.PI },
  danceFloor: { at: [1.35, 1.9], approach: [1.35, 1.9], facing: 0 },
  goldfish: { at: [1.88, 0.95], approach: [1.88, 0.95], facing: Math.PI },
  door: { at: [2.8, 0.55], approach: [2.8, 0.6], facing: Math.PI },
  hallway: { at: [2.8, -1.1], approach: [2.8, 0.6], facing: Math.PI },
  kettle: { at: [3.85, 1.0], approach: [3.85, 1.05], facing: Math.PI },
  sink: { at: [4.35, 1.0], approach: [3.95, 1.1], facing: Math.PI },
  toaster: { at: [3.7, 1.32], approach: [3.65, 1.32], facing: Math.PI / 2 },
  fridge: { at: [3.45, 2.37], approach: [3.4, 2.37], facing: Math.PI / 2 },
  stool: { at: [3.25, 2.45], approach: [3.25, 2.05], facing: 0, seatY: 0.66 },
  clock: { at: [2.75, 1.45], approach: [2.75, 1.45], facing: Math.PI },
  rugCentre: { at: [-0.35, 3.75], approach: [-0.35, 3.75], facing: 0 },
  openFloor: { at: [1.25, 2.85], approach: [1.25, 2.85], facing: 0 },
  frontLeft: { at: [-2.5, 3.4], approach: [-2.5, 3.4], facing: 0 },
  frontRight: { at: [2.2, 3.5], approach: [2.2, 3.5], facing: 0 },
  remote: { at: [-1.05, 2.62], approach: [-1.05, 2.62], facing: 0 },
};

// What tapping each piece of furniture asks him to do (activity ids from brain/activities.js).
export const TAP_TARGETS = {
  sofa: "loungeSofa",
  remote: "watchTv",
  coffeeTable: "watchTv",
  bed: "napBed",
  bedside: "lavaLamp",
  plant: "waterPlant",
  window: "lookOutWindow",
  recordPlayer: "dance",
  sideboard: "dance",
  goldfish: "feedFish",
  fridge: "raidFridge",
  kettle: "makeTea",
  counterBack: "makeTea",
  counterRight: "makeToast",
  toaster: "makeToast",
  wardrobe: "tryHats",
  door: "popOut",
  clock: "checkClock",
  floorLamp: "toggleLamp",
  bistroTable: "snackAtTable",
  stool: "snackAtTable",
  rug: "floatMeditate",
  painting: "admirePainting",
};
