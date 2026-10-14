import assert from "node:assert/strict";
import { test } from "node:test";

import { FeedStore } from "../lib/feeds.mjs";
import { buildSnapshot, deriveState } from "../lib/snapshot.mjs";

const NOW = Date.UTC(2026, 9, 13, 15, 0, 0);
const MIN = 60_000;
const config = { recentHours: 24, maxSessions: 12, unseenHours: 12, contextWindows: {}, quickStartFolders: [] };

function desktop(overrides = {}) {
  return {
    desktopId: "local_aaaa",
    cliSessionId: "11111111-1111-1111-1111-111111111111",
    title: "Desktop session",
    cwd: "D:\\Repos\\alpha",
    originCwd: "D:\\Repos\\alpha",
    model: "claude-opus-5-5",
    isArchived: false,
    lastActivityAt: NOW - 5 * MIN,
    lastFocusedAt: NOW - 30 * MIN,
    ...overrides,
  };
}

function live(overrides = {}) {
  return {
    pid: 4242,
    sessionId: "11111111-1111-1111-1111-111111111111",
    cwd: "D:\\Repos\\alpha",
    status: "idle",
    statusUpdatedAt: NOW - 2 * MIN,
    ...overrides,
  };
}

test("a permission prompt outranks everything and is the next session", () => {
  const snapshot = buildSnapshot({
    live: [
      live({ status: "busy" }),
      live({ pid: 7, sessionId: "terminal-1", cwd: "D:\\Repos\\beta", status: "waiting", waitingFor: "permission prompt" }),
    ],
    desktop: [desktop()],
    config,
    now: NOW,
  });
  assert.equal(snapshot.sessions[0].state, "permission");
  assert.equal(snapshot.sessions[0].key, "cli-terminal-1");
  assert.equal(snapshot.sessions[0].surface, "terminal");
  assert.equal(snapshot.next, "cli-terminal-1");
  assert.equal(snapshot.counts.permission, 1);
  assert.equal(snapshot.counts.busy, 1);
});

test("live and desktop records for one session merge into one entry with a deep link", () => {
  const snapshot = buildSnapshot({
    live: [live({ hostSessionId: "local_aaaa", status: "busy" })],
    desktop: [desktop()],
    config,
    now: NOW,
  });
  assert.equal(snapshot.sessions.length, 1);
  const [session] = snapshot.sessions;
  assert.equal(session.key, "local_aaaa");
  assert.equal(session.live, true);
  assert.equal(session.state, "busy");
  assert.equal(session.openUrl, "claude://code/continue?session=local_aaaa");
});

test("a current 'blocked' desktop summary means input is needed, with its needs_action text", () => {
  const d = desktop({ summary: { category: "blocked", needsAction: "go-ahead to push", current: true } });
  const { state, detail } = deriveState({ d });
  assert.equal(state, "input");
  assert.equal(detail, "go-ahead to push");
});

test("a summary of an older turn never raises attention", () => {
  const d = desktop({ lastFocusedAt: NOW, summary: { category: "blocked", needsAction: "old", current: false } });
  assert.equal(deriveState({ d, now: NOW }).state, "idle");
});

test("unseen finished turns are 'done' unless on screen or older than unseenHours", () => {
  const d = desktop({ lastActivityAt: NOW - 5 * MIN, lastFocusedAt: NOW - 30 * MIN });
  assert.equal(deriveState({ d, now: NOW, unseenMs: 12 * 60 * MIN }).state, "done");
  assert.equal(deriveState({ d, now: NOW, unseenMs: 12 * 60 * MIN, focusedDesktopId: "local_aaaa" }).state, "idle");
  assert.equal(deriveState({ d, now: NOW + 13 * 60 * MIN, unseenMs: 12 * 60 * MIN }).state, "idle");
});

test("hook detail is only used for the wait it belongs to", () => {
  const proc = live({ status: "waiting", waitingFor: "input needed", statusUpdatedAt: NOW });
  const stale = { waiting: { at: NOW - 10 * MIN, type: "permission_prompt", message: "Bash: old" } };
  const fresh = { waiting: { at: NOW - 1000, type: "permission_prompt", message: "Bash: npm test" } };
  assert.deepEqual(
    [deriveState({ proc, feed: stale }).state, deriveState({ proc, feed: stale }).detail],
    ["input", "Input needed"],
  );
  assert.deepEqual(
    [deriveState({ proc, feed: fresh }).state, deriveState({ proc, feed: fresh }).detail],
    ["permission", "Bash: npm test"],
  );
});

test("archived and stale desktop sessions are left out", () => {
  const snapshot = buildSnapshot({
    desktop: [
      desktop({ desktopId: "local_archived", isArchived: true }),
      desktop({ desktopId: "local_old", lastActivityAt: NOW - 30 * 60 * MIN }),
      desktop({ desktopId: "local_recent" }),
    ],
    config,
    now: NOW,
  });
  assert.deepEqual(snapshot.sessions.map((s) => s.key), ["local_recent"]);
});

test("context comes from the transcript with a model-derived window", () => {
  const snapshot = buildSnapshot({
    live: [live({ hostSessionId: "local_aaaa" })],
    desktop: [desktop({ lastFocusedAt: NOW })],
    config,
    now: NOW,
    transcriptFacts: () => ({ contextTokens: 250_000, model: "claude-opus-5-5", modifiedAt: NOW }),
  });
  assert.deepEqual(snapshot.sessions[0].context, { tokens: 250_000, window: 1_000_000, percent: 25, source: "transcript" });
  assert.equal(snapshot.sessions[0].modelLabel, "Opus 5.5");
});

test("a fresher status line report wins for context", () => {
  let t = NOW;
  const feeds = new FeedStore({ now: () => t });
  feeds.ingestStatusline({
    session_id: "11111111-1111-1111-1111-111111111111",
    model: { id: "claude-haiku-4-5" },
    context_window: { context_window_size: 200_000, total_input_tokens: 50_000, used_percentage: 25 },
  });
  const snapshot = buildSnapshot({
    live: [live()],
    feeds,
    config,
    now: NOW,
    transcriptFacts: () => ({ contextTokens: 10_000, model: "claude-haiku-4-5", modifiedAt: NOW - MIN }),
  });
  assert.deepEqual(snapshot.sessions[0].context, { tokens: 50_000, window: 200_000, percent: 25, source: "statusline" });
});

test("quick start lists pinned folders first, then recent ones, skipping duplicates and missing folders", () => {
  const snapshot = buildSnapshot({
    desktop: [
      desktop({ desktopId: "local_1", originCwd: "D:\\Repos\\alpha", lastActivityAt: NOW - MIN }),
      desktop({ desktopId: "local_2", originCwd: "D:\\Repos\\gone", lastActivityAt: NOW - 2 * MIN }),
      desktop({ desktopId: "local_3", originCwd: "D:\\repos\\ALPHA", lastActivityAt: NOW - 3 * MIN }),
    ],
    config: { ...config, quickStartFolders: ["D:\\Repos\\pinned"] },
    now: NOW,
    folderExists: (folder) => !folder.endsWith("gone"),
  });
  assert.deepEqual(
    snapshot.quickStart.map((q) => [q.label, q.pinned]),
    [["pinned", true], ["alpha", false]],
  );
});
