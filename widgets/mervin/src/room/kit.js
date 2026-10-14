// Small geometry helpers for building furniture.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const geoCache = new Map();

function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

export function shade(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function rbox(w, h, d, r, material, segments = 3) {
  const radius = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const geo = cached(`rb:${w}:${h}:${d}:${radius}:${segments}`, () => new RoundedBoxGeometry(w, h, d, segments, radius));
  return shade(new THREE.Mesh(geo, material));
}

export function box(w, h, d, material) {
  return shade(new THREE.Mesh(cached(`b:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), material));
}

export function cyl(rTop, rBottom, h, material, segments = 20, open = false) {
  const geo = cached(`c:${rTop}:${rBottom}:${h}:${segments}:${open}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open));
  return shade(new THREE.Mesh(geo, material));
}

export function sphere(r, material, w = 20, h = 14) {
  return shade(new THREE.Mesh(cached(`s:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h)), material));
}

// A soft, puffy cushion: a rounded box whose faces bulge outward.
export function cushion(w, h, d, material, puff = 0.25) {
  const key = `cu:${w}:${h}:${d}:${puff}`;
  const geo = cached(key, () => {
    const g = new RoundedBoxGeometry(w, h, d, 5, Math.min(w, h, d) * 0.45);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      const nx = (v.x / (w / 2)) ** 2;
      const ny = (v.y / (h / 2)) ** 2;
      const nz = (v.z / (d / 2)) ** 2;
      // Bulge the thinnest axis most, in the middle of the face.
      const bulgeY = 1 + puff * (1 - nx) * (1 - nz);
      const bulgeX = 1 + puff * 0.3 * (1 - ny) * (1 - nz);
      const bulgeZ = 1 + puff * 0.3 * (1 - nx) * (1 - ny);
      pos.setXYZ(i, v.x * bulgeX, v.y * bulgeY, v.z * bulgeZ);
    }
    g.computeVertexNormals();
    return g;
  });
  return shade(new THREE.Mesh(geo, material));
}

export function lathe(points, material, segments = 28) {
  const key = `l:${points.map((p) => p.join(",")).join(";")}:${segments}`;
  const geo = cached(key, () => new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments));
  return shade(new THREE.Mesh(geo, material));
}

export function place(object, x, y, z, ry = 0) {
  object.position.set(x, y, z);
  object.rotation.y = ry;
  return object;
}

// Soft contact shadow on the floor under a piece of furniture.
let shadowMaterialCache = null;
export function contactShadow(textures, x, z, w, d, opacity = 0.45, round = false, y = 0.003) {
  shadowMaterialCache ??= new Map();
  const key = `${round}:${opacity}`;
  if (!shadowMaterialCache.has(key)) {
    shadowMaterialCache.set(
      key,
      new THREE.MeshBasicMaterial({
        color: "#000000",
        alphaMap: round ? textures.blob : textures.boxShadow,
        transparent: true,
        opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
  }
  const mesh = new THREE.Mesh(cached("plane1", () => new THREE.PlaneGeometry(1, 1)), shadowMaterialCache.get(key));
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(w, d, 1);
  mesh.position.set(x, y, z);
  mesh.renderOrder = 1;
  return mesh;
}
