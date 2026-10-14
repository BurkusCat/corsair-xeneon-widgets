// Mervin's materials. The skin is a MeshStandardMaterial extended with 3D-noise mottling
// (dark spots, fine freckles, a broad colour drift) computed from the rest-pose position, so
// there are no UV seams and the eyelids match the face. Baked AO arrives in the vertex
// colour's alpha. Material ids per vertex: 0 skin, 1 shorts, 2 mouth.

import * as THREE from "three";

const NOISE = /* glsl */ `
float mvHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float mvNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mvHash(i + vec3(0, 0, 0)), mvHash(i + vec3(1, 0, 0)), f.x),
                 mix(mvHash(i + vec3(0, 1, 0)), mvHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(mvHash(i + vec3(0, 0, 1)), mvHash(i + vec3(1, 0, 1)), f.x),
                 mix(mvHash(i + vec3(0, 1, 1)), mvHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float mvFbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * mvNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.4);
    a *= 0.5;
  }
  return s;
}
`;

export function skinMaterial({ shorts = false } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6, metalness: 0 });
  material.userData.envMap = false;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec3 aRest;
attribute vec4 aColour;
attribute float aMat;
varying vec3 vRest;
varying vec4 vColour;
varying float vMat;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vRest = aRest;
vColour = aColour;
vMat = aMat;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vRest;
varying vec4 vColour;
varying float vMat;
${NOISE}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 base = vColour.rgb;
float isShorts = step(0.5, vMat) * step(vMat, 1.5);
float isMouth = step(1.5, vMat);
// Skin: a broad drift toward violet, dark mottled spots, fine freckles, lighter flecks.
float broad = mvFbm(vRest * 5.0);
float spots = smoothstep(0.56, 0.7, mvFbm(vRest * 21.0 + 4.0));
float freckles = smoothstep(0.74, 0.8, mvNoise(vRest * 140.0));
float flecks = smoothstep(0.8, 0.86, mvNoise(vRest * 95.0 + 11.0));
vec3 skin = base * (0.9 + broad * 0.22);
skin = mix(skin, skin * vec3(0.84, 0.74, 0.94), (broad - 0.45) * 0.7);
skin = mix(skin, skin * vec3(0.55, 0.6, 0.86), spots * 0.55 + freckles * 0.4);
skin += flecks * vec3(0.04, 0.045, 0.07);
// Shorts: soft fabric weave.
float weave = mvNoise(vRest * vec3(380.0, 380.0, 380.0)) * 0.08 + mvFbm(vRest * 30.0) * 0.12;
vec3 cloth = base * (0.9 + weave);
vec3 mouth = base * (0.7 + broad * 0.2);
diffuseColor.rgb = mix(mix(skin, cloth, isShorts), mouth, isMouth);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix(mix(0.58 + spots * 0.08, 0.92, isShorts), 0.35, isMouth);`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
float bakedAo = vColour.a;
reflectedLight.indirectDiffuse *= bakedAo;
reflectedLight.directDiffuse *= mix(1.0, bakedAo, 0.45);
reflectedLight.indirectSpecular *= bakedAo;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
// A soft rim, as if light passes through the edges of his skin.
float rim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
totalEmissiveRadiance += diffuseColor.rgb * rim * 0.22 * (1.0 - isShorts) * (1.0 - isMouth);`,
      );
  };
  material.customProgramCacheKey = () => `mervin-skin-${shorts}`;
  return material;
}

// Eyes: glossy, pale grey-blue iris and a dark pupil, drawn from the local position so the
// iris always faces the eye's +z.
export function eyeMaterial() {
  const material = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  material.userData.envMap = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vEyeLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEyeLocal = normalize(position);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vEyeLocal;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float c = vEyeLocal.z;
vec3 sclera = vec3(0.9, 0.89, 0.84) * (0.86 + 0.14 * smoothstep(0.0, 0.8, c));
float a = atan(vEyeLocal.y, vEyeLocal.x);
vec3 iris = vec3(0.56, 0.62, 0.68) * (0.85 + 0.15 * sin(a * 23.0)) * (0.75 + 0.35 * smoothstep(0.86, 0.97, c));
vec3 col = mix(sclera, iris, smoothstep(0.835, 0.85, c));
col = mix(col, vec3(0.03, 0.03, 0.05), smoothstep(0.94, 0.95, c));
diffuseColor.rgb = col;`,
      );
  };
  material.customProgramCacheKey = () => "mervin-eye";
  return material;
}

export function goldMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#f0c050", roughness: 0.22, metalness: 1, envMapIntensity: 1.3 });
  material.userData.envMap = true;
  return material;
}

export function teethMaterial() {
  return new THREE.MeshStandardMaterial({ color: "#efe8d4", roughness: 0.35 });
}
