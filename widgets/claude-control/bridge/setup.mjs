#!/usr/bin/env node
// Connect Claude Code's status line and hooks to the bridge (both optional).
//
//   node setup.mjs            show the settings this would add (changes nothing)
//   node setup.mjs --apply    merge them into ~/.claude/settings.json (backup written first)
//   node setup.mjs --remove   take them out again
//
// An existing statusLine is left alone unless --replace-statusline is given; to keep it,
// point it at `node statusline.mjs --wrap "<your command>"` by hand.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BRIDGE_DIR } from "./lib/config.mjs";

const HOOK_EVENTS = ["UserPromptSubmit", "Stop", "StopFailure", "Notification", "PermissionRequest", "SessionEnd"];
const MARKER = "claude-control/bridge/";

const settingsFile = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "settings.json");
// Forward slashes and quotes work in both Git Bash and PowerShell, which Claude Code uses
// to run commands on Windows.
const script = (name) => `node "${path.join(BRIDGE_DIR, name).replaceAll("\\", "/")}"`;
const hookCommand = { type: "command", command: script("hook.mjs"), async: true, timeout: 5 };
const statusLine = { type: "command", command: script("statusline.mjs"), refreshInterval: 30 };

const args = new Set(process.argv.slice(2));

function load() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`Cannot parse ${settingsFile}: ${error.message}`);
  }
}

function isOurs(group) {
  return group?.hooks?.some((hook) => typeof hook.command === "string" && hook.command.replaceAll("\\", "/").includes(MARKER));
}

function apply(settings) {
  const notes = [];
  settings.hooks ??= {};
  for (const event of HOOK_EVENTS) {
    const groups = (settings.hooks[event] ??= []);
    if (!groups.some(isOurs)) groups.push({ hooks: [hookCommand] });
  }
  if (!settings.statusLine || args.has("--replace-statusline")) {
    settings.statusLine = statusLine;
  } else if (!String(settings.statusLine.command ?? "").replaceAll("\\", "/").includes(MARKER)) {
    notes.push(
      "Kept your existing statusLine. To feed plan usage to the widget as well, change its command to:",
      `  ${script("statusline.mjs")} --wrap "${settings.statusLine.command}"`,
    );
  }
  return notes;
}

function remove(settings) {
  for (const event of HOOK_EVENTS) {
    const groups = settings.hooks?.[event];
    if (!groups) continue;
    settings.hooks[event] = groups.filter((group) => !isOurs(group));
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  if (String(settings.statusLine?.command ?? "").replaceAll("\\", "/").includes(MARKER)) delete settings.statusLine;
}

function write(settings) {
  if (fs.existsSync(settingsFile)) {
    const backup = `${settingsFile}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(settingsFile, backup);
    console.log(`Backup: ${backup}`);
  }
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`Updated ${settingsFile}`);
}

const settings = load();
if (args.has("--remove")) {
  remove(settings);
  write(settings);
} else if (args.has("--apply")) {
  const notes = apply(settings);
  write(settings);
  for (const line of notes) console.log(line);
  console.log("New Claude Code sessions pick this up; restart running ones to include them.");
} else {
  const additions = {};
  apply(additions);
  // Run against a copy of the real file too, to report what --apply would keep.
  const notes = apply(structuredClone(settings));
  if (notes.length) delete additions.statusLine;
  console.log(`Would add to ${settingsFile}:\n`);
  console.log(JSON.stringify(additions, null, 2));
  for (const line of notes) console.log(line);
  console.log("\nRun with --apply to write it (a backup is made first).");
}
