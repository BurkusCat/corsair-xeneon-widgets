// Mervin: body + rig, placed in the room. Position and facing are set by the brain.

import * as THREE from "three";
import { buildBody } from "./body.js";
import { createRig } from "./rig.js";

export function createMervin(data) {
  const body = buildBody(data);
  const rig = createRig(body);
  const root = new THREE.Group();
  root.name = "mervinRoot";
  root.add(body.root);
  rig.update(0, null);

  return {
    root,
    body,
    rig,
    get position() {
      return root.position;
    },
    get facing() {
      return root.rotation.y;
    },
    set facing(value) {
      root.rotation.y = value;
    },
    update(dt) {
      root.updateMatrixWorld();
      rig.update(dt, root);
    },
    // World-space head position (for bubbles and the camera).
    headWorld(out = new THREE.Vector3()) {
      return body.bones.head.getWorldPosition(out).add(new THREE.Vector3(0, 0.12, 0));
    },
  };
}
