// Things with character: the teak sideboard with a record player and a goldfish, the
// Planet 6 painting, a wall clock showing the real time, a lava lamp, the ceiling pendant,
// a shelf of books and a hand-lettered sign.

import * as THREE from "three";
import { DOOR, FURNITURE } from "../core/layout.js";
import * as T from "../render/textures.js";
import { box, contactShadow, cyl, lathe, place, rbox, shade, sphere } from "./kit.js";
import { standard, withCornerShade } from "./materials.js";

const fp = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));

export function buildDecor(ctx, textures) {
  const group = new THREE.Group();
  group.name = "decor";
  const interactables = [];
  const updaters = [];
  const lampSetters = [];
  const parts = {};
  const shadeOpts = { strength: 0.22, radius: 0.35 };
  const mat = (o) => withCornerShade(standard(o), [], shadeOpts);
  const teak = mat({ map: T.woodGrain("#8d5b37", { seed: 63 }), roughness: 0.48 });
  const brass = standard({ color: "#d6ad55", roughness: 0.28, metalness: 1 });
  const black = mat({ color: "#1f1d1c", roughness: 0.5 });

  // Sideboard: teak, slatted doors, splayed legs.
  const sb = fp.sideboard;
  const sbW = sb.x1 - sb.x0;
  const sbD = sb.z1 - sb.z0;
  const sbTop = 0.78;
  {
    const sideboard = new THREE.Group();
    sideboard.name = "sideboard";
    sideboard.add(place(rbox(sbW, 0.6, sbD, 0.02, teak), 0, 0.18 + 0.3, 0));
    const slat = mat({ map: T.woodGrain("#7a4c2c", { seed: 64 }), roughness: 0.5 });
    for (let i = 0; i < 3; i += 1) {
      const door = new THREE.Group();
      const dw = sbW / 3 - 0.03;
      for (let k = 0; k < 9; k += 1) door.add(place(box(dw / 9 - 0.006, 0.5, 0.012, slat), -dw / 2 + (k + 0.5) * (dw / 9), 0, 0));
      door.position.set(-sbW / 2 + (i + 0.5) * (sbW / 3), 0.48, sbD / 2 + 0.006);
      sideboard.add(door);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = cyl(0.018, 0.012, 0.19, teak, 8);
        leg.position.set(sx * (sbW / 2 - 0.08), 0.09, sz * (sbD / 2 - 0.08));
        leg.rotation.set(sz * -0.12, 0, sx * 0.12);
        sideboard.add(leg);
      }
    }
    sideboard.position.set((sb.x0 + sb.x1) / 2, 0, (sb.z0 + sb.z1) / 2);
    group.add(sideboard);
    group.add(contactShadow(textures, (sb.x0 + sb.x1) / 2, (sb.z0 + sb.z1) / 2, sbW + 0.25, sbD + 0.25, 0.4));
    interactables.push({ id: "sideboard", object: sideboard, priority: 1 });
  }

  // Record player with a spinning record and a tonearm that swings over when playing.
  {
    const rp = new THREE.Group();
    rp.name = "recordPlayer";
    rp.add(place(rbox(0.46, 0.09, 0.36, 0.015, teak), 0, 0.045, 0));
    rp.add(place(cyl(0.155, 0.155, 0.012, mat({ color: "#2a2a2c", roughness: 0.4, metalness: 0.5 }), 40), -0.06, 0.096, 0));
    const recordGroup = new THREE.Group();
    recordGroup.position.set(-0.06, 0.104, 0);
    const label = document.createElement("canvas");
    label.width = label.height = 256;
    const lc = label.getContext("2d");
    lc.fillStyle = "#121212";
    lc.fillRect(0, 0, 256, 256);
    for (let r = 120; r > 40; r -= 3) {
      lc.strokeStyle = r % 2 ? "#1d1d1f" : "#0d0d0e";
      lc.beginPath();
      lc.arc(128, 128, r, 0, Math.PI * 2);
      lc.stroke();
    }
    lc.fillStyle = "#f08a24";
    lc.beginPath();
    lc.arc(128, 128, 38, 0, Math.PI * 2);
    lc.fill();
    lc.fillStyle = "#fff3e0";
    lc.font = "bold 15px Georgia";
    lc.textAlign = "center";
    lc.fillText("PLANET 6", 128, 124);
    lc.font = "11px Georgia";
    lc.fillText("greatest hums", 128, 140);
    const labelTex = new THREE.CanvasTexture(label);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    const record = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.004, 48), [
      standard({ color: "#121212", roughness: 0.3 }),
      standard({ map: labelTex, roughness: 0.25 }),
      standard({ color: "#121212", roughness: 0.3 }),
    ]);
    record.castShadow = true;
    recordGroup.add(record);
    rp.add(recordGroup);
    const armPivot = new THREE.Group();
    armPivot.position.set(0.16, 0.12, -0.12);
    armPivot.add(place(cyl(0.02, 0.02, 0.04, brass, 12), 0, -0.01, 0));
    const arm = cyl(0.005, 0.005, 0.24, brass, 6);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, 0.012, 0.12);
    armPivot.add(arm);
    armPivot.add(place(box(0.02, 0.012, 0.04, black), 0, 0.008, 0.24));
    rp.add(armPivot);
    const lid = rbox(0.46, 0.08, 0.36, 0.01, standard({ color: "#d9e6ea", roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }));
    lid.castShadow = false;
    const lidHinge = new THREE.Group();
    lidHinge.position.set(0, 0.09, -0.18);
    lid.position.set(0, 0.04, 0.18);
    lidHinge.add(lid);
    lidHinge.rotation.x = -1.25;
    rp.add(lidHinge);
    rp.position.set(sb.x0 + 0.38, sbTop, (sb.z0 + sb.z1) / 2 + 0.02);
    group.add(rp);
    interactables.push({ id: "recordPlayer", object: rp, priority: 3, pad: 30 });
    let playing = false;
    let armAngle = 0;
    parts.recordPlayer = {
      object: rp,
      setPlaying(on) {
        playing = on;
      },
      get playing() {
        return playing;
      },
    };
    updaters.push((dt) => {
      if (playing) recordGroup.rotation.y -= dt * 3.49;
      armAngle += ((playing ? -0.42 : 0) - armAngle) * Math.min(1, dt * 2);
      armPivot.rotation.y = armAngle;
    });
  }

  // Goldfish bowl with a goldfish doing laps.
  {
    const bowl = new THREE.Group();
    bowl.name = "goldfish";
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 28, 18, 0, Math.PI * 2, 0.55, Math.PI - 0.55),
      standard({ color: "#e6f4ff", roughness: 0.05, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    glass.position.y = 0.12;
    bowl.add(glass);
    const water = new THREE.Mesh(
      new THREE.SphereGeometry(0.122, 24, 14, 0, Math.PI * 2, 1.0, Math.PI - 1.0),
      standard({ color: "#7cc6e8", roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    water.position.y = 0.12;
    bowl.add(water);
    bowl.add(place(cyl(0.07, 0.04, 0.02, mat({ color: "#d9c7a0", roughness: 1 }), 16), 0, 0.012, 0));
    const fishMat = standard({ color: "#ff8a1f", roughness: 0.4, emissive: "#7a2a00", emissiveIntensity: 0.2 });
    const fish = new THREE.Group();
    const fishBody = sphere(0.026, fishMat, 12, 8);
    fishBody.scale.set(1, 0.75, 0.5);
    fish.add(fishBody);
    const tail = shade(new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.03, 3), fishMat));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.035;
    fish.add(tail);
    const fishHolder = new THREE.Group();
    fishHolder.position.y = 0.1;
    fish.position.set(0, 0, 0.06);
    fish.rotation.y = Math.PI;
    fishHolder.add(fish);
    bowl.add(fishHolder);
    bowl.position.set(sb.x1 - 0.25, sbTop, (sb.z0 + sb.z1) / 2);
    group.add(bowl);
    interactables.push({ id: "goldfish", object: bowl, priority: 3, pad: 40 });
    let t = 0;
    let fed = 0;
    parts.goldfish = {
      object: bowl,
      feed() {
        fed = 6;
      },
    };
    updaters.push((dt) => {
      t += dt;
      fed = Math.max(0, fed - dt);
      const speed = fed > 0 ? 1.6 : 0.55;
      fishHolder.rotation.y += dt * speed;
      fish.position.y = Math.sin(t * 0.9) * 0.02 + (fed > 0 ? 0.03 : 0);
      tail.rotation.y = Math.sin(t * (fed > 0 ? 20 : 9)) * 0.5;
    });
  }

  // The Planet 6 painting above the sideboard.
  {
    const painting = new THREE.Group();
    painting.name = "painting";
    const frameMat = mat({ color: "#b8893e", roughness: 0.35, metalness: 0.5 });
    painting.add(rbox(0.84, 0.64, 0.04, 0.012, frameMat));
    const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.54), standard({ map: T.planetPainting(), roughness: 0.7 }));
    canvasMesh.position.z = 0.021;
    painting.add(canvasMesh);
    painting.position.set((sb.x0 + sb.x1) / 2 + 0.05, 1.58, 0.025);
    group.add(painting);
    interactables.push({ id: "painting", object: painting, priority: 2 });
  }

  // Wall clock above the door, showing the room's time.
  {
    const clock = new THREE.Group();
    clock.name = "clock";
    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = faceCanvas.height = 256;
    const fc = faceCanvas.getContext("2d");
    fc.fillStyle = "#fbf6ea";
    fc.fillRect(0, 0, 256, 256);
    fc.fillStyle = "#2c2a28";
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      fc.save();
      fc.translate(128, 128);
      fc.rotate(a);
      fc.fillRect(-3, -112, 6, i % 3 ? 14 : 24);
      fc.restore();
    }
    fc.font = "bold 22px Georgia";
    fc.textAlign = "center";
    fc.fillText("6", 128, 200);
    const faceTex = new THREE.CanvasTexture(faceCanvas);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    const rim = shade(new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.018, 10, 40), mat({ color: "#2f6e8a", roughness: 0.35 })));
    clock.add(rim);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 40), standard({ map: faceTex, roughness: 0.6 }));
    face.position.z = -0.005;
    clock.add(face);
    const handMat = standard({ color: "#2c2a28", roughness: 0.5 });
    const hand = (len, width, z) => {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(width, len, 0.004), handMat);
      m.position.y = len / 2 - 0.015;
      pivot.add(m);
      pivot.position.z = z;
      clock.add(pivot);
      return pivot;
    };
    const hourHand = hand(0.08, 0.012, 0.004);
    const minuteHand = hand(0.12, 0.008, 0.008);
    const secondHand = hand(0.13, 0.003, 0.012);
    secondHand.children[0].material = standard({ color: "#d9473b" });
    clock.position.set((DOOR.x0 + DOOR.x1) / 2, 2.3, 0.03);
    group.add(clock);
    interactables.push({ id: "clock", object: clock, priority: 3, pad: 30 });
    updaters.push((dt, state) => {
      const d = state.date;
      if (!d) return;
      const s = d.getSeconds() + d.getMilliseconds() / 1000;
      const m = d.getMinutes() + s / 60;
      const h = (d.getHours() % 12) + m / 60;
      secondHand.rotation.z = -(s / 60) * Math.PI * 2;
      minuteHand.rotation.z = -(m / 60) * Math.PI * 2;
      hourHand.rotation.z = -(h / 12) * Math.PI * 2;
    });
  }

  // Lava lamp on the bedside table.
  {
    const bs = fp.bedside;
    const lamp = new THREE.Group();
    lamp.name = "lavaLamp";
    const chrome = standard({ color: "#c9ccd6", roughness: 0.15, metalness: 1 });
    lamp.add(lathe([[0, 0], [0.06, 0], [0.04, 0.09], [0.03, 0.1], [0, 0.1]], chrome, 20));
    const lavaUniforms = { uTime: { value: 0 }, uGlow: { value: 0.3 } };
    const lavaMat = new THREE.ShaderMaterial({
      uniforms: lavaUniforms,
      transparent: true,
      vertexShader: `varying vec3 vPos; varying vec3 vNormal; void main() { vPos = position; vNormal = normalMatrix * normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec3 vPos; varying vec3 vNormal; uniform float uTime; uniform float uGlow;
        float blob(vec3 p, vec3 c, float r) { return r * r / max(dot(p - c, p - c), 1e-4); }
        void main() {
          vec3 p = vPos;
          float f = 0.0;
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float y = 0.12 + 0.08 * sin(uTime * (0.21 + fi * 0.07) + fi * 2.1);
            f += blob(p, vec3(0.012 * sin(fi * 3.0 + uTime * 0.3), y, 0.01 * cos(fi * 2.0)), 0.018 + 0.004 * fi);
          }
          float lava = smoothstep(0.9, 1.2, f);
          vec3 liquid = mix(vec3(0.45, 0.12, 0.55), vec3(0.75, 0.3, 0.75), uGlow);
          vec3 wax = mix(vec3(0.95, 0.45, 0.15), vec3(1.0, 0.75, 0.3), uGlow);
          vec3 col = mix(liquid * (0.35 + uGlow), wax * (0.5 + uGlow * 1.2), lava);
          float rim = pow(1.0 - abs(normalize(vNormal).z), 2.0);
          col += rim * 0.15;
          gl_FragColor = vec4(col, 0.92);
          #include <colorspace_fragment>
        }`,
    });
    const glass = new THREE.Mesh(new THREE.LatheGeometry([[0.03, 0.1], [0.045, 0.16], [0.03, 0.27], [0.02, 0.29]].map(([x, y]) => new THREE.Vector2(x, y)), 24), lavaMat);
    lamp.add(glass);
    lamp.add(lathe([[0.02, 0.29], [0.022, 0.29], [0.012, 0.33], [0, 0.335]], chrome, 16));
    const glow = new THREE.PointLight("#ff7a3a", 0, 1.8, 2);
    glow.position.y = 0.2;
    lamp.add(glow);
    lamp.position.set((bs.x0 + bs.x1) / 2 - 0.08, 0.55, (bs.z0 + bs.z1) / 2 - 0.05);
    group.add(lamp);
    interactables.push({ id: "bedside", object: lamp, priority: 3, pad: 30 });
    let on = false;
    lampSetters.push((night) => {
      on = night;
    });
    parts.lavaLamp = lamp;
    updaters.push((dt) => {
      lavaUniforms.uTime.value += dt;
      lavaUniforms.uGlow.value += ((on ? 1 : 0.35) - lavaUniforms.uGlow.value) * Math.min(1, dt);
      glow.intensity = lavaUniforms.uGlow.value * 1.6;
    });
  }

  // Ceiling pendant: a dome on a cord.
  {
    const pendant = new THREE.Group();
    pendant.add(place(cyl(0.004, 0.004, 0.45, black, 6), 0, -0.225, 0));
    const domeMat = new THREE.MeshStandardMaterial({ color: "#e0784a", roughness: 0.45, side: THREE.DoubleSide, emissive: "#ffb070", emissiveIntensity: 0 });
    const dome = shade(new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat), false, false);
    dome.position.y = -0.55;
    pendant.add(dome);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: "#fff1d0" }));
    bulb.position.y = -0.58;
    pendant.add(bulb);
    pendant.add(place(cyl(0.05, 0.05, 0.02, black, 16), 0, -0.01, 0));
    pendant.position.set(-0.4, 2.6, 2.2);
    group.add(pendant);
    lampSetters.push((night) => {
      domeMat.emissiveIntensity = night ? 0.25 : 0;
      bulb.material.color.set(night ? "#fff1d0" : "#b9a88c");
    });
  }

  // Shelf of books above the bed, with a little cactus.
  {
    const shelf = new THREE.Group();
    shelf.add(place(rbox(1.0, 0.03, 0.22, 0.008, teak), 0, 0, 0));
    for (const x of [-0.42, 0.42]) shelf.add(place(box(0.02, 0.12, 0.14, mat({ color: "#2c2a28", metalness: 0.5, roughness: 0.4 })), x, -0.07, -0.03));
    let x = -0.46;
    let i = 0;
    while (x < 0.2) {
      const w = 0.025 + ((i * 37) % 11) / 300;
      const h = 0.17 + ((i * 53) % 7) / 100;
      const book = rbox(w, h, 0.16, 0.004, mat({ color: T.SPINE_COLOURS[i % T.SPINE_COLOURS.length], roughness: 0.7 }), 1);
      book.position.set(x + w / 2, 0.015 + h / 2, 0);
      if (i === 8) book.rotation.z = -0.25;
      shelf.add(book);
      x += w + 0.004;
      i += 1;
    }
    const pot = lathe([[0, 0], [0.04, 0], [0.05, 0.07], [0, 0.07]], mat({ color: "#e9e3d6", roughness: 0.5 }), 16);
    pot.position.set(0.34, 0.015, 0);
    shelf.add(pot);
    const cactus = sphere(0.035, mat({ color: "#5d8f4e", roughness: 0.7 }), 12, 10);
    cactus.scale.set(1, 1.8, 1);
    cactus.position.set(0.34, 0.14, 0);
    shelf.add(cactus);
    shelf.position.set((fp.bed.x0 + fp.bed.x1) / 2, 1.62, 0.12);
    group.add(shelf);
  }

  // Foreground dressing for the tall portrait views: slippers and a little round rug.
  {
    const fluffy = mat({ map: T.fabric("#f0b8c8", { seed: 93, weave: 2, strength: 0.25 }), roughness: 1 });
    for (const [x, z, ry] of [[0.92, 4.3, 0.2], [1.12, 4.36, -0.1]]) {
      const slipper = new THREE.Group();
      const sole = shade(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.14, 6, 12), fluffy));
      sole.rotation.x = Math.PI / 2;
      sole.scale.set(1, 1, 0.45);
      sole.position.y = 0.02;
      slipper.add(sole);
      const toe = sphere(0.048, fluffy, 14, 10);
      toe.scale.set(1, 0.7, 1.1);
      toe.position.set(0, 0.035, 0.05);
      slipper.add(toe);
      slipper.position.set(x, 0, z);
      slipper.rotation.y = ry;
      group.add(slipper);
    }
    const roundRug = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), withCornerShade(standard({ map: T.fabric("#c4553a", { seed: 94, weave: 5, strength: 0.3 }), roughness: 1 }), ["floor"], shadeOpts));
    roundRug.rotation.x = -Math.PI / 2;
    roundRug.position.set(2.7, 0.005, 4.4);
    roundRug.receiveShadow = true;
    group.add(roundRug);
  }

  // "Live Laugh Lounge", on the left wall beside the bed.
  {
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.25), standard({ map: T.sign("Live Laugh Lounge"), roughness: 0.7 }));
    signMesh.rotation.y = Math.PI / 2;
    signMesh.position.set(-4.776, 1.5, 1.45);
    group.add(signMesh);
    const board = rbox(0.02, 0.29, 0.84, 0.006, teak);
    board.position.set(-4.79, 1.5, 1.45);
    group.add(board);
  }

  return {
    group,
    interactables,
    lampSetters,
    parts,
    update(dt, state) {
      for (const u of updaters) u(dt, state);
    },
  };
}
