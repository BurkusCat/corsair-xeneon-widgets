// Shared materials for the studio. The room is a box, so the soft darkening where walls,
// floor and ceiling meet (what ambient occlusion would give) is computed analytically in
// the shader from the distance to each plane.

import * as THREE from "three";
import { ROOM } from "../core/layout.js";

// Planes: floor, ceiling, back wall, left wall, right wall. A surface skips its own plane.
export const PLANE = { floor: 0, ceiling: 1, back: 2, left: 3, right: 4 };

export function withCornerShade(material, skip = [], { strength = 0.42, radius = 0.38 } = {}) {
  const mask = [1, 1, 1, 1, 1];
  for (const plane of skip) mask[PLANE[plane]] = 0;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShadeMask = { value: mask };
    shader.uniforms.uShadeRoom = { value: new THREE.Vector3(ROOM.halfWidth, ROOM.height, 0) };
    shader.uniforms.uShade = { value: new THREE.Vector2(strength, radius) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRoomPos;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvRoomPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vRoomPos;
uniform float uShadeMask[5];
uniform vec3 uShadeRoom;
uniform vec2 uShade;
float roomShade() {
  float d[5];
  d[0] = vRoomPos.y;
  d[1] = uShadeRoom.y - vRoomPos.y;
  d[2] = vRoomPos.z;
  d[3] = vRoomPos.x + uShadeRoom.x;
  d[4] = uShadeRoom.x - vRoomPos.x;
  float shade = 1.0;
  for (int i = 0; i < 5; i++) {
    float k = uShadeMask[i] * exp(-max(d[i], 0.0) / uShade.y);
    shade *= 1.0 - uShade.x * k;
  }
  return shade;
}`,
      )
      .replace("#include <aomap_fragment>", "#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= roomShade();\nreflectedLight.directDiffuse *= mix(1.0, roomShade(), 0.55);");
  };
  material.customProgramCacheKey = () => `corner-${mask.join("")}-${strength}-${radius}`;
  return material;
}

export function standard(options) {
  return new THREE.MeshStandardMaterial(options);
}
