#!/usr/bin/env node
// Claude Code status line command that also feeds the bridge.
//
// ~/.claude/settings.json:
//   "statusLine": { "type": "command", "command": "node C:/path/to/statusline.mjs", "refreshInterval": 30 }
//
// Prints a compact line ("Opus 5.5 · ctx 31% · 5h 64% 1h52m · 7d 41%"). To keep an existing
// status line, wrap it instead: node statusline.mjs --wrap "<your command>"
// The forward to the bridge is fire-and-forget: if the bridge is down, nothing changes.

import { spawn } from "node:child_process";
import { DEFAULT_PORT } from "./lib/config.mjs";
import { shortModelName } from "./lib/context.mjs";

const port = Number(process.env.CLAUDE_CONTROL_PORT || DEFAULT_PORT);

const input = await readStdin();
const forward = fetch(`http://127.0.0.1:${port}/ingest/statusline`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: input,
  signal: AbortSignal.timeout(400),
}).catch(() => {});

const wrapIndex = process.argv.indexOf("--wrap");
if (wrapIndex !== -1 && process.argv[wrapIndex + 1]) {
  process.stdout.write(await runWrapped(process.argv[wrapIndex + 1], input));
} else {
  process.stdout.write(formatLine(input));
}
await forward;

function formatLine(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return "";
  }
  const parts = [shortModelName(data.model?.id) ?? data.model?.display_name];
  const ctx = data.context_window?.used_percentage;
  if (Number.isFinite(ctx)) parts.push(`ctx ${Math.round(ctx)}%`);
  for (const [key, label] of [["five_hour", "5h"], ["seven_day", "7d"]]) {
    const w = data.rate_limits?.[key];
    if (!Number.isFinite(w?.used_percentage)) continue;
    const left = Number.isFinite(w.resets_at) ? ` ${duration(w.resets_at * 1000 - Date.now())}` : "";
    parts.push(`${label} ${Math.round(w.used_percentage)}%${key === "five_hour" ? left : ""}`);
  }
  return parts.filter(Boolean).join(" · ");
}

function duration(ms) {
  if (!(ms > 0)) return "";
  const minutes = Math.round(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}

function runWrapped(command, stdin) {
  return new Promise((resolve) => {
    // The wrapped command is the user's own status line command, run the way Claude Code
    // would have run it.
    const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("close", () => resolve(out));
    child.on("error", () => resolve(""));
    child.stdin.end(stdin);
  });
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}
