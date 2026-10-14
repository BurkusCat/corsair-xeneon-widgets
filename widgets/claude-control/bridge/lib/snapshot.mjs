// Merge every source into the single JSON document the widget renders (GET /api/state).
// Pure apart from the injected readers, so it is unit-tested with fixtures.

import path from "node:path";
import { contextWindowFor, shortModelName } from "./context.mjs";

// Most urgent first. "done" = finished a turn you have not looked at yet.
export const STATES = ["permission", "input", "failed", "done", "busy", "idle"];
const ATTENTION = new Set(["permission", "input", "failed", "done"]);
const ATTENTION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function buildSnapshot({
  live = [],
  desktop = [],
  feeds,
  usage = {},
  config,
  now = Date.now(),
  transcriptFacts = () => undefined,
  folderExists = () => true,
  meta = {},
}) {
  const recentMs = config.recentHours * 60 * 60 * 1000;
  const byDesktopId = new Map(desktop.map((d) => [d.desktopId, d]));
  const byCliId = new Map(desktop.filter((d) => d.cliSessionId).map((d) => [d.cliSessionId, d]));
  const focusedDesktopId = desktop.reduce(
    (best, d) => ((d.lastFocusedAt ?? 0) > (best?.lastFocusedAt ?? 0) ? d : best),
    undefined,
  )?.desktopId;

  const sessions = [];
  const seenDesktop = new Set();

  for (const proc of live) {
    const d = (proc.hostSessionId && byDesktopId.get(proc.hostSessionId)) || byCliId.get(proc.sessionId);
    if (d) seenDesktop.add(d.desktopId);
    sessions.push(describe({ proc, d, feeds, now, config, transcriptFacts, focusedDesktopId }));
  }
  for (const d of desktop) {
    if (seenDesktop.has(d.desktopId) || d.isArchived) continue;
    // Nothing older than the attention window can be listed; skip reading its transcript.
    if (now - (d.lastActivityAt ?? 0) > ATTENTION_RETENTION_MS) continue;
    const entry = describe({ d, feeds, now, config, transcriptFacts, focusedDesktopId });
    const age = now - (entry.lastActivityAt ?? 0);
    const keep = ATTENTION.has(entry.state) && entry.state !== "done" ? age <= ATTENTION_RETENTION_MS : age <= recentMs;
    if (keep) sessions.push(entry);
  }

  sessions.sort(compareSessions);

  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const s of sessions) counts[s.state] += 1;

  return {
    version: 1,
    generatedAt: now,
    bridge: meta,
    usage,
    counts,
    today: summariseToday(sessions, now),
    next: sessions.find((s) => ATTENTION.has(s.state))?.key ?? null,
    // Every matching session; the server trims the list it sends (config.maxSessions).
    sessions,
    quickStart: quickStartFolders(config.quickStartFolders, desktop, folderExists),
  };
}

function describe({ proc, d, feeds, now, config, transcriptFacts, focusedDesktopId }) {
  const sessionId = proc?.sessionId ?? d?.cliSessionId;
  const feed = sessionId ? feeds?.sessions.get(sessionId) : undefined;
  const cwd = proc?.cwd ?? d?.cwd ?? d?.originCwd;
  const facts = sessionId ? transcriptFacts(sessionId, [cwd, d?.originCwd]) : undefined;
  const status = deriveState({ proc, d, feed, facts, focusedDesktopId, now, unseenMs: config.unseenHours * 3_600_000 });

  const lastActivityAt = Math.max(
    d?.lastActivityAt ?? 0,
    proc?.statusUpdatedAt ?? 0,
    facts?.lastAssistantAt ?? 0,
    feed?.lastEvent?.at ?? 0,
  ) || undefined;

  const model = facts?.model ?? d?.model ?? feed?.statusline?.model;
  const statusline = feed?.statusline;

  return {
    key: d ? d.desktopId : `cli-${sessionId}`,
    sessionId,
    desktopId: d?.desktopId,
    surface: d ? "desktop" : "terminal",
    live: Boolean(proc),
    pid: proc?.pid,
    title: d?.title ?? facts?.title ?? proc?.name ?? statusline?.sessionName ?? (cwd ? path.basename(cwd) : "Session"),
    project: cwd ? path.basename(cwd) : undefined,
    cwd,
    branch: facts?.gitBranch,
    state: status.state,
    since: status.since ?? lastActivityAt,
    detail: status.detail,
    lastActivityAt,
    model,
    modelLabel: shortModelName(model),
    effort: d?.effort,
    permissionMode: d?.permissionMode,
    context: contextFor(facts, statusline, model, config),
    costUsd: statusline?.costUsd ?? facts?.costUsd,
    linesAdded: statusline?.linesAdded ?? facts?.linesAdded,
    linesRemoved: statusline?.linesRemoved ?? facts?.linesRemoved,
    openUrl: d ? `claude://code/continue?session=${encodeURIComponent(d.desktopId)}` : undefined,
  };
}

