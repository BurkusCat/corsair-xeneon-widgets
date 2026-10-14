// Claude desktop app (Code tab) session metadata.
//
// Layout (desktop 2.37337, internal and undocumented):
//   <desktopDir>/claude-code-sessions/<installId>/<orgId>/local_<uuid>.json
//
// Each file describes one Code-tab session whether or not its `claude` process is running:
//   sessionId        "local_<uuid>" (what claude://code/continue?session= expects)
//   cliSessionId     the Claude Code session id (transcript file name, live registry id)
//   title, cwd, originCwd, model, effort, permissionMode, isArchived
//   createdAt, lastActivityAt, lastFocusedAt   (epoch ms)
//   postTurnSummary  { status_category, status_detail, needs_action, recent_action, ... }
//                    written by the desktop app after each turn. The app itself treats
//                    status_category "blocked" | "need_input" | "failed" as "needs input".
//   postTurnSummaryFor / lastAssistantUuid   equal when the summary covers the latest turn

import fs from "node:fs";
import path from "node:path";
import { listDirs, listFiles, readJsonCached } from "../json-files.mjs";

const SESSIONS_DIR = "claude-code-sessions";

// Pick the candidate that actually holds session data; if several do, the freshest wins.
export function findDesktopDir(candidates) {
  let best;
  for (const dir of candidates) {
    try {
      const stat = fs.statSync(path.join(dir, SESSIONS_DIR));
      if (!best || stat.mtimeMs > best.mtimeMs) best = { dir, mtimeMs: stat.mtimeMs };
    } catch {
      // Not this one.
    }
  }
  return best?.dir;
}

export function readDesktopSessions(desktopDir) {
  if (!desktopDir) return [];
  const sessions = [];
  for (const installDir of listDirs(path.join(desktopDir, SESSIONS_DIR))) {
    for (const orgDir of listDirs(installDir)) {
      for (const file of listFiles(orgDir, /^local_[A-Za-z0-9-]+\.json$/)) {
        const raw = readJsonCached(file);
        const session = normalise(raw, path.basename(orgDir));
        if (session) sessions.push(session);
      }
    }
  }
  return sessions;
}

function normalise(raw, orgId) {
  if (!raw || typeof raw !== "object" || typeof raw.sessionId !== "string") return undefined;
  const summary = raw.postTurnSummary && typeof raw.postTurnSummary === "object" ? raw.postTurnSummary : undefined;
  return {
    desktopId: raw.sessionId,
    cliSessionId: typeof raw.cliSessionId === "string" ? raw.cliSessionId : undefined,
    orgId,
    title: typeof raw.title === "string" ? raw.title : undefined,
    cwd: typeof raw.cwd === "string" ? raw.cwd : undefined,
    originCwd: typeof raw.originCwd === "string" ? raw.originCwd : undefined,
    model: typeof raw.model === "string" ? raw.model : undefined,
    effort: typeof raw.effort === "string" ? raw.effort : undefined,
    permissionMode: typeof raw.permissionMode === "string" ? raw.permissionMode : undefined,
    isArchived: raw.isArchived === true,
    createdAt: finite(raw.createdAt),
    lastActivityAt: finite(raw.lastActivityAt),
    lastFocusedAt: finite(raw.lastFocusedAt),
    completedTurns: finite(raw.completedTurns),
    summary: summary && {
      category: str(summary.status_category),
      detail: str(summary.status_detail),
      needsAction: str(summary.needs_action),
      recentAction: str(summary.recent_action),
      // A summary of an older turn is still shown, but never as the reason for attention.
      current: !raw.lastAssistantUuid || raw.postTurnSummaryFor === raw.lastAssistantUuid,
    },
  };
}

function finite(value) {
  return Number.isFinite(value) ? value : undefined;
}

function str(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
