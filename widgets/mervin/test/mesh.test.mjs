import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const meshFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "widget", "scripts", "mesh.js");
const decode = (b64, Type) => {
  const buf = Buffer.from(b64, "base64");
  return new Type(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

test("the generated mesh decodes and its skin weights are sound", { skip: !fs.existsSync(meshFile) && "run npm run build first" }, () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(meshFile, "utf8"), ctx);
  const d = ctx.window.MERVIN_MESH;
  assert.ok(d && d.count > 5000 && d.count < 65536, `${d?.count} vertices`);
  const index = decode(d.index, d.indexType === "u16" ? Uint16Array : Uint32Array);
  assert.equal(index.length, d.triangles * 3);
  let maxIndex = 0;
  for (const i of index) maxIndex = Math.max(maxIndex, i);
  assert.ok(maxIndex < d.count);
  const weights = decode(d.skinWeight, Uint8Array);
  const bones = decode(d.skinIndex, Uint8Array);
  for (let v = 0; v < d.count; v += 1) {
    assert.equal(weights[v * 4] + weights[v * 4 + 1] + weights[v * 4 + 2] + weights[v * 4 + 3], 255);
    for (let k = 0; k < 4; k += 1) assert.ok(bones[v * 4 + k] < d.bones.length);
  }
  assert.ok(d.max[1] > 1.1 && d.max[1] < 1.3, `height ${d.max[1]}`);
  const names = new Set(d.bones.map((b) => b.name));
  for (const b of d.bones) if (b.parent) assert.ok(names.has(b.parent), b.name);
  assert.ok(d.anchors.chain.length > 20 && d.anchors.eyes.L && d.anchors.eyes.R);
});
