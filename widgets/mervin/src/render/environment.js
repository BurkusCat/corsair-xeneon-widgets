// A reflection map of the room itself, for the shiny things (brass, chrome, the mirror,
// gold chain, glass, eyes). Captured from the middle of the room with PMREM and refreshed
// when the light changes (time of day, lamps). Matte materials don't get it: the room's
// own lights already do their job.

import * as THREE from "three";

export function createEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const position = new THREE.Vector3(0, 1.3, 2.4);
  let target = null;
  let lastKey = "";
  const hidden = new Set();

  function isShiny(material) {
    if (material.userData.envMap === false) return false;
    if (material.userData.envMap === true) return true;
    return (material.metalness ?? 0) >= 0.5 || (material.roughness ?? 1) <= 0.15;
  }

  function capture() {
    for (const object of hidden) object.visible = false;
    const next = pmrem.fromScene(scene, 0.02, 0.05, 30, { size: 128, position });
    for (const object of hidden) object.visible = true;
    scene.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.isMeshStandardMaterial && isShiny(material)) {
          material.envMap = next.texture;
          material.needsUpdate = true;
        }
      }
    });
    target?.dispose();
    target = next;
  }

  return {
    // Things that should not appear in their own reflections (Mervin).
    hide(object) {
      hidden.add(object);
    },
    refresh(key, force = false) {
      if (!force && key === lastKey) return;
      lastKey = key;
      capture();
    },
    dispose() {
      target?.dispose();
      pmrem.dispose();
    },
  };
}
