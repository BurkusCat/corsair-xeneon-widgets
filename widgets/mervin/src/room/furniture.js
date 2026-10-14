// Living area and bed nook: sofa, coffee table, rug, bed, bedside table, wardrobe, plant,
// radiator, floor lamp. Positions come from core/layout.js footprints.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FURNITURE } from "../core/layout.js";
import * as T from "../render/textures.js";
import { box, contactShadow, cushion, cyl, lathe, place, rbox, shade, sphere } from "./kit.js";
import { standard, withCornerShade } from "./materials.js";

const fp = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));

function centre(f) {
  return [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, f.x1 - f.x0, f.z1 - f.z0];
}

export function buildFurniture(ctx, textures) {
  const group = new THREE.Group();
  group.name = "furniture";
  const interactables = [];
  const lampSetters = [];
  const updaters = [];
  const parts = {};
  const shadeOpts = { strength: 0.22, radius: 0.35 };
  const mat = (options) => withCornerShade(standard(options), [], shadeOpts);

  const teakTex = T.woodGrain("#8d5b37", { seed: 61 });
  const teak = mat({ map: teakTex, roughness: 0.5 });
  const walnut = mat({ map: T.woodGrain("#5e3f2a", { seed: 62 }), roughness: 0.5 });
  const brass = standard({ color: "#d6ad55", roughness: 0.28, metalness: 1 });
  const cream = mat({ color: "#efe5d0", roughness: 0.6 });

  // Rug under the sofa and coffee table.
  const rugMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.7), withCornerShade(standard({ map: textures.rug, roughness: 1 }), ["floor"], { strength: 0.3, radius: 0.3 }));
  rugMesh.rotation.x = -Math.PI / 2;
  rugMesh.position.set(-0.95, 0.006, 2.55);
  rugMesh.receiveShadow = true;
  rugMesh.name = "rug";
  group.add(rugMesh);
  interactables.push({ id: "rug", object: rugMesh, priority: 0 });

  // Sofa: mustard, facing the viewer, floating on the rug.
  {
    const [cx, cz, w, d] = centre(fp.sofa);
    const sofa = new THREE.Group();
    sofa.name = "sofa";
    const fabricTex = T.fabric("#d29a2f", { seed: 71 });
    fabricTex.repeat.set(3, 3);
    const upholstery = mat({ map: fabricTex, roughness: 0.92 });
    const legH = 0.09;
    sofa.add(place(rbox(w, 0.24, d, 0.05, upholstery), 0, legH + 0.12, 0));
    sofa.add(place(rbox(w, 0.62, 0.2, 0.07, upholstery), 0, legH + 0.31 + 0.1, -d / 2 + 0.1));
    for (const side of [-1, 1]) {
      sofa.add(place(rbox(0.2, 0.58, d, 0.08, upholstery), side * (w / 2 - 0.1), legH + 0.29, 0));
      // Seat cushions.
      const seat = cushion((w - 0.4) / 2 - 0.01, 0.15, d - 0.24, upholstery, 0.22);
      seat.position.set(side * ((w - 0.4) / 4 + 0.005), legH + 0.24 + 0.075, 0.1);
      sofa.add(seat);
      // Back cushions, leaning back a little.
      const backCushion = cushion((w - 0.4) / 2 - 0.02, 0.42, 0.17, upholstery, 0.28);
      backCushion.position.set(side * ((w - 0.4) / 4 + 0.005), legH + 0.24 + 0.15 + 0.2, -d / 2 + 0.27);
      backCushion.rotation.x = -0.14;
      sofa.add(backCushion);
    }
    // Throw pillows in teal.
    const pillowMat = mat({ map: T.fabric("#2f7f7a", { seed: 72, weave: 3 }), roughness: 0.95 });
    for (const side of [-1, 1]) {
      const pillow = cushion(0.36, 0.34, 0.12, pillowMat, 0.6);
      pillow.position.set(side * (w / 2 - 0.36), legH + 0.24 + 0.3, -d / 2 + 0.42);
      pillow.rotation.set(-0.25, side * -0.35, side * 0.12);
      sofa.add(pillow);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = cyl(0.022, 0.014, legH, teak, 10);
        leg.position.set(sx * (w / 2 - 0.08), legH / 2, sz * (d / 2 - 0.08));
        leg.rotation.z = sx * 0.12;
        sofa.add(leg);
      }
    }
    sofa.position.set(cx, 0, cz);
    group.add(sofa);
    group.add(contactShadow(textures, cx, cz, w + 0.3, d + 0.3, 0.5));
    interactables.push({ id: "sofa", object: sofa, priority: 1 });
    parts.sofa = sofa;
  }

  // Coffee table with a mug, the remote and a magazine.
  {
    const [cx, cz, w, d] = centre(fp.coffeeTable);
    const table = new THREE.Group();
    table.name = "coffeeTable";
    table.add(place(rbox(w, 0.045, d, 0.02, teak), 0, 0.4, 0));
    table.add(place(rbox(w - 0.12, 0.025, d - 0.12, 0.01, teak), 0, 0.16, 0));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = cyl(0.02, 0.014, 0.4, teak, 10);
        leg.position.set(sx * (w / 2 - 0.07), 0.2, sz * (d / 2 - 0.07));
        leg.rotation.set(sz * -0.08, 0, sx * 0.08);
        table.add(leg);
      }
    }
    const mugMat = mat({ color: "#e86f4f", roughness: 0.35 });
    const mug = lathe([[0, 0], [0.04, 0], [0.042, 0.005], [0.043, 0.09], [0.038, 0.09], [0.037, 0.012], [0, 0.012]], mugMat, 20);
    mug.position.set(0.28, 0.425, 0.06);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 8, 16, Math.PI), mugMat);
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(0.322, 0.47, 0.06);
    table.add(mug, handle);
    const remote = new THREE.Group();
    remote.name = "remote";
    remote.add(rbox(0.05, 0.022, 0.17, 0.008, mat({ color: "#2b2b30", roughness: 0.5 })));
    const red = sphere(0.007, standard({ color: "#ff4a3a", roughness: 0.4 }), 8, 6);
    red.position.set(0, 0.012, -0.055);
    remote.add(red);
    remote.position.set(-0.12, 0.435, 0.04);
    remote.rotation.y = 0.5;
    table.add(remote);
    parts.remote = remote;
    const magazine = box(0.21, 0.008, 0.28, mat({ map: T.sign("EARTH", { bg: "#e7d14a", fg: "#2c2a28", w: 256, h: 340, font: "900 64px Georgia, serif" }), roughness: 0.6 }));
    magazine.position.set(-0.3, 0.428, -0.02);
    magazine.rotation.y = -0.2;
    table.add(magazine);
    table.position.set(cx, 0, cz);
    group.add(table);
    group.add(contactShadow(textures, cx, cz, w + 0.25, d + 0.25, 0.4));
    interactables.push({ id: "coffeeTable", object: table, priority: 2 });
    interactables.push({ id: "remote", object: remote, priority: 3, pad: 40 });
  }

  // Bed: walnut frame, upholstered headboard, dusty pink duvet.
  {
    const [cx, cz, w, d] = centre(fp.bed);
    const bed = new THREE.Group();
    bed.name = "bed";
    const legH = 0.1;
    bed.add(place(rbox(w, 0.2, d, 0.03, walnut), 0, legH + 0.1, 0));
    const headMat = mat({ map: T.fabric("#6c7fa8", { seed: 81 }), roughness: 0.95 });
    bed.add(place(rbox(w + 0.06, 1.02, 0.09, 0.05, headMat), 0, 0.51, -d / 2 + 0.045));
    bed.add(place(rbox(w - 0.08, 0.2, d - 0.1, 0.06, cream), 0, legH + 0.2 + 0.1, 0.02));
    const duvetTex = T.fabric("#d98f87", { seed: 82, weave: 3, strength: 0.1 });
    duvetTex.repeat.set(2, 3);
    const duvetMat = mat({ map: duvetTex, roughness: 0.95 });
    const duvet = cushion(w + 0.04, 0.09, d - 0.55, duvetMat, 0.35);
    duvet.position.set(0, legH + 0.42, 0.28);
    bed.add(duvet);
    const fold = cyl(0.05, 0.05, w + 0.04, duvetMat, 16);
    fold.rotation.z = Math.PI / 2;
    fold.position.set(0, legH + 0.44, -d / 2 + 0.55);
    bed.add(fold);
    const pillowMat = mat({ color: "#f6f2ea", roughness: 0.9 });
    for (const side of [-1, 1]) {
      const pillow = cushion(0.5, 0.12, 0.32, pillowMat, 0.5);
      pillow.position.set(side * 0.29, legH + 0.48, -d / 2 + 0.28);
      pillow.rotation.x = -0.25;
      bed.add(pillow);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) bed.add(place(cyl(0.025, 0.02, legH, walnut, 10), sx * (w / 2 - 0.06), legH / 2, sz * (d / 2 - 0.06)));
    }
    bed.position.set(cx, 0, cz);
    group.add(bed);
    group.add(contactShadow(textures, cx, cz, w + 0.3, d + 0.3, 0.45));
    interactables.push({ id: "bed", object: bed, priority: 1 });
    parts.bed = bed;
    // A blanket that covers him when he sleeps here at night.
    const blanket = cushion(w - 0.02, 0.12, 1.25, duvetMat, 0.5);
    blanket.position.set(cx, legH + 0.56, cz + 0.35);
    blanket.visible = false;
    group.add(blanket);
    parts.bedBlanket = {
      show(on) {
        blanket.visible = on;
        duvet.visible = !on;
        fold.visible = !on;
      },
    };
  }

  // Bedside table with a photo of Mum and some books.
  {
    const [cx, cz, w, d] = centre(fp.bedside);
    const table = new THREE.Group();
    table.name = "bedside";
    table.add(place(rbox(w, 0.42, d, 0.02, teak), 0, 0.12 + 0.21, 0));
    table.add(place(rbox(w - 0.06, 0.12, 0.01, 0.004, mat({ color: "#7a4b2c", roughness: 0.5 })), 0, 0.42, d / 2));
    table.add(place(sphere(0.015, brass, 10, 8), 0, 0.42, d / 2 + 0.012));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) table.add(place(cyl(0.015, 0.012, 0.12, teak, 8), sx * (w / 2 - 0.05), 0.06, sz * (d / 2 - 0.05)));
    const frame = new THREE.Group();
    frame.add(rbox(0.14, 0.17, 0.015, 0.004, mat({ color: "#c9a25a", roughness: 0.4, metalness: 0.4 })));
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.14), standard({ map: T.mumPhoto(), roughness: 0.5 }));
    photo.position.z = 0.009;
    frame.add(photo);
    frame.position.set(0.12, 0.63, 0.06);
    frame.rotation.set(-0.1, 0.5, 0);
    table.add(frame);
    table.position.set(cx, 0, cz);
    group.add(table);
    group.add(contactShadow(textures, cx, cz, w + 0.2, d + 0.2, 0.4));
    interactables.push({ id: "bedside", object: table, priority: 2 });
    parts.bedside = table;
  }

  // Wardrobe on the left wall, doors facing the room; the right-hand door is a mirror.
  {
    const [cx, cz, w, d] = centre(fp.wardrobe);
    const wardrobe = new THREE.Group();
    wardrobe.name = "wardrobe";
    const H = 2.02;
    const paint = mat({ color: "#e9dcc0", roughness: 0.55 });
    wardrobe.add(place(rbox(w, H - 0.08, d, 0.02, paint), 0, 0.08 + (H - 0.08) / 2, 0));
    wardrobe.add(place(rbox(w + 0.04, 0.04, d + 0.04, 0.01, teak), 0, H, 0));
    // Doors on the +x face (the wardrobe's front faces the room).
    const doorMat = mat({ color: "#efe4cc", roughness: 0.5 });
    const doorW = d / 2 - 0.02;
    const doorH = H - 0.2;
    const left = rbox(0.02, doorH, doorW, 0.008, doorMat);
    left.position.set(w / 2 + 0.01, 0.08 + 0.06 + doorH / 2, d / 4 + 0.005);
    wardrobe.add(left);
    const mirrorFrame = rbox(0.02, doorH, doorW, 0.008, doorMat);
    mirrorFrame.position.set(w / 2 + 0.01, 0.08 + 0.06 + doorH / 2, -d / 4 - 0.005);
    wardrobe.add(mirrorFrame);
    const mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW - 0.08, doorH - 0.12),
      standard({ color: "#d9e3e6", roughness: 0.04, metalness: 1, envMapIntensity: 1.2 }),
    );
    mirror.rotation.y = Math.PI / 2;
    mirror.position.set(w / 2 + 0.022, 0.08 + 0.06 + doorH / 2, -d / 4 - 0.005);
    wardrobe.add(mirror);
    parts.mirror = mirror;
    for (const z of [-0.035, 0.035]) wardrobe.add(place(sphere(0.018, brass, 10, 8), w / 2 + 0.035, 1.05, z));
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) wardrobe.add(place(cyl(0.02, 0.016, 0.08, teak, 8), sx * (w / 2 - 0.05), 0.04, sz * (d / 2 - 0.05)));
    // Hats waiting on top.
    const hatMat = mat({ color: "#3a3a46", roughness: 0.7 });
    const bowler = new THREE.Group();
    bowler.add(place(sphere(0.1, hatMat, 16, 10), 0, 0.03, 0));
    bowler.children[0].scale.set(1, 0.85, 1);
    bowler.add(place(cyl(0.16, 0.16, 0.012, hatMat, 20), 0, 0.006, 0));
    bowler.position.set(0, H + 0.02, 0.32);
    wardrobe.add(bowler);
    const strawMat = mat({ color: "#d9b96a", roughness: 0.9 });
    const sunhat = new THREE.Group();
    sunhat.add(place(cyl(0.08, 0.1, 0.09, strawMat, 18), 0, 0.045, 0));
    sunhat.add(place(cyl(0.21, 0.21, 0.01, strawMat, 24), 0, 0.006, 0));
    sunhat.position.set(0.02, H + 0.02, -0.25);
    sunhat.rotation.z = 0.06;
    wardrobe.add(sunhat);
    parts.hats = [bowler, sunhat];
    parts.hatShelf = (kind, visible) => {
      if (kind === null) {
        bowler.visible = true;
        sunhat.visible = true;
      } else if (kind === "bowler") bowler.visible = visible;
      else if (kind === "sunhat") sunhat.visible = visible;
    };
    wardrobe.position.set(cx, 0, cz);
    group.add(wardrobe);
    group.add(contactShadow(textures, cx + 0.05, cz, w + 0.3, d + 0.25, 0.45));
    interactables.push({ id: "wardrobe", object: wardrobe, priority: 1 });
    parts.wardrobe = wardrobe;
  }

  // Monstera in a terracotta pot.
  {
    const { x, z } = fp.plant;
    const plant = new THREE.Group();
    plant.name = "plant";
    const pot = lathe([[0, 0], [0.15, 0], [0.17, 0.02], [0.21, 0.38], [0.225, 0.38], [0.225, 0.42], [0.2, 0.42], [0.19, 0.36], [0, 0.36]], mat({ color: "#bf6a42", roughness: 0.85 }), 28);
    plant.add(pot);
    plant.add(place(cyl(0.19, 0.19, 0.01, mat({ color: "#3b2a1f", roughness: 1 }), 20), 0, 0.37, 0));
    plant.add(monstera(mat, 2.2));
    plant.position.set(x, 0, z);
    group.add(plant);
    group.add(contactShadow(textures, x, z, 0.75, 0.75, 0.45, true));
    interactables.push({ id: "plant", object: plant, priority: 2 });
    parts.plant = plant;
  }

  // Radiator under the window.
  {
    const [cx, cz, w] = centre(fp.radiator);
    const radiator = new THREE.Group();
    const paint = mat({ color: "#f2efe8", roughness: 0.35 });
    const fins = 16;
    for (let i = 0; i < fins; i += 1) {
      const fin = rbox(w / fins - 0.012, 0.56, 0.08, 0.02, paint, 2);
      fin.position.set(-w / 2 + (i + 0.5) * (w / fins), 0.4, 0);
      radiator.add(fin);
    }
    radiator.add(place(cyl(0.012, 0.012, w, paint, 8), 0, 0.15, 0)).rotation.z = Math.PI / 2;
    radiator.position.set(cx, 0, cz + 0.02);
    group.add(radiator);
  }

  // Floor lamp: brass pole, linen drum shade, warm light at night.
  {
    const { x, z } = fp.floorLamp;
    const lamp = new THREE.Group();
    lamp.name = "floorLamp";
    lamp.add(place(cyl(0.15, 0.16, 0.025, brass, 24), 0, 0.0125, 0));
    lamp.add(place(cyl(0.011, 0.011, 1.5, brass, 10), 0, 0.77, 0));
    const shadeMat = new THREE.MeshStandardMaterial({ color: "#f1e2c4", roughness: 0.9, side: THREE.DoubleSide, emissive: "#ffb766", emissiveIntensity: 0 });
    const lampShade = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.3, 28, 1, true), shadeMat), false, true);
    lampShade.position.y = 1.5;
    lamp.add(lampShade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ color: "#fff0d0" }));
    bulb.position.y = 1.45;
    bulb.visible = false;
    lamp.add(bulb);
    const light = new THREE.PointLight("#ffbf73", 0, 7, 1.7);
    light.position.y = 1.42;
    lamp.add(light);
    lamp.position.set(x, 0, z);
    group.add(lamp);
    group.add(contactShadow(textures, x, z, 0.45, 0.45, 0.4, true));
    interactables.push({ id: "floorLamp", object: lamp, priority: 2, pad: 30 });
    let override = null;
    let isNight = false;
    const apply = () => {
      const on = override ?? isNight;
      light.intensity = on ? 9 : 0;
      shadeMat.emissiveIntensity = on ? 0.9 : 0;
      bulb.visible = on;
    };
    lampSetters.push((on) => {
      isNight = on;
      apply();
    });
    parts.floorLamp = {
      toggle() {
        override = !(override ?? isNight);
        apply();
        return override;
      },
      reset() {
        override = null;
        apply();
      },
    };
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

