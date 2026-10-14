// What Mervin does around the flat. Each activity has a weight (how likely it is to be
// chosen now; ctx has hour, energy, night, rng) and a program: a generator that yields
// once per frame and receives dt. `b` is the brain's API (see brain.js).

import * as THREE from "three";
import { SPOTS, WALKABLE } from "../core/layout.js";
import { HELD_ITEMS } from "../mervin/props.js";

const morning = (h) => h >= 7 && h < 11;
const evening = (h) => h >= 17 && h < 23;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Lying layouts: where the root (his feet) goes, his yaw and how he is rolled.
const LIE = {
  sofa: { at: [-0.42, 0.6, 1.72], yaw: 0, roll: "side" },
  bed: { at: [-3.575, 0.64, 1.66], yaw: 0, roll: "back" },
  rug: { at: [0.28, 0.13, 3.72], yaw: Math.PI / 2, roll: "back" },
};

function* openFloorSpot(b) {
  const x = b.rng.range(-0.2, 2.4);
  const z = b.rng.range(2.6, 3.6);
  yield* b.walkTo([x, z]);
}

function* lookAround(b, seconds) {
  let t = 0;
  while (t < seconds) {
    const target = b.rng.chance(0.3) ? "viewer" : v3(b.rng.range(-4, 4), b.rng.range(0.6, 2), b.rng.range(0, 3));
    b.look(target);
    const hold = b.rng.range(2, 5);
    let h = 0;
    while (h < hold && t < seconds) {
      const dt = yield;
      h += dt;
      t += dt;
    }
  }
  b.look(null);
}

function* sleepFor(b, seconds, untilMorning = false) {
  b.sleep(true);
  let t = 0;
  while (untilMorning ? b.hour() >= 23 || b.hour() < 7 || t < 30 : t < seconds) t += yield;
  b.sleep(false);
  yield* b.wait(1.5);
}

