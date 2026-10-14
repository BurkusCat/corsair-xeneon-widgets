#!/usr/bin/env node
// Claude Control bridge: a local HTTP server the XENEON EDGE widget polls.
//
//   node server.mjs           serve on http://localhost:47821 (127.0.0.1 only)
//   node server.mjs --print   print one snapshot as JSON and exit
//
// See ../CLAUDE.md for the data sources and the API contract.

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ActionError, NEEDS_INPUT_URL, continueUrl, focusProcessWindow, newSessionUrl, openDeepLink } from "./lib/actions.mjs";
import { BRIDGE_DIR, BRIDGE_VERSION, WIDGET_DIR, loadConfig } from "./lib/config.mjs";
import { FeedStore } from "./lib/feeds.mjs";
import { mockSnapshot } from "./lib/mock.mjs";
import { buildSnapshot } from "./lib/snapshot.mjs";
import { findDesktopDir, readDesktopSessions } from "./lib/sources/desktop-sessions.mjs";
import { readLiveSessions } from "./lib/sources/live-sessions.mjs";
import { readPlanUsageSamples } from "./lib/sources/plan-usage.mjs";
import { findTranscript, readTranscriptFacts } from "./lib/sources/transcripts.mjs";
import { buildUsage } from "./lib/usage.mjs";

const SNAPSHOT_TTL_MS = 750;
const MAX_BODY_BYTES = 256 * 1024;
const PREVIEW_DIR = path.join(BRIDGE_DIR, "preview");

export function createBridge(config, { now = () => Date.now() } = {}) {
  const feeds = new FeedStore({ dataDir: config.dataDir, now });
  const startedAt = now();
  let cached;

  function snapshot() {
    const t = now();
    if (cached && t - cached.generatedAt < SNAPSHOT_TTL_MS) return cached;
    const desktopDir = findDesktopDir(config.desktopDirs);
    const warnings = [];
    if (!desktopDir) warnings.push("Claude desktop app data not found; showing terminal sessions only.");
    if (!fs.existsSync(config.claudeDir)) warnings.push(`Claude Code directory not found: ${config.claudeDir}`);

    const planSamples = readPlanUsageSamples(desktopDir);
    cached = buildSnapshot({
      live: readLiveSessions(config.claudeDir),
      desktop: readDesktopSessions(desktopDir),
      feeds,
      usage: buildUsage({ rateLimits: feeds.rateLimits, feedSamples: feeds.samples, planSamples, now: t }),
      config,
      now: t,
      transcriptFacts: (sessionId, cwds) => {
        const file = findTranscript(config.claudeDir, sessionId, cwds);
        return file ? readTranscriptFacts(file) : undefined;
      },
      folderExists: (folder) => {
        try {
          return fs.statSync(folder).isDirectory();
        } catch {
          return false;
        }
      },
      meta: {
        version: BRIDGE_VERSION,
        uptimeMs: t - startedAt,
        desktopDataFound: Boolean(desktopDir),
        statuslineAt: feeds.lastStatuslineAt,
        hookAt: feeds.lastHookAt,
        warnings,
      },
    });
    return cached;
  }

  function invalidate() {
    cached = undefined;
  }

  async function openSession(key) {
    if (key.startsWith("mock-")) return { ok: true, dryRun: true };
    const session = snapshot().sessions.find((s) => s.key === key);
    if (!session) throw new ActionError(404, "No such session");
    if (session.desktopId) {
      openDeepLink(continueUrl(session.desktopId));
      return { ok: true, method: "desktop" };
    }
    if (session.live && session.pid) {
      const focused = await focusProcessWindow(session.pid);
      return { ok: focused, method: "terminal" };
    }
    throw new ActionError(409, "This session cannot be opened from here");
  }

  async function handleApi(req, res, url, body) {
    const route = `${req.method} ${url.pathname}`;
    if (route === "GET /api/state") {
      const state = url.searchParams.get("mock") === "1" ? mockSnapshot(now(), snapshot().bridge) : snapshot();
      return sendJson(res, 200, { ...state, sessions: state.sessions.slice(0, config.maxSessions) });
    }
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const open = /^\/api\/sessions\/([A-Za-z0-9_-]{1,80})\/open$/.exec(url.pathname);
    if (open) return sendJson(res, 200, await openSession(open[1]));

    switch (url.pathname) {
      case "/api/next": {
        const state = snapshot();
        if (!state.next) return sendJson(res, 200, { ok: false, reason: "Nothing is waiting for you" });
        return sendJson(res, 200, { ...(await openSession(state.next)), key: state.next });
      }
      case "/api/needs-input":
        openDeepLink(NEEDS_INPUT_URL);
        return sendJson(res, 200, { ok: true });
      case "/api/continue-last":
        openDeepLink(continueUrl("last"));
        return sendJson(res, 200, { ok: true });
      case "/api/new": {
        const { folder, prompt, dryRun } = parseJson(body);
        const link = newSessionUrl(folder, prompt);
        if (!dryRun) openDeepLink(link);
        return sendJson(res, 200, { ok: true, dryRun: Boolean(dryRun) });
      }
      default:
        return sendJson(res, 404, { error: "Not found" });
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!hostAllowed(req.headers.host, config.port)) return sendJson(res, 403, { error: "Host not allowed" });

    if (url.pathname.startsWith("/ingest/")) {
      // Status line and hook commands are plain processes. Anything carrying an Origin
      // header is a browser, and browsers do not get to write feed data.
      if (req.headers.origin !== undefined) return sendJson(res, 403, { error: "Browsers may not post feeds" });
      if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
      const data = parseJson(await readBody(req));
      const accepted =
        url.pathname === "/ingest/statusline" ? feeds.ingestStatusline(data)
        : url.pathname === "/ingest/hook" ? feeds.ingestHook(data)
        : undefined;
      if (accepted === undefined) return sendJson(res, 404, { error: "Not found" });
      if (accepted) invalidate();
      return sendJson(res, accepted ? 200 : 400, { ok: accepted });
    }

    if (url.pathname.startsWith("/api/")) {
      const origin = req.headers.origin;
      if (!originAllowed(origin, config.port)) return sendJson(res, 403, { error: "Origin not allowed" });
      setCors(res, origin);
      if (req.method === "OPTIONS") {
        if (req.headers["access-control-request-private-network"] === "true") {
          res.setHeader("Access-Control-Allow-Private-Network", "true");
        }
        res.writeHead(204).end();
        return;
      }
      if (config.token && !tokenMatches(req.headers["x-claude-control-token"], config.token)) {
        return sendJson(res, 401, { error: "Bridge token required" });
      }
      return handleApi(req, res, url, req.method === "POST" ? await readBody(req) : "");
    }

    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
    if (url.pathname === "/health") return sendJson(res, 200, { ok: true, version: BRIDGE_VERSION });
    if (url.pathname === "/") {
      res.writeHead(302, { Location: "/preview/" }).end();
      return;
    }
    if (url.pathname.startsWith("/preview/")) return serveStatic(res, PREVIEW_DIR, url.pathname.slice("/preview/".length) || "index.html");
    if (url.pathname.startsWith("/widget/")) return serveStatic(res, WIDGET_DIR, url.pathname.slice("/widget/".length) || "index.html", { injectShim: true });
    return sendJson(res, 404, { error: "Not found" });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      const status = error instanceof ActionError || error instanceof BadRequest ? error.status : 500;
      if (status === 500) console.error(`[bridge] ${req.method} ${req.url}:`, error);
      if (!res.headersSent) sendJson(res, status, { error: error.message });
      else res.end();
    });
  });

  return { server, snapshot, feeds };
}