export function deriveState({ proc, d, feed, facts, focusedDesktopId, now = Date.now(), unseenMs = Infinity }) {
  const summary = d?.summary;
  const summaryText = summary?.needsAction ?? summary?.detail;

  if (proc?.status === "waiting") {
    // Hook detail only describes this wait if it arrived around when the wait began.
    const hookWait = feed?.waiting && feed.waiting.at >= (proc.statusUpdatedAt ?? 0) - 5000 ? feed.waiting : undefined;
    const permission = proc.waitingFor === "permission prompt" || hookWait?.type === "permission_prompt";
    return {
      state: permission ? "permission" : "input",
      since: proc.statusUpdatedAt,
      detail: hookWait?.message ?? capitalise(proc.waitingFor) ?? summaryText,
    };
  }
  if (proc?.status === "busy") {
    return { state: "busy", since: proc.statusUpdatedAt, detail: facts?.lastPrompt ? `› ${facts.lastPrompt}` : summary?.recentAction };
  }

  if (summary?.current && (summary.category === "blocked" || summary.category === "need_input")) {
    return { state: "input", since: d.lastActivityAt, detail: summaryText };
  }
  if ((summary?.current && summary.category === "failed") || feed?.turn?.state === "failed") {
    return { state: "failed", since: d?.lastActivityAt ?? feed?.turn?.at, detail: summaryText };
  }

  // The desktop app only records when a session was last focused, not whether you read it.
  // Its most recently focused session is assumed to be on screen, and after unseenHours a
  // finished turn counts as seen.
  const finishedAt = d ? d.lastActivityAt ?? 0 : feed?.turn?.at ?? 0;
  const unseen =
    now - finishedAt <= unseenMs &&
    (d ? d.desktopId !== focusedDesktopId && finishedAt > (d.lastFocusedAt ?? 0) : feed?.turn?.state === "done");
  const detail = summaryText ?? feed?.turn?.preview ?? (facts?.lastPrompt ? `› ${facts.lastPrompt}` : undefined);
  if (unseen) return { state: "done", since: finishedAt, detail };
  return { state: "idle", detail };
}

function contextFor(facts, statusline, model, config) {
  const useStatusline =
    statusline && Number.isFinite(statusline.contextTokens) && statusline.at >= (facts?.modifiedAt ?? 0) - 5000;
  const tokens = useStatusline ? statusline.contextTokens : facts?.contextTokens;
  if (!Number.isFinite(tokens)) return facts?.compacted ? { compacted: true } : null;
  const window = statusline?.contextWindowSize ?? contextWindowFor(model, config.contextWindows);
  if (!window) return { tokens };
  return {
    tokens,
    window,
    percent: Math.round((tokens / window) * 1000) / 10,
    source: useStatusline ? "statusline" : "transcript",
  };
}

function compareSessions(a, b) {
  const rank = STATES.indexOf(a.state) - STATES.indexOf(b.state);
  if (rank) return rank;
  if (a.state === "done" || a.state === "idle") return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0);
  // Waiting and working: whoever has been at it longest first.
  return (a.since ?? 0) - (b.since ?? 0);
}

function summariseToday(sessions, now) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today = sessions.filter((s) => (s.lastActivityAt ?? 0) >= midnight.getTime());
  const sum = (field) => today.reduce((total, s) => total + (Number.isFinite(s[field]) ? s[field] : 0), 0);
  return {
    sessions: today.length,
    linesAdded: sum("linesAdded"),
    linesRemoved: sum("linesRemoved"),
    costUsd: Math.round(sum("costUsd") * 100) / 100,
  };
}

function quickStartFolders(pinned, desktop, folderExists) {
  const folders = [];
  const seen = new Set();
  const add = (folder, pinnedFolder) => {
    if (typeof folder !== "string" || !folder) return;
    const id = folder.toLowerCase();
    if (seen.has(id) || !folderExists(folder)) return;
    seen.add(id);
    folders.push({ folder, label: path.basename(folder) || folder, pinned: pinnedFolder });
  };
  for (const folder of pinned) add(folder, true);
  const recent = desktop
    .filter((d) => !d.isArchived)
    .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
  for (const d of recent) add(d.originCwd ?? d.cwd, false);
  return folders.slice(0, 6);
}

function capitalise(text) {
  return typeof text === "string" && text ? text[0].toUpperCase() + text.slice(1) : undefined;
}
