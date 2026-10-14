// Things Mervin carries. Each prop is built once on first use. Held props follow a hand's
// grip point but keep their own orientation relative to his body (a mug stays upright), so
// they look right in any arm pose. Hats ride on the head bone.

import * as THREE from "three";

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

function mesh(geometry, material) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  return m;
}

function group(...children) {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

function at(object, x, y, z, rx = 0, ry = 0, rz = 0) {
  object.position.set(x, y, z);
  object.rotation.set(rx, ry, rz);
  return object;
}

const lathe = (pts, material, seg = 20) => mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), material);

// Builders return an Object3D whose origin is where the hand holds it.
const BUILDERS = {
  mug: () => {
    const m = std("#3f8f8a", { roughness: 0.35 });
    const cup = lathe([[0, -0.04], [0.035, -0.04], [0.038, 0.045], [0.033, 0.045], [0.032, -0.03], [0, -0.03]], m);
    const handle = at(mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 14, Math.PI), m), 0.038, 0.005, 0, 0, 0, -Math.PI / 2);
    const tea = at(mesh(new THREE.CircleGeometry(0.031, 16), std("#8a5a2e", { roughness: 0.2 })), 0, 0.035, 0, -Math.PI / 2);
    return at(group(cup, handle, tea), 0, 0.01, 0.03);
  },
  book: () => {
    const cover = mesh(new THREE.BoxGeometry(0.15, 0.2, 0.025), std("#b0413e", { roughness: 0.7 }));
    const pages = at(mesh(new THREE.BoxGeometry(0.14, 0.19, 0.022), std("#f3ead6", { roughness: 0.9 })), 0.006, 0, 0);
    return at(group(cover, pages), 0, 0.05, 0.1, -0.5, 0, 0);
  },
  toast: () => {
    const slice = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.014), std("#d39a52", { roughness: 0.9 }));
    const crust = at(mesh(new THREE.BoxGeometry(0.104, 0.012, 0.016), std("#8a5322", { roughness: 0.9 })), 0, 0.052, 0);
    return at(group(slice, crust), 0, 0.03, 0.04, 0.3, 0, 0);
  },
  wateringCan: () => {
    const m = std("#5f9e6e", { roughness: 0.4, metalness: 0.3 });
    const body = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.15, 18), m);
    const spout = at(mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.22, 8), m), 0, 0.03, 0.14, 1.0, 0, 0);
    const rose = at(mesh(new THREE.CylinderGeometry(0.022, 0.012, 0.03, 10), m), 0, 0.11, 0.23, 1.0, 0, 0);
    const handle = at(mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 14, Math.PI), m), 0, 0.07, -0.02, 0, Math.PI / 2, 0);
    return at(group(body, spout, rose, handle), 0, -0.12, 0.02);
  },
  remote: () => at(mesh(new THREE.BoxGeometry(0.045, 0.02, 0.16), std("#2b2b30")), 0, 0, 0.06),
  phone: () => {
    const body = mesh(new THREE.CapsuleGeometry(0.03, 0.06, 6, 12), std("#7a52c7", { roughness: 0.3, emissive: "#5b2fb0", emissiveIntensity: 0.4 }));
    const antenna = at(mesh(new THREE.SphereGeometry(0.012, 10, 8), std("#ffd166", { emissive: "#ffb000", emissiveIntensity: 1.2 })), 0, 0.07, 0);
    return at(group(body, antenna), 0, 0.03, 0.02);
  },
  game: () => {
    const body = mesh(new THREE.BoxGeometry(0.16, 0.08, 0.022), std("#e2553f", { roughness: 0.4 }));
    const screen = at(mesh(new THREE.PlaneGeometry(0.07, 0.05), new THREE.MeshBasicMaterial({ color: "#9fe6a0" })), 0, 0.004, 0.012);
    return at(group(body, screen), 0.06, 0.02, 0.1, -0.7, 0, 0);
  },
  broom: () => {
    const wood = std("#a06a3a");
    const stick = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 8), wood);
    const head = at(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.06), wood), 0, -0.55, 0);
    const bristles = at(mesh(new THREE.BoxGeometry(0.22, 0.08, 0.05), std("#d8b45c", { roughness: 1 })), 0, -0.61, 0);
    return at(group(stick, head, bristles), 0, -0.1, 0.12, 0.35, 0, 0.2);
  },
  apple: () => at(mesh(new THREE.SphereGeometry(0.04, 14, 10), std("#d9412f", { roughness: 0.35 })), 0, 0.02, 0.03),
  sandwich: () => {
    const bread = std("#e8c58c", { roughness: 0.9 });
    const g = group(
      mesh(new THREE.BoxGeometry(0.1, 0.012, 0.1), bread),
      at(mesh(new THREE.BoxGeometry(0.096, 0.012, 0.096), std("#79b850")), 0, 0.012, 0),
      at(mesh(new THREE.BoxGeometry(0.1, 0.012, 0.1), bread), 0, 0.024, 0),
    );
    return at(g, 0, 0.02, 0.04, 0.4, 0, 0);
  },
  crisps: () => at(mesh(new THREE.BoxGeometry(0.11, 0.15, 0.04), std("#f2c14a", { roughness: 0.3, metalness: 0.2 })), 0, 0.05, 0.03),
  fishFood: () => at(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.07, 12), std("#f08a24")), 0, 0.02, 0.02),
  pineapple: () => {
    const fruit = mesh(new THREE.SphereGeometry(0.07, 14, 10), std("#d9a63a", { roughness: 0.8 }));
    fruit.scale.set(1, 1.4, 1);
    const leaves = at(mesh(new THREE.ConeGeometry(0.05, 0.12, 7), std("#4f8a3c")), 0, 0.15, 0);
    return at(group(fruit, leaves), 0, 0.05, 0.06);
  },
  trafficCone: () => {
    const cone = mesh(new THREE.ConeGeometry(0.11, 0.38, 18), std("#f26b1d"));
    const band = at(mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.05, 18), std("#f4f4f4")), 0, 0.03, 0);
    const base = at(mesh(new THREE.BoxGeometry(0.25, 0.02, 0.25), std("#222")), 0, -0.2, 0);
    return at(group(cone, band, base), 0, 0.12, 0.12);
  },
  box: () => at(mesh(new THREE.BoxGeometry(0.28, 0.2, 0.22), std("#c49a6c", { roughness: 0.95 })), 0, 0.06, 0.12),
  loaf: () => at(mesh(new THREE.CapsuleGeometry(0.06, 0.12, 6, 12), std("#c98a46", { roughness: 0.9 })), 0, 0.03, 0.06, 0, 0, Math.PI / 2),
  cabbage: () => at(mesh(new THREE.SphereGeometry(0.09, 14, 10), std("#7fb35a", { roughness: 0.7 })), 0, 0.05, 0.07),
  duck: () => {
    const y = std("#ffd23f", { roughness: 0.3 });
    return at(group(mesh(new THREE.SphereGeometry(0.05, 14, 10), y), at(mesh(new THREE.SphereGeometry(0.032, 12, 8), y), 0, 0.05, 0.03), at(mesh(new THREE.ConeGeometry(0.012, 0.03, 8), std("#f07f1d")), 0, 0.05, 0.065, Math.PI / 2, 0, 0)), 0, 0.03, 0.05);
  },
  pizza: () => at(mesh(new THREE.BoxGeometry(0.32, 0.04, 0.32), std("#d9c19a", { roughness: 0.95 })), 0, 0.0, 0.14),
  umbrella: () => {
    const m = std("#2f5f8a");
    return at(group(mesh(new THREE.ConeGeometry(0.05, 0.6, 10), m), at(mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), std("#3b2a1f")), 0.03, -0.32, 0, 0, 0, Math.PI)), 0, -0.2, 0.04);
  },
  milk: () => at(lathe([[0, -0.08], [0.04, -0.08], [0.04, 0.05], [0.018, 0.09], [0, 0.09]], std("#fbfbf6", { roughness: 0.3 })), 0, 0.03, 0.03),
  newspaper: () => at(mesh(new THREE.BoxGeometry(0.2, 0.28, 0.01), std("#d9d6cf", { roughness: 0.95 })), 0, 0.06, 0.05, -0.4, 0, 0),
  cactus: () => at(group(lathe([[0, 0], [0.05, 0], [0.06, 0.08], [0, 0.08]], std("#c97b4a")), at(mesh(new THREE.CapsuleGeometry(0.035, 0.1, 6, 10), std("#5d8f4e")), 0, 0.15, 0)), 0, -0.02, 0.05),
  bananas: () => at(mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 16, Math.PI * 0.7), std("#f2d24a")), 0, 0.02, 0.05, 0, 0, 0.6),
  egg: () => {
    const e = mesh(new THREE.SphereGeometry(0.026, 14, 10), std("#f6efe0", { roughness: 0.4 }));
    e.scale.set(1, 1.3, 1);
    return at(e, 0, 0.02, 0.03);
  },
  ladder: () => {
    const wood = std("#c0884e");
    const g = group(at(mesh(new THREE.BoxGeometry(0.02, 0.7, 0.02), wood), -0.12, 0, 0), at(mesh(new THREE.BoxGeometry(0.02, 0.7, 0.02), wood), 0.12, 0, 0));
    for (let i = 0; i < 4; i += 1) g.add(at(mesh(new THREE.BoxGeometry(0.24, 0.015, 0.015), wood), 0, -0.25 + i * 0.17, 0));
    return at(g, 0, 0, 0.08, 0.2, 0, 0);
  },
  gnome: () => at(group(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 12), std("#2f5f8a")), at(mesh(new THREE.ConeGeometry(0.05, 0.12, 12), std("#d9412f")), 0, 0.13, 0), at(mesh(new THREE.SphereGeometry(0.035, 10, 8), std("#f1c7a8")), 0, 0.08, 0.01)), 0, 0.04, 0.06),
  jam: () => at(group(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 14), std("#a2263a", { roughness: 0.2 })), at(mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.015, 14), std("#e8e0d0")), 0, 0.045, 0)), 0, 0.02, 0.03),
  sock: () => at(mesh(new THREE.CapsuleGeometry(0.025, 0.12, 6, 10), std("#e76f51", { roughness: 1 })), 0, -0.04, 0.03),
  leaflet: () => at(mesh(new THREE.BoxGeometry(0.1, 0.15, 0.004), std("#9ccf6a", { roughness: 0.9 })), 0, 0.04, 0.04, -0.4, 0, 0),
};

