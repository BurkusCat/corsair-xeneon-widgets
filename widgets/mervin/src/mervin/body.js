// Builds Mervin from the generated mesh (window.MERVIN_MESH, see tools/mesh/): the skinned
// body, his skeleton, and the rigid parts that ride on bones (eyes, eyelids, teeth, gold
// chain, bracelet). Animation lives in rig.js.

import * as THREE from "three";
import { eyeMaterial, goldMaterial, skinMaterial, teethMaterial } from "./materials.js";

function decode(base64, Type) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Type(bytes.buffer);
}

function bodyGeometry(data) {
  const q = decode(data.position, Uint16Array);
  const position = new Float32Array(q.length);
  for (let i = 0; i < q.length; i += 1) {
    const a = i % 3;
    position[i] = data.min[a] + (q[i] / 65535) * (data.max[a] - data.min[a]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geo.setAttribute("aRest", new THREE.BufferAttribute(position, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(decode(data.normal, Int8Array), 3, true));
  geo.setAttribute("aColour", new THREE.BufferAttribute(decode(data.colour, Uint8Array), 4, true));
  const mat = decode(data.material, Uint8Array);
  geo.setAttribute("aMat", new THREE.BufferAttribute(Float32Array.from(mat), 1));
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(decode(data.skinIndex, Uint8Array), 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(decode(data.skinWeight, Uint8Array), 4, true));
  geo.setIndex(new THREE.BufferAttribute(decode(data.index, data.indexType === "u16" ? Uint16Array : Uint32Array), 1));
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 0.6; // poses reach further than the rest pose
  return geo;
}

// Rigid skin-coloured geometry (eyelids) needs the same attributes as the body.
function skinAttributes(geo, restOffset, colour, ao = 0.85) {
  const pos = geo.attributes.position;
  const rest = new Float32Array(pos.count * 3);
  const col = new Uint8Array(pos.count * 4);
  for (let i = 0; i < pos.count; i += 1) {
    rest[i * 3] = pos.getX(i) + restOffset[0];
    rest[i * 3 + 1] = pos.getY(i) + restOffset[1];
    rest[i * 3 + 2] = pos.getZ(i) + restOffset[2];
    col.set([colour[0], colour[1], colour[2], Math.round(ao * 255)], i * 4);
  }
  geo.setAttribute("aRest", new THREE.BufferAttribute(rest, 3));
  geo.setAttribute("aColour", new THREE.BufferAttribute(col, 4, true));
  geo.setAttribute("aMat", new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  return geo;
}

export function buildBody(data) {
  const root = new THREE.Group();
  root.name = "mervin";

  // Skeleton: bone positions are relative to the parent; rest rotations are identity.
  const bones = {};
  const restPos = {};
  const list = data.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bones[b.name] = bone;
    restPos[b.name] = new THREE.Vector3(...b.pos);
    return bone;
  });
  for (const b of data.bones) {
    const bone = bones[b.name];
    const parentPos = b.parent ? restPos[b.parent] : new THREE.Vector3();
    bone.position.copy(restPos[b.name]).sub(parentPos);
    if (b.parent) bones[b.parent].add(bone);
  }
  const skin = skinMaterial();
  const mesh = new THREE.SkinnedMesh(bodyGeometry(data), skin);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.add(bones.root);
  // Bind with up-to-date world matrices, so the inverse bind matrices match the rest pose.
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  root.add(mesh);

  const anchors = data.anchors;
  const local = (name, p) => new THREE.Vector3(...p).sub(restPos[name]);

  // Eyes and lids ride on the head bone. Each eye has a pivot for looking around.
  const eyes = {};
  const eyeMat = eyeMaterial();
  for (const side of ["L", "R"]) {
    const { centre, radius } = anchors.eyes[side];
    const pivot = new THREE.Group();
    pivot.position.copy(local("head", centre));
    bones.head.add(pivot);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 20), eyeMat);
    pivot.add(ball);
    // Upper lid: a shell over the top of the eye that rotates down to close.
    const lidR = radius * 1.05;
    // Cap around +y; rotating the pivot about x tips it forward over the eye (closing).
    const upperGeo = skinAttributes(new THREE.SphereGeometry(lidR, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), centre, [80, 92, 210], 0.75);
    const upper = new THREE.Mesh(upperGeo, skin);
    upper.castShadow = true;
    const upperPivot = new THREE.Group();
    upperPivot.position.copy(pivot.position);
    upperPivot.add(upper);
    bones.head.add(upperPivot);
    const lowerShell = new THREE.SphereGeometry(lidR * 0.99, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.4);
    lowerShell.rotateX(Math.PI);
    const lowerGeo = skinAttributes(lowerShell, centre, [80, 92, 210], 0.75);
    const lower = new THREE.Mesh(lowerGeo, skin);
    const lowerPivot = new THREE.Group();
    lowerPivot.position.copy(pivot.position);
    lowerPivot.add(lower);
    bones.head.add(lowerPivot);
    eyes[side] = { pivot, upperPivot, lowerPivot };
  }

  // Teeth: a little row on each jaw, mostly hidden behind the lips.
  const toothMat = teethMaterial();
  const row = (count, width, height, depth) => {
    const g = new THREE.Group();
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count - 0.5;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(width / count - 0.0015, height, depth), toothMat);
      tooth.position.set(t * width, 0, -Math.abs(t) * width * 0.6);
      tooth.rotation.y = t * 1.2;
      g.add(tooth);
    }
    return g;
  };
  const upperTeeth = row(8, anchors.teeth.width, 0.012, 0.008);
  upperTeeth.position.copy(local("head", anchors.teeth.upper));
  bones.head.add(upperTeeth);
  const lowerTeeth = row(8, anchors.teeth.width * 0.92, 0.011, 0.008);
  lowerTeeth.position.copy(local("jaw", anchors.teeth.lower));
  bones.jaw.add(lowerTeeth);

  // Gold chain: links instanced along a closed curve on the chest bone.
  const gold = goldMaterial();
  const curve = new THREE.CatmullRomCurve3(anchors.chain.map((p) => local("chest", p)), true, "centripetal");
  const linkLength = 0.0105;
  const links = Math.round(curve.getLength() / linkLength);
  const linkGeo = new THREE.TorusGeometry(0.0055, 0.0017, 6, 12);
  linkGeo.scale(1.25, 1, 1);
  const chain = new THREE.InstancedMesh(linkGeo, gold, links);
  chain.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const twist = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < links; i += 1) {
    const t = i / links;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    q.setFromUnitVectors(xAxis, tangent);
    twist.setFromAxisAngle(xAxis, i % 2 ? Math.PI / 2 : 0);
    q.multiply(twist);
    m.compose(p, q, new THREE.Vector3(1, 1, 1));
    chain.setMatrixAt(i, m);
  }
  chain.instanceMatrix.needsUpdate = true;
  bones.chest.add(chain);
  // A pendant: a little gold "6".
  const pendant = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, 8, 20), gold);
  const low = anchors.chain.reduce((a, b) => (b[1] < a[1] ? b : a));
  pendant.position.copy(local("chest", low)).add(new THREE.Vector3(0, -0.014, 0.004));
  pendant.castShadow = true;
  bones.chest.add(pendant);

  // Bracelet on the left wrist.
  const br = anchors.bracelet;
  const bracelet = new THREE.Mesh(new THREE.TorusGeometry(br.radius, 0.0042, 8, 32), gold);
  bracelet.position.copy(local(br.bone, br.centre));
  bracelet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...br.axis));
  bracelet.castShadow = true;
  bones[br.bone].add(bracelet);

  // Grip points for props, as children of the hand bones.
  const grips = {};
  for (const side of ["L", "R"]) {
    const grip = new THREE.Group();
    grip.position.copy(local(`hand${side}`, anchors.grip[side]));
    bones[`hand${side}`].add(grip);
    grips[side] = grip;
  }

  return { root, mesh, bones, restPos, eyes, grips, skin, anchors };
}
