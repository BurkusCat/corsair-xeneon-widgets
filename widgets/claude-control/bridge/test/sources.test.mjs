import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { contextWindowFor, shortModelName } from "../lib/context.mjs";
import { findDesktopDir, readDesktopSessions } from "../lib/sources/desktop-sessions.mjs";
import { readLiveSessions } from "../lib/sources/live-sessions.mjs";
import { readPlanUsageSamples } from "../lib/sources/plan-usage.mjs";
import { findTranscript, parseTail, projectSlug } from "../lib/sources/transcripts.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claude-control-test-"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}

test("live sessions skip dead processes and malformed files", () => {
  const claudeDir = tempDir();
  writeJson(path.join(claudeDir, "sessions", "100.json"), { pid: 100, sessionId: "a", status: "waiting", waitingFor: "permission prompt" });
  writeJson(path.join(claudeDir, "sessions", "200.json"), { pid: 200, sessionId: "b", status: "busy" });
  writeJson(path.join(claudeDir, "sessions", "300.json"), "{ not json");
  writeJson(path.join(claudeDir, "sessions", "notes.json"), { pid: 400, sessionId: "c" });

  const sessions = readLiveSessions(claudeDir, { isAlive: (pid) => pid === 100 });
  assert.deepEqual(sessions.map((s) => [s.sessionId, s.status, s.waitingFor]), [["a", "waiting", "permission prompt"]]);
});

test("desktop sessions are read from every install and org folder", () => {
  const root = tempDir();
  const orgDir = path.join(root, "claude-code-sessions", "install-1", "org-1");
  writeJson(path.join(orgDir, "local_abc.json"), {
    sessionId: "local_abc",
    cliSessionId: "cli-1",
    title: "Hello",
    lastActivityAt: 5,
    postTurnSummary: { status_category: "blocked", needs_action: "approve", summarizes_uuid: "u1" },
    postTurnSummaryFor: "u1",
    lastAssistantUuid: "u1",
  });
  writeJson(path.join(orgDir, "other.json"), { sessionId: "nope" });

  assert.equal(findDesktopDir([path.join(root, "missing"), root]), root);
  const [session] = readDesktopSessions(root);
  assert.equal(session.desktopId, "local_abc");
  assert.equal(session.orgId, "org-1");
  assert.deepEqual(session.summary, { category: "blocked", detail: undefined, needsAction: "approve", recentAction: undefined, current: true });
});

test("plan usage samples map abbreviated windows and accept the version 1 format", () => {
  const root = tempDir();
  writeJson(path.join(root, "plan-usage-history.json"), {
    version: 2,
    samples: [
      { t: 20, org: "o", u: { fh: 12, sd: 40 } },
      { t: 10, org: "o", u: { fh: 3 } },
      { t: "bad" },
    ],
  });
  assert.deepEqual(readPlanUsageSamples(root), [
    { t: 10, org: "o", windows: { fiveHour: 3 } },
    { t: 20, org: "o", windows: { fiveHour: 12, sevenDay: 40 } },
  ]);

  writeJson(path.join(root, "plan-usage-history.json"), { version: 1, samples: [{ t: 1, fh: 7, sd: null }] });
  assert.deepEqual(readPlanUsageSamples(root), [{ t: 1, org: null, windows: { fiveHour: 7 } }]);
});

test("transcript tail gives context from the last main-thread assistant turn", () => {
  const lines = [
    { type: "assistant", gitBranch: "main", message: { model: "claude-opus-5-5", usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 100 } }, timestamp: "2026-10-13T10:00:00Z" },
    { type: "assistant", isSidechain: true, message: { model: "claude-haiku-5-5", usage: { input_tokens: 999999 } } },
    { type: "custom-title", customTitle: "My title" },
    { type: "last-prompt", lastPrompt: "do the thing" },
    { type: "cost-state", totalCostUSD: 1.5, totalLinesAdded: 10, totalLinesRemoved: 2 },
  ];
  const facts = parseTail(lines.map((l) => JSON.stringify(l)).join("\n"));
  assert.equal(facts.contextTokens, 103);
  assert.equal(facts.model, "claude-opus-5-5");
  assert.equal(facts.gitBranch, "main");
  assert.equal(facts.title, "My title");
  assert.equal(facts.lastPrompt, "do the thing");
  assert.equal(facts.costUsd, 1.5);
});

test("a compaction after the last assistant turn makes the old context size meaningless", () => {
  const lines = [
    { type: "assistant", message: { model: "m", usage: { input_tokens: 500000 } } },
    { type: "system", subtype: "compact_boundary" },
  ];
  const facts = parseTail(lines.map((l) => JSON.stringify(l)).join("\n"));
  assert.equal(facts.contextTokens, undefined);
  assert.equal(facts.compacted, true);
});

test("transcripts are found by project slug, then by scanning", () => {
  const claudeDir = tempDir();
  assert.equal(projectSlug("D:\\Repos\\own-goal"), "D--Repos-own-goal");
  const direct = path.join(claudeDir, "projects", "D--Repos-alpha", "s1.jsonl");
  const moved = path.join(claudeDir, "projects", "D--Repos-elsewhere", "s2.jsonl");
  writeJson(direct, "");
  writeJson(moved, "");
  assert.equal(findTranscript(claudeDir, "s1", ["D:\\Repos\\alpha"]), direct);
  assert.equal(findTranscript(claudeDir, "s2", ["D:\\Repos\\alpha"]), moved);
  assert.equal(findTranscript(claudeDir, "s3", []), undefined);
});

test("context windows: current models are 1M, older ones 200K, overrides win", () => {
  assert.equal(contextWindowFor("claude-opus-5-5"), 1_000_000);
  assert.equal(contextWindowFor("claude-fable-5-1"), 1_000_000);
  assert.equal(contextWindowFor("claude-sonnet-4-6"), 1_000_000);
  assert.equal(contextWindowFor("claude-haiku-4-5"), 200_000);
  assert.equal(contextWindowFor("claude-sonnet-4-5[1m]"), 1_000_000);
  assert.equal(contextWindowFor("claude-opus-5-5", { "claude-opus-5-5": 500_000 }), 500_000);
  assert.equal(shortModelName("claude-opus-5-5"), "Opus 5.5");
  assert.equal(shortModelName("claude-fable-5-1[1m]"), "Fable 5.1");
  assert.equal(shortModelName("claude-opus-5"), "Opus 5");
});