// What each {held} item in returnHome lines looks like.
export const HELD_ITEMS = [
  ["a pineapple", "pineapple"],
  ["a traffic cone", "trafficCone"],
  ["some milk", "milk"],
  ["a newspaper", "newspaper"],
  ["a loaf of bread", "loaf"],
  ["a single sock", "sock"],
  ["a potted cactus", "cactus"],
  ["a bag of crisps", "crisps"],
  ["a pizza", "pizza"],
  ["a small ladder", "ladder"],
  ["a rubber duck", "duck"],
  ["a bunch of bananas", "bananas"],
  ["a leaflet about bins", "leaflet"],
  ["a cabbage", "cabbage"],
  ["an umbrella", "umbrella"],
  ["a cardboard box", "box"],
  ["a jar of jam", "jam"],
  ["a garden gnome", "gnome"],
  ["an egg", "egg"],
];

const HATS = {
  bowler: () => {
    const m = std("#3a3a46", { roughness: 0.7 });
    const crown = mesh(new THREE.SphereGeometry(0.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
    crown.scale.set(1.05, 0.9, 1.1);
    const brim = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 24), m);
    return group(crown, brim);
  },
  sunhat: () => {
    const m = std("#d9b96a", { roughness: 0.9 });
    const crown = at(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.08, 18), m), 0, 0.04, 0);
    const brim = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.008, 28), m);
    const band = at(mesh(new THREE.CylinderGeometry(0.101, 0.101, 0.02, 18), std("#c4553a")), 0, 0.012, 0);
    return group(crown, brim, band);
  },
  party: () => mesh(new THREE.ConeGeometry(0.07, 0.2, 16), std("#5bc0eb", { roughness: 0.5 })),
};

