import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const widgetDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "widget");

test("nothing at the top of widget/ sorts before index.html (iCUE wants it first in the zip)", () => {
  const early = fs.readdirSync(widgetDir).filter((n) => !n.startsWith(".") && n < "index.html");
  assert.deepEqual(early, []);
});

test("index.html's <head> is plain XML: self-closed void tags, no inline script except the groups JSON", () => {
  const html = fs.readFileSync(path.join(widgetDir, "index.html"), "utf8");
  const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1];
  for (const tag of head.match(/<(meta|link)\b[^>]*>/g)) assert.match(tag, /\/>$/, tag);
  const scripts = head.match(/<script\b[^>]*>/g) ?? [];
  assert.deepEqual(scripts, ['<script type="application/json" id="x-icue-groups">']);
  JSON.parse(/<script type="application\/json" id="x-icue-groups">([\s\S]*?)<\/script>/.exec(head)[1]);
});

test("every tr() string has a translation", () => {
  const html = fs.readFileSync(path.join(widgetDir, "index.html"), "utf8");
  const strings = [...html.matchAll(/tr\('([^']+)'\)/g)].map((m) => m[1]);
  const translations = JSON.parse(fs.readFileSync(path.join(widgetDir, "translation.json"), "utf8")).en.translation;
  for (const s of strings) assert.ok(translations[s], `missing translation: ${s}`);
});

test("the manifest is interactive, dashboard-only and asks for no network", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(widgetDir, "manifest.json"), "utf8"));
  assert.equal(manifest.interactive, true);
  assert.deepEqual(manifest.supported_devices, [{ type: "dashboard_lcd" }]);
  assert.equal(manifest.permissions, undefined);
  assert.match(manifest.id, /^[a-z0-9.-]+$/);
});
