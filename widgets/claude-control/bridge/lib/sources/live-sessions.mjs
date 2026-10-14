// Running Claude Code processes (terminal and desktop-hosted alike).
//
// Every interactive `claude` process keeps ~/.claude/sessions/<pid>.json up to date. This
// is the same registry `claude agents --json` reads (documented fields: pid, sessionId,
// cwd, name, kind, status busy|waiting|idle, waitingFor). The file format itself is
// internal, so everything is read defensively and unknown values pass through as-is.
//
// Observed values (Claude Code 2.1.295):
//   status      "busy" | "waiting" | "idle" | "shell" (TUI idle with the ! shell open)
//   waitingFor  "permission prompt" | "input needed" | "dialog open"
//   entrypoint  "cli" | "claude-desktop" | ...
//   hostSessionId  the desktop app's own id ("local_<uuid>") when hosted by the desktop app

import path from "node:path";
import { listFiles, readJsonCached } from "../json-files.mjs";

export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error.code === "EPERM";
  }
}

export function readLiveSessions(claudeDir, { isAlive = pidAlive } = {}) {
  const sessions = [];
  for (const file of listFiles(path.join(claudeDir, "sessions"), /^\d+\.json$/)) {
    const raw = readJsonCached(file);
    if (!raw || typeof raw !== "object" || typeof raw.sessionId !== "string") continue;
    const pid = Number(raw.pid);
    if (!Number.isInteger(pid) || !isAlive(pid)) continue;
    sessions.push({
      pid,
      sessionId: raw.sessionId,
      cwd: typeof raw.cwd === "string" ? raw.cwd : undefined,
      name: typeof raw.name === "string" ? raw.name : undefined,
      kind: raw.kind,
      entrypoint: raw.entrypoint,
      hostSessionId: typeof raw.hostSessionId === "string" ? raw.hostSessionId : undefined,
      status: typeof raw.status === "string" ? raw.status : "idle",
      waitingFor: typeof raw.waitingFor === "string" ? raw.waitingFor : undefined,
      startedAt: numberOrUndefined(raw.startedAt),
      statusUpdatedAt: numberOrUndefined(raw.statusUpdatedAt ?? raw.updatedAt),
    });
  }
  return sessions;
}

function numberOrUndefined(value) {
  return Number.isFinite(value) ? value : undefined;
}