export function createProps(mervin, scene) {
  const held = { L: null, R: null };
  let hat = null;
  const cache = new Map();
  const tmpQ = new THREE.Quaternion();
  const yawQ = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  function build(name) {
    if (!cache.has(name)) {
      const object = (BUILDERS[name] ?? BUILDERS.box)();
      object.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      const holder = new THREE.Group();
      holder.add(object);
      cache.set(name, holder);
    }
    return cache.get(name);
  }

  return {
    names: Object.keys(BUILDERS),
    hold(name, side = "R", { tilt = 0 } = {}) {
      this.drop(side);
      const holder = build(name);
      holder.userData.tilt = tilt;
      holder.userData.name = name;
      scene.add(holder);
      held[side] = holder;
      return holder;
    },
    drop(side = null) {
      for (const s of side ? [side] : ["L", "R"]) {
        if (held[s]) scene.remove(held[s]);
        held[s] = null;
      }
    },
    holding(side = "R") {
      return held[side]?.userData.name ?? null;
    },
    wearHat(kind) {
      this.removeHat();
      hat = (HATS[kind] ?? HATS.bowler)();
      hat.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      const head = mervin.body.bones.head;
      hat.position.set(0, 0.235, -0.025);
      hat.rotation.x = -0.12;
      head.add(hat);
      return hat;
    },
    removeHat() {
      if (hat) hat.parent?.remove(hat);
      hat = null;
    },
    get hat() {
      return hat;
    },
    // After the rig has posed the bones: move held props to the hands.
    update() {
      mervin.root.getWorldQuaternion(yawQ);
      for (const side of ["L", "R"]) {
        const holder = held[side];
        if (!holder) continue;
        mervin.body.grips[side].getWorldPosition(holder.position);
        tmpQ.setFromAxisAngle(up, side === "L" ? -0.3 : 0.3);
        holder.quaternion.copy(yawQ).multiply(tmpQ);
        if (holder.userData.tilt) holder.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), holder.userData.tilt));
      }
    },
  };
}
