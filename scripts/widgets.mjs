#!/usr/bin/env node
// Build, validate or package every widget in widgets/<name>/widget/ with Corsair's icuewidget CLI.
//
//   node scripts/widgets.mjs list
//   node scripts/widgets.mjs build    [name ...]   runs widgets/<name>/build.mjs where present
//   node scripts/widgets.mjs validate [name ...]   build first, then validate
//   node scripts/widgets.mjs package  [name ...]   build first, then -> dist/<name>.icuewidget
//
// Only the widget/ sub-folder is handed to the CLI: it zips every file in the folder it is
// given, so anything else that lives next to a widget (bridges, docs, tests) stays out of
// the package. Widgets with generated files (git-ignored) make them in their build.mjs.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const widgetsDir = path.join(repoRoot, "widgets");
const distDir = path.join(repoRoot, "dist");
const cliEntry = path.join(repoRoot, "node_modules", "icuewidget-cli", "node-bin", "icuewidget.js");

function discoverWidgets() {
  if (!fs.existsSync(widgetsDir)) return [];
  return fs
    .readdirSync(widgetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      root: path.join(widgetsDir, entry.name),
      dir: path.join(widgetsDir, entry.name, "widget"),
    }))
    .filter((widget) => fs.existsSync(path.join(widget.dir, "manifest.json")));
}

function runCli(args) {
  if (!fs.existsSync(cliEntry)) {
    console.error("icuewidget-cli is not installed. Run `npm install` at the repo root first.");
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    stdio: "inherit",
    env: { ...process.env, ICUEWIDGET_NO_UPDATE_CHECK: "1" },
  });
  return result.status === 0;
}

function runBuild(widget) {
  const script = path.join(widget.root, "build.mjs");
  if (!fs.existsSync(script)) return true;
  console.log(`Building ${widget.name}...`);
  const result = spawnSync(process.execPath, [script], { stdio: "inherit", cwd: repoRoot });
  return result.status === 0;
}

// The CLI sorts zip entries and iCUE wants index.html first, so nothing at the top level of
// widget/ may sort before it (assets/, css/, data/, images/ would).
function checkZipOrder(widget) {
  const early = fs.readdirSync(widget.dir).filter((name) => !name.startsWith(".") && name < "index.html");
  if (early.length) {
    console.warn(`Warning: ${widget.name}/widget/${early.join(", ")} sorts before index.html in the package.`);
  }
}

const [command = "list", ...names] = process.argv.slice(2);
const all = discoverWidgets();
const selected = names.length ? all.filter((widget) => names.includes(widget.name)) : all;

const unknown = names.filter((name) => !all.some((widget) => widget.name === name));
if (unknown.length) {
  console.error(`Unknown widget(s): ${unknown.join(", ")}. Known: ${all.map((w) => w.name).join(", ") || "none"}`);
  process.exit(1);
}

let ok = true;
switch (command) {
  case "list":
    for (const widget of all) {
      const manifest = JSON.parse(fs.readFileSync(path.join(widget.dir, "manifest.json"), "utf8"));
      console.log(`${widget.name.padEnd(24)} ${manifest.id}  v${manifest.version}`);
    }
    break;
  case "build":
    for (const widget of selected) ok = runBuild(widget) && ok;
    break;
  case "validate":
    for (const widget of selected) {
      if (!runBuild(widget)) { ok = false; continue; }
      checkZipOrder(widget);
      ok = runCli(["validate", widget.dir]) && ok;
    }
    break;
  case "package":
    fs.mkdirSync(distDir, { recursive: true });
    for (const widget of selected) {
      if (!runBuild(widget)) { ok = false; continue; }
      checkZipOrder(widget);
      ok = runCli(["package", widget.dir, "-o", path.join(distDir, `${widget.name}.icuewidget`)]) && ok;
    }
    break;
  default:
    console.error(`Unknown command "${command}". Use list, build, validate or package.`);
    ok = false;
}

process.exit(ok ? 0 : 1);
