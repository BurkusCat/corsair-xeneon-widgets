// Kitchenette in the right-hand corner: an L of sage cupboards with a butcher-block top,
// sink, kettle, toaster, wall cupboards, a retro fridge that opens, and a bistro table.

import * as THREE from "three";
import { FURNITURE, ROOM } from "../core/layout.js";
import * as T from "../render/textures.js";
import { box, contactShadow, cyl, lathe, place, rbox, shade, sphere } from "./kit.js";
import { standard, withCornerShade } from "./materials.js";

const fp = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));
const TOP = 0.92;

export function buildKitchen(ctx, textures) {
  const group = new THREE.Group();
  group.name = "kitchen";
  const interactables = [];
  const updaters = [];
  const lampSetters = [];
  const parts = {};
  const shadeOpts = { strength: 0.25, radius: 0.35 };
  const mat = (o) => withCornerShade(standard(o), [], shadeOpts);

  const sage = mat({ color: "#8fae94", roughness: 0.5 });
  const sageDark = mat({ color: "#6f8f76", roughness: 0.6 });
  const block = mat({ map: T.woodGrain("#b98652", { seed: 91, contrast: 0.16 }), roughness: 0.45 });
  const chrome = standard({ color: "#e8eaee", roughness: 0.12, metalness: 1 });
  const brass = standard({ color: "#d6ad55", roughness: 0.3, metalness: 1 });

  // Base cupboards: body, doors with brass bar handles, worktop.
  function counter(x0, x1, z0, z1, facing) {
    const g = new THREE.Group();
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    g.add(place(box(w, 0.1, d - 0.06, sageDark), cx, 0.05, cz - (facing === "z" ? 0.03 : 0)));
    g.add(place(rbox(w, TOP - 0.14, d, 0.01, sage), cx, 0.1 + (TOP - 0.14) / 2, cz));
    const top = rbox(w + 0.03, 0.04, d + 0.03, 0.008, block);
    top.position.set(cx, TOP - 0.02, cz);
    g.add(top);
    // Door seams and handles on the front face.
    const along = facing === "z" ? w : d;
    const doors = Math.max(1, Math.round(along / 0.5));
    for (let i = 0; i < doors; i += 1) {
      const t = (i + 0.5) / doors;
      const seamMat = sageDark;
      if (facing === "z") {
        const x = x0 + t * w;
        if (i > 0) g.add(place(box(0.006, TOP - 0.2, 0.004, seamMat), x0 + (i / doors) * w, 0.1 + (TOP - 0.14) / 2, z1 + 0.002));
        const handle = cyl(0.007, 0.007, 0.16, brass, 8);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(x, TOP - 0.13, z1 + 0.018);
        g.add(handle);
      } else {
        const z = z0 + t * d;
        if (i > 0) g.add(place(box(0.004, TOP - 0.2, 0.006, seamMat), x0 - 0.002, 0.1 + (TOP - 0.14) / 2, z0 + (i / doors) * d));
        const handle = cyl(0.007, 0.007, 0.16, brass, 8);
        handle.rotation.x = Math.PI / 2;
        handle.position.set(x0 - 0.018, TOP - 0.13, z);
        g.add(handle);
      }
    }
    return g;
  }

  const back = fp.counterBack;
  const right = fp.counterRight;
  const counterBack = counter(back.x0, back.x1, back.z0, back.z1, "z");
  counterBack.name = "counterBack";
  const counterRight = counter(right.x0, right.x1, right.z0, right.z1, "x");
  counterRight.name = "counterRight";
  group.add(counterBack, counterRight);
  group.add(contactShadow(textures, (back.x0 + back.x1) / 2, back.z1 - 0.15, back.x1 - back.x0 + 0.2, 0.5, 0.45));
  group.add(contactShadow(textures, right.x0 + 0.15, (right.z0 + right.z1) / 2, 0.5, right.z1 - right.z0 + 0.2, 0.45));
  interactables.push({ id: "counterBack", object: counterBack, priority: 1 });
  interactables.push({ id: "counterRight", object: counterRight, priority: 1 });

  // Splashback tiles on both walls.
  const tiles = T.metroTiles();
  const splashH = 0.55;
  const tileMat = (repeatX) => {
    const tex = tiles.clone();
    tex.repeat.set(repeatX, splashH / 0.3);
    tex.needsUpdate = true;
    return withCornerShade(standard({ map: tex, roughness: 0.25 }), [], shadeOpts);
  };
  const splashBack = new THREE.Mesh(new THREE.PlaneGeometry(back.x1 - back.x0, splashH), tileMat((back.x1 - back.x0) / 0.6));
  splashBack.position.set((back.x0 + back.x1) / 2, TOP + splashH / 2, 0.004);
  splashBack.receiveShadow = true;
  group.add(splashBack);
  const splashRight = new THREE.Mesh(new THREE.PlaneGeometry(right.z1, splashH), tileMat(right.z1 / 0.6));
  splashRight.rotation.y = -Math.PI / 2;
  splashRight.position.set(ROOM.halfWidth - 0.004, TOP + splashH / 2, right.z1 / 2);
  splashRight.receiveShadow = true;
  group.add(splashRight);

  // Wall cupboards above, on both walls.
  const upperY = TOP + splashH + 0.36;
  const upperBack = new THREE.Group();
  upperBack.add(place(rbox(back.x1 - back.x0, 0.7, 0.34, 0.01, sage), (back.x0 + back.x1) / 2, upperY, 0.17));
  for (let i = 1; i < 3; i += 1) upperBack.add(place(box(0.006, 0.66, 0.004, sageDark), back.x0 + (i / 3) * (back.x1 - back.x0), upperY, 0.342));
  for (let i = 0; i < 3; i += 1) upperBack.add(place(sphere(0.014, brass, 10, 8), back.x0 + ((i + 0.5) / 3) * (back.x1 - back.x0) + 0.15, upperY - 0.28, 0.355));
  group.add(upperBack);
  const upperRight = new THREE.Group();
  upperRight.add(place(rbox(0.34, 0.7, right.z1 - 0.36, 0.01, sage), ROOM.halfWidth - 0.17, upperY, (0.34 + right.z1) / 2));
  for (let i = 0; i < 2; i += 1) upperRight.add(place(sphere(0.014, brass, 10, 8), ROOM.halfWidth - 0.355, upperY - 0.28, 0.34 + ((i + 0.5) / 2) * (right.z1 - 0.34) + 0.15));
  group.add(upperRight);

  // Sink and tap in the back counter.
  {
    const sx = 4.32;
    const sink = new THREE.Group();
    sink.add(place(box(0.5, 0.01, 0.4, standard({ color: "#c9ccd2", roughness: 0.25, metalness: 0.9 })), 0, TOP + 0.001, 0));
    sink.add(place(box(0.42, 0.012, 0.32, standard({ color: "#6d7178", roughness: 0.3, metalness: 0.8 })), 0, TOP + 0.004, 0));
    const tapCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, -0.17), new THREE.Vector3(0, 0.22, -0.17), new THREE.Vector3(0, 0.3, -0.08), new THREE.Vector3(0, 0.22, 0.0)]);
    sink.add(shade(new THREE.Mesh(new THREE.TubeGeometry(tapCurve, 20, 0.012, 8), chrome)));
    sink.children[2].position.y = TOP;
    sink.position.set(sx, 0, 0.33);
    group.add(sink);
  }

  // Kettle: cream, domed, with a handle and a spout.
  {
    const kettle = new THREE.Group();
    kettle.name = "kettle";
    const body = mat({ color: "#f1e6cf", roughness: 0.3 });
    kettle.add(lathe([[0, 0], [0.085, 0], [0.095, 0.03], [0.09, 0.15], [0.06, 0.2], [0.02, 0.215], [0, 0.215]], body, 24));
    kettle.add(place(sphere(0.016, mat({ color: "#2c2a28", roughness: 0.4 }), 8, 6), 0, 0.22, 0));
    const handle = shade(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 18, Math.PI), mat({ color: "#2c2a28", roughness: 0.4 })));
    handle.rotation.y = Math.PI / 2;
    handle.position.set(0, 0.16, -0.0);
    handle.rotation.z = 0;
    kettle.add(handle);
    const spout = cyl(0.012, 0.022, 0.1, body, 10);
    spout.rotation.x = 1.0;
    spout.position.set(0, 0.11, 0.1);
    kettle.add(spout);
    kettle.position.set(3.82, TOP, 0.3);
    group.add(kettle);
    interactables.push({ id: "kettle", object: kettle, priority: 3, pad: 36 });
    parts.kettle = kettle;
  }

  // Toaster on the side counter, with toast that pops.
  {
    const toaster = new THREE.Group();
    toaster.name = "toaster";
    toaster.add(rbox(0.16, 0.19, 0.27, 0.04, standard({ color: "#d9473b", roughness: 0.3, metalness: 0.2 })));
    toaster.children[0].position.y = 0.095;
    for (const z of [-0.045, 0.045]) toaster.add(place(box(0.03, 0.005, 0.2, standard({ color: "#2a2422", roughness: 0.8 })), 0, 0.191, z));
    toaster.add(place(box(0.012, 0.03, 0.02, chrome), -0.085, 0.13, 0.08));
    const toastMat = mat({ color: "#d9a35f", roughness: 0.9 });
    const toasts = [];
    for (const z of [-0.045, 0.045]) {
      const toast = rbox(0.022, 0.11, 0.11, 0.01, toastMat, 2);
      toast.position.set(0, 0.14, z);
      toaster.add(toast);
      toasts.push(toast);
    }
    toaster.position.set(4.48, TOP, 1.32);
    toaster.rotation.y = Math.PI / 2;
    group.add(toaster);
    interactables.push({ id: "toaster", object: toaster, priority: 3, pad: 36 });
    let pop = 0;
    let popTarget = 0;
    parts.toaster = {
      object: toaster,
      toastMat,
      setUp(up) {
        popTarget = up ? 1 : 0;
      },
    };
    updaters.push((dt) => {
      pop += (popTarget - pop) * Math.min(1, dt * (popTarget ? 14 : 4));
      for (const toast of toasts) toast.position.y = 0.14 + pop * 0.08;
    });
  }

  // A tea jar and a fruit bowl, for life.
  {
    const jarMat = standard({ color: "#c8e2e6", roughness: 0.1, transparent: true, opacity: 0.5 });
    const jar = lathe([[0, 0], [0.05, 0], [0.05, 0.14], [0.035, 0.15], [0, 0.15]], jarMat, 16);
    jar.position.set(3.55, TOP, 0.22);
    group.add(jar);
    group.add(place(cyl(0.04, 0.04, 0.02, standard({ color: "#a86b3c", roughness: 0.5 }), 16), 3.55, TOP + 0.16, 0.22));
    const bowl = lathe([[0, 0], [0.06, 0], [0.12, 0.06], [0.125, 0.065], [0.06, 0.008], [0, 0.008]], mat({ color: "#2f6e8a", roughness: 0.4 }), 24);
    bowl.position.set(4.5, TOP, 0.85);
    group.add(bowl);
    const fruitColours = ["#f2c14a", "#e2552f", "#f2c14a", "#9cc643"];
    fruitColours.forEach((c, i) => group.add(place(sphere(0.04, mat({ color: c, roughness: 0.5 }), 12, 8), 4.5 + Math.cos(i * 1.7) * 0.05, TOP + 0.05 + (i === 3 ? 0.04 : 0), 0.85 + Math.sin(i * 1.7) * 0.05)));
  }

  // Retro mint fridge on the right wall; the door opens toward the room.
  {
    const f = fp.fridge;
    const w = f.x1 - f.x0;
    const d = f.z1 - f.z0;
    const H = 1.82;
    const fridge = new THREE.Group();
    fridge.name = "fridge";
    const mint = mat({ color: "#a9d8c6", roughness: 0.28 });
    // Body, open on the -x face.
    const body = new THREE.Group();
    body.add(place(rbox(w - 0.05, H - 0.08, d, 0.09, mint), 0.025, 0.08 + (H - 0.08) / 2, 0));
    for (const sz of [-1, 1]) body.add(place(cyl(0.02, 0.02, 0.08, chrome, 8), 0.1, 0.04, sz * (d / 2 - 0.08)));
    fridge.add(body);
    // Lit interior, seen when the door is open.
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(d - 0.12, H - 0.36), new THREE.MeshBasicMaterial({ color: "#fdf8ec" }));
    inside.rotation.y = -Math.PI / 2;
    inside.position.set(-w / 2 + 0.02, 0.08 + H / 2, 0);
    inside.visible = false;
    fridge.add(inside);
    const shelfItems = new THREE.Group();
    const itemColours = ["#f6f6f0", "#ffd166", "#e86f6f", "#7fc8a9", "#f6f6f0", "#ff9f5a"];
    itemColours.forEach((c, i) => {
      const item = rbox(0.08, 0.14 + (i % 3) * 0.04, 0.08, 0.02, new THREE.MeshBasicMaterial({ color: c }), 2);
      item.castShadow = false;
      item.position.set(-w / 2 + 0.07, 0.6 + Math.floor(i / 3) * 0.42 + 0.08, -d / 2 + 0.16 + (i % 3) * 0.2);
      shelfItems.add(item);
    });
    shelfItems.visible = false;
    fridge.add(shelfItems);
    const hinge = new THREE.Group();
    hinge.position.set(-w / 2 + 0.01, 0, -d / 2 + 0.02);
    const doorLeaf = rbox(0.07, H - 0.12, d - 0.03, 0.06, mint);
    doorLeaf.position.set(-0.035, 0.1 + (H - 0.12) / 2, (d - 0.03) / 2);
    hinge.add(doorLeaf);
    const handle = cyl(0.014, 0.014, 0.42, chrome, 10);
    handle.position.set(-0.09, 1.05, d - 0.12);
    hinge.add(handle);
    for (const y of [0.85, 1.27]) hinge.add(place(box(0.03, 0.03, 0.03, chrome), -0.075, y, d - 0.12));
    const badge = box(0.004, 0.04, 0.18, chrome);
    badge.position.set(-0.072, 1.55, (d - 0.03) / 2);
    hinge.add(badge);
    fridge.add(hinge);
    const fridgeLight = new THREE.PointLight("#eaf6ff", 0, 2.5, 2);
    fridgeLight.position.set(-w / 2 - 0.15, 1.1, 0);
    fridge.add(fridgeLight);
    fridge.position.set((f.x0 + f.x1) / 2, 0, (f.z0 + f.z1) / 2);
    group.add(fridge);
    group.add(contactShadow(textures, (f.x0 + f.x1) / 2 - 0.05, (f.z0 + f.z1) / 2, w + 0.3, d + 0.25, 0.5));
    interactables.push({ id: "fridge", object: fridge, priority: 1 });
    let open = 0;
    let target = 0;
    parts.fridge = {
      object: fridge,
      setOpen(value) {
        target = value ? 1 : 0;
      },
    };
    updaters.push((dt) => {
      open += (target - open) * Math.min(1, dt * 3);
      hinge.rotation.y = -open * 1.75;
      const visible = open > 0.05;
      inside.visible = visible;
      shelfItems.visible = visible;
      fridgeLight.intensity = open * 3;
    });
  }

  // Bistro table and stool.
  {
    const t = fp.bistroTable;
    const marble = mat({ color: "#f3f0ea", roughness: 0.2 });
    const iron = mat({ color: "#2e2b2a", roughness: 0.5, metalness: 0.6 });
    const table = new THREE.Group();
    table.name = "bistroTable";
    table.add(place(cyl(t.r, t.r, 0.03, marble, 32), 0, 0.74, 0));
    table.add(place(cyl(0.025, 0.025, 0.72, iron, 10), 0, 0.37, 0));
    table.add(place(cyl(0.2, 0.22, 0.03, iron, 24), 0, 0.015, 0));
    const vase = lathe([[0, 0], [0.03, 0], [0.04, 0.05], [0.02, 0.12], [0.022, 0.14], [0, 0.14]], mat({ color: "#e9c46a", roughness: 0.3 }), 16);
    vase.position.set(0.08, 0.755, -0.05);
    table.add(vase);
    const flower = sphere(0.03, mat({ color: "#e76f8a", roughness: 0.6 }), 10, 8);
    flower.position.set(0.09, 0.93, -0.05);
    table.add(flower);
    table.add(place(cyl(0.003, 0.003, 0.08, mat({ color: "#3f7a3f" }), 4), 0.085, 0.89, -0.05));
    table.position.set(t.x, 0, t.z);
    group.add(table);
    group.add(contactShadow(textures, t.x, t.z, 0.8, 0.8, 0.4, true));
    interactables.push({ id: "bistroTable", object: table, priority: 2 });
    parts.bistroTable = table;

    const s = fp.stool;
    const stool = new THREE.Group();
    stool.name = "stool";
    stool.add(place(cyl(s.r, s.r - 0.02, 0.05, mat({ color: "#c4553a", roughness: 0.6 }), 24), 0, 0.64, 0));
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(0.012, 0.012, 0.66, iron, 8);
      leg.position.set(Math.sin(a) * 0.12, 0.32, Math.cos(a) * 0.12);
      leg.rotation.set(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12);
      stool.add(leg);
    }
    stool.position.set(s.x, 0, s.z);
    group.add(stool);
    group.add(contactShadow(textures, s.x, s.z, 0.5, 0.5, 0.35, true));
    interactables.push({ id: "stool", object: stool, priority: 2 });
  }

  return {
    group,
    interactables,
    lampSetters,
    parts,
    update(dt) {
      for (const u of updaters) u(dt);
    },
  };
}
