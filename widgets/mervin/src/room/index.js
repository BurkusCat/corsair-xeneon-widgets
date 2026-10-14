// Builds the whole studio: the shell, furniture, kitchen, decor and the moving bits.

import * as THREE from "three";
import * as T from "../render/textures.js";
import { buildDecor } from "./decor.js";
import { buildFurniture } from "./furniture.js";
import { buildKitchen } from "./kitchen.js";
import { buildShell } from "./shell.js";

export function buildRoom(ctx) {
  const group = new THREE.Group();
  group.name = "room";
  const textures = { rug: T.rug(), blob: T.blobShadow(), boxShadow: T.boxShadow() };
  const shell = buildShell(ctx);
  const furniture = buildFurniture(ctx, textures);
  const kitchen = buildKitchen(ctx, textures);
  const decor = buildDecor(ctx, textures);
  const sections = [shell, furniture, kitchen, decor];
  for (const section of sections) group.add(section.group);

  const interactables = [
    ...furniture.interactables,
    ...kitchen.interactables,
    ...decor.interactables,
    { id: "window", object: shell.window.group, priority: 0 },
    { id: "door", object: shell.door.hinge, priority: 1 },
  ];
  const lampSetters = [...furniture.lampSetters, ...kitchen.lampSetters, ...decor.lampSetters];
  const parts = { ...furniture.parts, ...kitchen.parts, ...decor.parts, door: shell.door, window: shell.window };

  return {
    group,
    shell,
    parts,
    textures,
    interactables,
    setLamps(on, sky) {
      for (const set of lampSetters) set(on, sky);
    },
    update(dt, state) {
      for (const section of sections) section.update(dt, state);
    },
  };
}