export const ACTIVITIES = {
  stroll: {
    weight: () => 4,
    *program(b) {
      const x = b.rng.range(WALKABLE.minX + 0.4, WALKABLE.maxX - 0.4);
      const z = b.rng.range(2.4, WALKABLE.maxZ - 0.1);
      yield* b.walkTo([x, z]);
      b.pose(b.rng.chance(0.5) ? "standChill" : "stand", 0.6);
      b.sayActivity();
      yield* lookAround(b, b.rng.range(4, 9));
    },
  },

  idleStand: {
    weight: () => 3,
    *program(b) {
      b.pose("standChill", 0.8);
      b.look("viewer");
      yield* b.waitRange(4, 8);
      if (b.rng.chance(0.4)) {
        b.pose("think", 0.6);
        yield* b.waitRange(3, 5);
        b.pose("standChill", 0.6);
      }
      yield* lookAround(b, b.rng.range(5, 10));
    },
  },

  loungeSofa: {
    weight: (c) => (evening(c.hour) ? 9 : 6) + (1 - c.energy) * 4,
    *program(b) {
      yield* b.sitOn(b.rng.chance(0.5) ? "sofaSeat" : "sofaSeatRight", "sitLean");
      b.look(b.rng.chance(0.5) ? "viewer" : null);
      yield* b.waitRange(8, 14);
      b.sayActivity();
      yield* b.waitRange(12, 25);
      b.pose("sitChin", 0.9);
      yield* b.waitRange(8, 16);
      b.pose("sitLean", 0.9);
      yield* b.waitRange(10, 20);
    },
  },

  watchTv: {
    weight: (c) => (evening(c.hour) ? 10 : 4),
    *program(b) {
      yield* b.sitOn("sofaSeat", "sitHold");
      b.hold("remote", "R");
      b.lighting.setTv(true);
      b.look("viewer");
      yield* b.waitRange(3, 6);
      b.sayActivity();
      yield* b.waitRange(15, 30);
      b.drop();
      b.pose("sitLean", 1);
      yield* b.waitRange(20, 45);
      b.lighting.setTv(false);
    },
    cleanup(b) {
      b.lighting.setTv(false);
    },
  },

  napSofa: {
    weight: (c) => (c.night ? 3 : 1) + (1 - c.energy) * 8,
    *program(b) {
      yield* b.sitOn("sofaSeat", "sit");
      yield* b.wait(1);
      yield* b.lieDown("sofaLie", LIE.sofa, "sleepCurled");
      yield* sleepFor(b, b.rng.range(50, 140));
      yield* b.getUp();
      b.pose("yawn", 0.5);
      yield* b.wait(2.5);
    },
  },

  napBed: {
    weight: (c) => (1 - c.energy) * 6 + (c.hour >= 13 && c.hour < 16 ? 2 : 0.4),
    *program(b) {
      yield* b.sitOn("bed", "sit");
      yield* b.wait(0.8);
      yield* b.lieDown("bed", LIE.bed, "lieBack");
      yield* sleepFor(b, b.rng.range(60, 160));
      yield* b.getUp();
      b.pose("stretch", 0.6);
      yield* b.wait(3);
    },
  },

  sleepBed: {
    weight: (c) => (c.night ? 60 : 0),
    *program(b) {
      yield* b.sitOn("bed", "sit");
      yield* b.wait(0.8);
      b.room.parts.bedBlanket?.show(true);
      yield* b.lieDown("bed", LIE.bed, "lieBack");
      yield* sleepFor(b, 0, true);
      b.room.parts.bedBlanket?.show(false);
      yield* b.getUp();
      b.pose("stretch", 0.6);
      yield* b.wait(3.5);
      b.pose("yawn", 0.4);
      yield* b.wait(2.5);
    },
    cleanup(b) {
      b.room.parts.bedBlanket?.show(false);
    },
  },

  readBed: {
    weight: (c) => (evening(c.hour) ? 4 : 2),
    *program(b) {
      yield* b.sitOn("bedRead", "sitHold");
      b.hold("book", "R");
      b.look(null);
      yield* b.waitRange(10, 20);
      b.sayActivity();
      yield* b.waitRange(20, 40);
    },
  },

  lookOutWindow: {
    weight: (c) => (morning(c.hour) ? 7 : 4),
    *program(b) {
      yield* b.walkTo("window");
      b.pose("handsBehindBack", 0.8);
      let t = 0;
      const total = b.rng.range(18, 35);
      while (t < total) {
        b.look(v3(b.rng.range(-3, 1.2), b.rng.range(1.2, 2.6), -4));
        const hold = b.rng.range(3, 6);
        let h = 0;
        while (h < hold) {
          const dt = yield;
          h += dt;
          t += dt;
        }
        if (t > 6 && t < 12) b.sayActivity();
      }
    },
  },

  waterPlant: {
    weight: (c) => (morning(c.hour) ? 5 : 2),
    *program(b) {
      yield* b.walkTo("plant");
      b.look(v3(-2.6, 0.6, 0.4));
      b.hold("wateringCan", "R");
      b.pose("reach", 0.6);
      yield* b.wait(1.5);
      b.props.hold("wateringCan", "R", { tilt: 0.7 });
      yield* b.wait(4);
      b.props.hold("wateringCan", "R", { tilt: 0 });
      b.pose("stand", 0.6);
      b.sayActivity();
      yield* b.wait(3);
      b.drop();
      yield* b.waitRange(3, 6);
    },
  },

  makeTea: {
    weight: (c) => (morning(c.hour) ? 9 : 4),
    *program(b) {
      yield* b.walkTo("kettle");
      b.look(v3(3.82, 1.0, 0.3));
      b.pose("reach", 0.5);
      yield* b.wait(1.2);
      b.pose("stand", 0.5);
      yield* b.waitRange(6, 9);
      b.hold("mug", "R");
      b.pose("hold", 0.6);
      b.sayActivity();
      yield* b.turnTo(0);
      yield* b.wait(2);
      yield* b.sitOn(b.rng.chance(0.5) ? "sofaSeat" : "sofaSeatRight", "sitHold");
      b.look("viewer");
      yield* b.waitRange(20, 40);
    },
  },

  raidFridge: {
    weight: (c) => 4 + (c.hour >= 22 || c.hour < 2 ? 4 : 0),
    *program(b) {
      yield* b.walkTo("fridge");
      b.room.parts.fridge.setOpen(true);
      b.pose("peek", 1);
      b.look(v3(4.3, 1.0, 2.37));
      yield* b.waitRange(6, 12);
      b.sayActivity();
      yield* b.waitRange(3, 6);
      b.hold(b.rng.pick(["apple", "sandwich", "crisps", "milk"]), "R");
      b.room.parts.fridge.setOpen(false);
      b.pose("stand", 0.6);
      yield* b.turnTo(-0.3);
      b.pose("eat", 0.6);
      b.look("viewer");
      yield* b.waitRange(8, 14);
    },
    cleanup(b) {
      b.room.parts.fridge.setOpen(false);
    },
  },

  makeToast: {
    weight: (c) => (morning(c.hour) ? 8 : 3),
    *program(b) {
      yield* b.walkTo("toaster");
      b.look(v3(4.48, 1.0, 1.32));
      b.pose("reach", 0.5);
      yield* b.wait(1.2);
      b.pose("stand", 0.5);
      yield* b.waitRange(6, 9);
      b.room.parts.toaster.setUp(true);
      yield* b.wait(0.8);
      b.room.parts.toaster.setUp(false);
      b.hold("toast", "R");
      b.sayActivity();
      yield* b.turnTo(-0.4);
      b.pose("eat", 0.6);
      b.look("viewer");
      yield* b.waitRange(8, 14);
    },
  },

  snackAtTable: {
    weight: () => 3,
    *program(b) {
      yield* b.sitOn("stool", "sitHold");
      b.hold(b.rng.pick(["sandwich", "apple", "toast"]), "R");
      b.look("viewer");
      yield* b.waitRange(6, 10);
      b.sayActivity();
      yield* b.waitRange(15, 30);
    },
  },

  dance: {
    weight: (c) => (evening(c.hour) ? 6 : 3) * (0.5 + c.energy),
    *program(b) {
      yield* b.walkTo("recordPlayer");
      b.pose("reach", 0.5);
      yield* b.wait(1.2);
      b.room.parts.recordPlayer.setPlaying(true);
      yield* b.walkTo("danceFloor");
      b.pose("dance", 0.8);
      b.look("viewer");
      yield* b.waitRange(6, 10);
      b.sayActivity();
      yield* b.waitRange(15, 35);
      b.pose("stand", 0.6);
      yield* b.walkTo("recordPlayer");
      b.pose("reach", 0.5);
      yield* b.wait(1);
      b.room.parts.recordPlayer.setPlaying(false);
      b.pose("stand", 0.5);
    },
    cleanup(b) {
      b.room.parts.recordPlayer.setPlaying(false);
    },
  },

  floatMeditate: {
    weight: (c) => (c.hour >= 6 && c.hour < 9 ? 5 : 2),
    *program(b) {
      yield* b.walkTo("openFloor");
      yield* b.turnTo(0);
      b.pose("meditate", 1.2);
      b.state.seated = "openFloor";
      yield* b.wait(1.2);
      yield* b.tweenRoot({ y: 0.3 }, 3);
      b.sleep(false);
      b.look(null);
      let t = 0;
      const total = b.rng.range(25, 50);
      while (t < total) {
        const dt = yield;
        t += dt;
        b.position.y = 0.3 + Math.sin(t * 1.3) * 0.025;
        if (t > 8 && t < 8 + dt * 1.5) b.sayActivity();
      }
      yield* b.tweenRoot({ y: 0 }, 2.5);
      b.state.seated = null;
      b.pose("stand", 1);
      yield* b.wait(1);
    },
    cleanup(b) {
      b.position.y = 0;
      b.state.seated = null;
    },
  },

  stretch: {
    weight: (c) => (morning(c.hour) ? 5 : 2),
    *program(b) {
      yield* openFloorSpot(b);
      yield* b.turnTo(0);
      b.pose("stretch", 0.8);
      yield* b.wait(3.5);
      b.pose("yawn", 0.5);
      yield* b.wait(3);
      b.pose("standChill", 0.6);
      b.sayActivity();
      yield* b.waitRange(3, 6);
    },
  },

  exercise: {
    weight: (c) => 2 * c.energy,
    *program(b) {
      yield* openFloorSpot(b);
      yield* b.turnTo(0);
      b.look("viewer");
      b.sayActivity();
      b.pose("exercise", 0.6);
      yield* b.wait(10);
      b.pose("standChill", 0.8);
      yield* b.waitRange(4, 7);
    },
  },

  feedFish: {
    weight: () => 3,
    *program(b) {
      yield* b.walkTo("goldfish");
      b.look(v3(1.9, 0.9, 0.26));
      b.hold("fishFood", "R");
      b.pose("reach", 0.6);
      yield* b.wait(1.5);
      b.room.parts.goldfish.feed();
      yield* b.wait(2);
      b.drop();
      b.pose("stand", 0.6);
      b.sayActivity();
      yield* b.waitRange(5, 9);
    },
  },

  checkClock: {
    weight: () => 2,
    *program(b) {
      yield* b.walkTo("clock");
      b.look(v3(2.8, 2.3, 0));
      b.pose("lookUp", 0.6);
      yield* b.waitRange(3, 5);
      b.pose("stand", 0.6);
      b.sayActivity();
      yield* b.waitRange(3, 5);
    },
  },

  phoneHome: {
    weight: () => 2.5,
    *program(b) {
      yield* openFloorSpot(b);
      yield* b.turnTo(b.rng.range(-0.6, 0.6));
      b.hold("phone", "R");
      b.pose("phone", 0.6);
      b.look(null);
      yield* b.waitRange(5, 9);
      b.sayActivity();
      yield* b.waitRange(12, 25);
      b.drop();
      b.pose("stand", 0.5);
    },
  },

  sweep: {
    weight: () => 2,
    *program(b) {
      b.hold("broom", "R");
      for (let i = 0; i < 3; i += 1) {
        yield* b.walkTo([b.rng.range(-2.5, 2.5), b.rng.range(2.5, 3.7)]);
        b.pose("sweep", 0.5);
        b.look(v3(b.position.x, 0, b.position.z + 0.6));
        yield* b.waitRange(4, 7);
        if (i === 1) b.sayActivity();
      }
      b.drop();
      b.pose("stand", 0.5);
    },
  },

  lieOnRug: {
    weight: (c) => 2 + (1 - c.energy) * 2,
    *program(b) {
      yield* b.walkTo("rugCentre");
      yield* b.lieDown("rugCentre", LIE.rug, "lieBack");
      b.look(v3(-0.4, 2.6, 3.6));
      yield* b.waitRange(8, 14);
      b.sayActivity();
      yield* b.waitRange(20, 40);
      yield* b.getUp();
    },
  },

  peekViewer: {
    weight: () => 2,
    *program(b) {
      const x = Math.max(-2.2, Math.min(2.2, b.position.x));
      yield* b.walkTo([x, 3.7]);
      b.setCamera("freeze");
      yield* b.turnTo(0);
      const close = Math.max(3.9, b.cameraPos().z - 1.75);
      yield* b.moveStraight(x, close, { speed: 0.4 });
      b.pose("peek", 0.8);
      b.look("viewer");
      yield* b.wait(1);
      yield* b.sayAndWait("peek");
      yield* b.waitRange(1.5, 3);
      b.pose("stand", 0.6);
      yield* b.moveStraight(x, 3.5, { speed: 0.45 });
      b.setCamera("normal");
    },
    cleanup(b) {
      b.setCamera("normal");
    },
  },

  waveViewer: {
    weight: () => 2,
    *program(b) {
      const cam = b.cameraPos();
      yield* b.turnTo(Math.atan2(cam.x - b.position.x, cam.z - b.position.z));
      b.look("viewer");
      b.pose("wave", 0.4);
      yield* b.wait(3.2);
      b.pose("standChill", 0.6);
      b.sayActivity();
      yield* b.waitRange(3, 5);
    },
  },

  popOut: {
    weight: () => 2,
    *program(b) {
      b.sayActivity();
      yield* b.walkTo("door");
      b.room.parts.door.setOpen(true);
      yield* b.wait(0.8);
      yield* b.moveStraight(2.8, -1.1, { speed: 0.5 });
      b.room.parts.door.setOpen(false);
      yield* b.wait(1);
      b.hide(true);
      yield* b.waitRange(15, 35);
      const [text, prop] = b.rng.pick(HELD_ITEMS);
      b.setHeld(text);
      b.hold(prop, "R");
      b.yaw = 0;
      b.hide(false);
      b.room.parts.door.setOpen(true);
      yield* b.wait(0.9);
      yield* b.moveStraight(2.8, 0.75, { speed: 0.5 });
      b.room.parts.door.setOpen(false);
      yield* b.turnTo(0);
      b.pose("hold", 0.6);
      b.look("viewer");
      yield* b.sayAndWait("returnHome");
      yield* b.waitRange(4, 10);
    },
    cleanup(b) {
      b.hide(false);
      b.room.parts.door.setOpen(false);
    },
  },

  tryHats: {
    weight: () => 2.5,
    *program(b) {
      yield* b.walkTo("wardrobe");
      b.look(v3(-4.5, 2.1, 3.15));
      b.pose("reach", 0.6);
      yield* b.wait(1.4);
      const kind = b.rng.pick(["bowler", "sunhat", "party"]);
      b.props.wearHat(kind);
      b.room.parts.hatShelf?.(kind, false);
      b.pose("stand", 0.5);
      yield* b.walkTo("mirror");
      b.pose("standChill", 0.6);
      b.look(v3(-4.75, 1.1, 3.15));
      yield* b.waitRange(4, 7);
      b.sayActivity();
      yield* b.waitRange(5, 9);
      b.state.hatUntil = b.state.time + b.rng.range(90, 240);
    },
  },

  mirror: {
    weight: () => 2,
    *program(b) {
      yield* b.walkTo("mirror");
      b.pose("standChill", 0.6);
      b.look(v3(-4.75, 1.1, 3.15));
      yield* b.waitRange(5, 8);
      b.sayActivity();
      yield* b.waitRange(4, 8);
    },
  },

  playGame: {
    weight: (c) => (evening(c.hour) ? 4 : 2.5),
    *program(b) {
      yield* b.sitOn(b.rng.chance(0.5) ? "sofaSeat" : "sofaSeatRight", "sitHold");
      b.hold("game", "R");
      b.look(null);
      yield* b.waitRange(10, 20);
      b.sayActivity();
      yield* b.waitRange(20, 45);
    },
  },

  followFly: {
    weight: () => 1.5,
    *program(b) {
      yield* openFloorSpot(b);
      b.pose("stand", 0.5);
      const centre = v3(b.position.x, 1.3, b.position.z + 0.4);
      const fly = new THREE.Vector3();
      let t = 0;
      const total = b.rng.range(14, 24);
      while (t < total) {
        const dt = yield;
        t += dt;
        fly.set(centre.x + Math.sin(t * 1.7) * 0.6 + Math.sin(t * 4.3) * 0.15, centre.y + Math.sin(t * 2.3) * 0.3, centre.z + Math.cos(t * 1.3) * 0.5);
        b.setFly(fly);
        if (t > 6 && t < 6 + dt * 1.5) b.sayActivity();
      }
      b.setFly(null);
      b.pose("shrug", 0.5);
      yield* b.wait(2);
      b.pose("stand", 0.5);
    },
    cleanup(b) {
      b.setFly(null);
    },
  },

  admirePainting: {
    weight: () => 1.5,
    *program(b) {
      yield* b.walkTo([1.55, 1.15]);
      yield* b.turnTo(Math.PI);
      b.pose("handsBehindBack", 0.6);
      b.look(v3(1.55, 1.58, 0));
      yield* b.waitRange(6, 10);
      b.sayActivity();
      yield* b.waitRange(5, 9);
    },
  },

  lavaLamp: {
    weight: (c) => (evening(c.hour) || c.night ? 3 : 1),
    *program(b) {
      yield* b.sitOn("bedRead", "sitChin");
      b.look(v3(-4.62, 0.75, 0.2));
      yield* b.waitRange(8, 12);
      b.sayActivity();
      yield* b.waitRange(10, 20);
    },
  },

  toggleLamp: {
    weight: () => 0.6,
    *program(b) {
      yield* b.walkTo([0.95, 0.85]);
      yield* b.turnTo(Math.atan2(0.55 - 0.95, 0.32 - 0.85));
      b.look(v3(0.55, 1.4, 0.32));
      b.pose("reach", 0.5);
      yield* b.wait(0.9);
      b.room.parts.floorLamp.toggle();
      b.pose("stand", 0.5);
      b.sayActivity();
      yield* b.waitRange(2, 4);
    },
  },
};

export { SPOTS };
