// A perspective camera with an asymmetric frustum (lens shift) and no rotation, so the room
// always reads as a one-point perspective drawing. Framing numbers come from core/camera-math.

import { PerspectiveCamera } from "three";

export class OnePointCamera extends PerspectiveCamera {
  constructor() {
    super(50, 1, 0.05, 40);
    this.lens = null;
  }

  setLens(lens) {
    this.lens = lens;
    this.aspect = lens.width / lens.height;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    if (!this.lens) {
      super.updateProjectionMatrix();
      return;
    }
    const n = this.near;
    const { tanLeft, tanRight, tanTop, tanBottom } = this.lens;
    this.projectionMatrix.makePerspective(-tanLeft * n, tanRight * n, tanTop * n, -tanBottom * n, n, this.far, this.coordinateSystem);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
