import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { ActionError, continueUrl, newSessionUrl } from "../lib/actions.mjs";
import { FeedStore, describeTool } from "../lib/feeds.mjs";
import { buildUsage, resolveWindow } from "../lib/usage.mjs";
import { createBridge, hostAllowed, originAllowed } from "../server.mjs";

const NOW = Date.UTC(2026, 9, 13, 15, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;

test("the newest usage observation wins; reset times come from the status line", () => {
  const window = resolveWindow(
    { percent: 40, resetsAt: NOW + HOUR, at: NOW - 10 * MIN },
    { percent: 45, at: NOW - MIN },
    NOW,
  );
  assert.deepEqual(window, { percent: 45, observedAt: NOW - MIN, source: "desktop", resetsAt: NOW + HOUR });
});

test("a window that reset after the newest observation reads as 0%", () => {
  const window = resolveWindow({ percent: 80, resetsAt: NOW - MIN, at: NOW - 30 * MIN }, undefined, NOW);
  assert.equal(window.percent, 0);
  assert.equal(window.resetSinceObserved, true);
});

test("pace projects when the 5-hour limit would be hit", () => {
  const usage = buildUsage({
    rateLimits: { fiveHour: { percent: 50, resetsAt: NOW + 3 * HOUR, at: NOW } },
    feedSamples: [
      { t: NOW - 40 * MIN, fiveHour: 30 },
      { t: NOW, fiveHour: 50 },
    ],
    now: NOW,
  });
  // 20 points in 40 minutes = 30%/h; 50 points left = 100 minutes.
  assert.equal(usage.fiveHour.pace.percentPerHour, 30);
  assert.equal(usage.fiveHour.pace.limitAt, NOW + 100 * MIN);
  assert.equal(usage.fiveHour.pace.beforeReset, true);
  assert.equal(usage.sevenDay, null);
});

test("pace ignores samples from before a reset", () => {
  const usage = buildUsage({
    rateLimits: { fiveHour: { percent: 10, at: NOW } },
    feedSamples: [
      { t: NOW - 50 * MIN, fiveHour: 90 },
      { t: NOW - 30 * MIN, fiveHour: 2 },
      { t: NOW, fiveHour: 10 },
    ],
    now: NOW,
  });
  assert.equal(usage.fiveHour.pace.percentPerHour, 16);
});

test("hooks record waits and finished turns without keeping tool input", () => {
  const feeds = new FeedStore({ now: () => NOW });
  feeds.ingestHook({ session_id: "s", hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "rm -rf build", secret: "x" } });
  assert.deepEqual(feeds.sessions.get("s").waiting, { at: NOW, type: "permission_prompt", message: "Bash: rm -rf build" });
  feeds.ingestHook({ session_id: "s", hook_event_name: "Stop", last_assistant_message: "All done." });
  assert.equal(feeds.sessions.get("s").waiting, undefined);
  assert.deepEqual(feeds.sessions.get("s").turn, { state: "done", at: NOW, preview: "All done." });
  assert.equal(describeTool("Edit", { file_path: "src/a.ts", old_string: "secret" }), "Edit: src/a.ts");
  assert.equal(feeds.ingestHook({ hook_event_name: "Stop" }), false);
});

test("status line rate limits are stored with reset times in ms", () => {
  const feeds = new FeedStore({ now: () => NOW });
  feeds.ingestStatusline({
    session_id: "s",
    rate_limits: { five_hour: { used_percentage: 12.5, resets_at: NOW / 1000 + 3600 }, seven_day: { used_percentage: 40 } },
  });
  assert.deepEqual(feeds.rateLimits.fiveHour, { percent: 12.5, resetsAt: NOW + HOUR, at: NOW });
  assert.deepEqual(feeds.rateLimits.sevenDay, { percent: 40, resetsAt: undefined, at: NOW });
  assert.equal(feeds.samples.length, 1);
});

test("deep links are built only from valid ids and existing local folders", () => {
  assert.equal(continueUrl("local_abc-123"), "claude://code/continue?session=local_abc-123");
  assert.equal(continueUrl("last"), "claude://code/continue?session=last");
  assert.throws(() => continueUrl("local_x&evil=1"), ActionError);

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "claude control "));
  const url = newSessionUrl(folder, "fix the tests & push");
  assert.ok(url.startsWith("claude://code/new?folder="));
  assert.ok(!/[\s"&]{2}/.test(url) && !url.includes(" "), "no raw spaces in the URL");
  assert.equal(new URL(url).searchParams.get("folder"), folder);
  assert.equal(new URL(url).searchParams.get("q"), "fix the tests & push");
  assert.throws(() => newSessionUrl("relative\\path"), ActionError);
  assert.throws(() => newSessionUrl("\\\\server\\share"), ActionError);
  assert.throws(() => newSessionUrl(path.join(folder, "missing")), ActionError);
});

test("only this machine's names and iCUE or preview origins are accepted", () => {
  assert.equal(hostAllowed("localhost:47821", 47821), true);
  assert.equal(hostAllowed("127.0.0.1:47821", 47821), true);
  assert.equal(hostAllowed("evil.example:47821", 47821), false);
  assert.equal(originAllowed(undefined, 47821), true);
  assert.equal(originAllowed("null", 47821), true);
  assert.equal(originAllowed("http://localhost:47821", 47821), true);
  assert.equal(originAllowed("https://evil.example", 47821), false);
  assert.equal(originAllowed("http://localhost:3000", 47821), false);
});

test("the HTTP server enforces origin, host, token and ingest rules", async (t) => {
  const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-control-http-"));
  const config = {
    port: 0,
    token: "s3cret",
    claudeDir,
    desktopDirs: [],
    dataDir: undefined,
    recentHours: 24,
    maxSessions: 12,
    unseenHours: 12,
    contextWindows: {},
    quickStartFolders: [],
  };
  const { server } = createBridge(config);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const port = server.address().port;
  config.port = port;
  const base = `http://127.0.0.1:${port}`;

  const state = await fetch(`${base}/api/state`, { headers: { "X-Claude-Control-Token": "s3cret", Origin: "null" } });
  assert.equal(state.status, 200);
  assert.equal(state.headers.get("access-control-allow-origin"), "null");
  assert.deepEqual((await state.json()).sessions, []);

  assert.equal((await fetch(`${base}/api/state`, { headers: { Origin: "null" } })).status, 401);
  assert.equal((await fetch(`${base}/api/state`, { headers: { "X-Claude-Control-Token": "s3cret", Origin: "https://evil.example" } })).status, 403);

  const preflight = await fetch(`${base}/api/state`, {
    method: "OPTIONS",
    headers: { Origin: "null", "Access-Control-Request-Private-Network": "true" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");

  const ingest = (headers) =>
    fetch(`${base}/ingest/hook`, { method: "POST", headers, body: JSON.stringify({ session_id: "s", hook_event_name: "Stop" }) });
  assert.equal((await ingest({})).status, 200);
  assert.equal((await ingest({ Origin: "null" })).status, 403);

  const mockOpen = await fetch(`${base}/api/sessions/mock-permission/open`, { method: "POST", headers: { "X-Claude-Control-Token": "s3cret" } });
  assert.deepEqual(await mockOpen.json(), { ok: true, dryRun: true });

  const traversal = await fetch(`${base}/widget/..%2f..%2fbridge%2fserver.mjs`);
  assert.equal(traversal.status, 403);
});