// Requests must name this server, so a DNS-rebound hostname cannot reach it.
export function hostAllowed(host, port) {
  return host === `localhost:${port}` || host === `127.0.0.1:${port}`;
}

// iCUE loads widgets from file:// URLs, so their requests carry `Origin: null`. The preview
// pages are served by the bridge itself. Requests without an Origin are not from a browser.
export function originAllowed(origin, port) {
  return (
    origin === undefined ||
    origin === "null" ||
    origin === `http://localhost:${port}` ||
    origin === `http://127.0.0.1:${port}`
  );
}

function setCors(res, origin) {
  if (origin === undefined) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Claude-Control-Token");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
}

function tokenMatches(given, expected) {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class BadRequest extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BadRequest("Body too large", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseJson(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequest("Body is not valid JSON");
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function serveStatic(res, root, relative, { injectShim = false } = {}) {
  const file = path.resolve(root, decodeURIComponent(relative));
  if (file !== root && !file.startsWith(root + path.sep)) return sendJson(res, 403, { error: "Forbidden" });
  let body;
  try {
    body = fs.readFileSync(file);
  } catch {
    return sendJson(res, 404, { error: "Not found" });
  }
  const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  if (injectShim && path.basename(file) === "index.html") {
    // The shim stands in for iCUE (globals, settings, events) when the widget runs in a browser.
    body = Buffer.from(body.toString("utf8").replace(/<head>/i, '<head>\n  <script src="/preview/shim.js"></script>'));
  }
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

async function main() {
  const config = loadConfig();
  const bridge = createBridge(config);

  if (process.argv.includes("--print")) {
    console.log(JSON.stringify(bridge.snapshot(), null, 2));
    return;
  }

  bridge.server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${config.port} is already in use. Is the bridge already running? (curl http://localhost:${config.port}/health)`);
    } else {
      console.error(error);
    }
    process.exit(1);
  });
  bridge.server.listen(config.port, "127.0.0.1", () => {
    console.log(`Claude Control bridge ${BRIDGE_VERSION} on http://localhost:${config.port}`);
    console.log(`  preview: http://localhost:${config.port}/preview/`);
    console.log(`  claude dir: ${config.claudeDir}`);
    if (config.token) console.log("  token: required");
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