// Monstera: split, heart-shaped leaves on long stems, merged into two draw calls.
function monstera(mat, height) {
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.17, 0.02, 0.2, 0.2, 0.0, 0.34);
  leafShape.bezierCurveTo(-0.2, 0.2, -0.17, 0.02, 0, 0);
  const slits = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const y = 0.08 + i * 0.08;
      const hole = new THREE.Path();
      hole.moveTo(side * 0.06, y);
      hole.lineTo(side * 0.17, y + 0.02);
      hole.lineTo(side * 0.17, y + 0.035);
      hole.lineTo(side * 0.06, y + 0.012);
      hole.closePath();
      slits.push(hole);
    }
  }
  leafShape.holes.push(...slits);
  const leafBase = new THREE.ShapeGeometry(leafShape, 6);
  const leafGeos = [];
  const stemGeos = [];
  let seed = 3;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const count = 16;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.4;
    const lean = 0.35 + rand() * 0.55;
    const len = 0.4 + rand() * (height * 0.34);
    const tip = new THREE.Vector3(Math.sin(angle) * Math.sin(lean) * len, Math.cos(lean) * len, Math.cos(angle) * Math.sin(lean) * len * 0.75);
    const stem = new THREE.CylinderGeometry(0.006, 0.009, tip.length(), 5);
    stem.translate(0, tip.length() / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().normalize());
    stem.applyQuaternion(q);
    stem.translate(0, 0.38, 0);
    stemGeos.push(stem);
    // Leaf: bend along its length, droop outward, scale.
    const leaf = leafBase.clone();
    const pos = leaf.attributes.position;
    for (let k = 0; k < pos.count; k += 1) {
      const ly = pos.getY(k);
      const lx = pos.getX(k);
      pos.setZ(k, -ly * ly * 0.9 - lx * lx * 1.4);
    }
    const s = 1.35 + rand() * 0.9;
    leaf.scale(s, s, s);
    leaf.rotateX(-Math.PI / 2 + 0.75 + rand() * 0.55);
    leaf.rotateY(angle + Math.PI);
    leaf.translate(tip.x, tip.y + 0.38, tip.z);
    leaf.computeVertexNormals();
    leafGeos.push(leaf.toNonIndexed());
  }
  const out = new THREE.Group();
  const leafMat = mat({ color: "#2f6b3a", roughness: 0.55, side: THREE.DoubleSide });
  const leaves = shade(new THREE.Mesh(mergeGeometries(leafGeos.map((g) => { g.deleteAttribute("uv"); return g; })), leafMat));
  const stems = shade(new THREE.Mesh(mergeGeometries(stemGeos.map((g) => { g.deleteAttribute("uv"); return g.index ? g.toNonIndexed() : g; })), mat({ color: "#3f7a3f", roughness: 0.6 })));
  out.add(leaves, stems);
  return out;
}
