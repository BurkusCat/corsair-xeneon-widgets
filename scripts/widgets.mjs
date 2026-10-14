#!/usr/bin/env node
// Validate or package every widget in widgets/<name>/widget/ with Corsair's icuewidget CLI.
//
//   node scripts/widgets.mjs list
//   node scripts/widgets.mjs validate [name ...]
//   node scripts/widgets.mjs package  [name ...]   -> dist/<name>.icuewidget
//
// Only the widget/ sub-folder is handed to the CLI: it zips every file in the folder it is
// given, so anything else that lives next to a widget (bridges, docs, tests) stays out of
// the package.

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
    .map((entry) => ({ name: entry.name, dir: path.join(widgetsDir, entry.name, "widget") }))
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
  case "validate":
    for (const widget of selected) ok = runCli(["validate", widget.dir]) && ok;
    break;
  case "package":
    fs.mkdirSync(distDir, { recursive: true });
    for (const widget of selected) {
      ok = runCli(["package", widget.dir, "-o", path.join(distDir, `${widget.name}.icuewidget`)]) && ok;
    }
    break;
  default:
    console.error(`Unknown command "${command}". Use list, validate or package.`);
    ok = false;
}

process.exit(ok ? 0 : 1);
