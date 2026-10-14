#!/usr/bin/env node
// Full-size screenshots of a widget with headless Edge, driven over the DevTools protocol.
//
//   node scripts/shot.mjs <name> [options]      -> dist/shots/<name>/<size>[-<tag>].png
//
//   --sizes XL,L,M,S     sizes to shoot (default all four)
//   --portrait           also shoot the portrait sizes (--portrait-only for just those)
//   --query "a=1&b=2"    extra query string for the page (e.g. now=21:30&seed=4&debug=1)
//   --wait 1500          ms to wait after the widget reports ready (default 1500)
//   --eval "js"          expression run in the page after the wait, before the shot
//   --frames 4 --every 500   take a numbered sequence instead of one shot
//   --each "js"          expression run before every frame; __frame is the frame number
//   --tag name           suffix for the file names
//   --preview            load http://127.0.0.1:47900/w/<name>/ (needs npm run preview) instead of file://
//   --swiftshader        software WebGL (when the GPU path is unavailable)
//   --url <url> --size WxH   shoot any page instead (e.g. a contact sheet); name is the output file stem
//
// Plain `msedge --screenshot` fires on load, before WebGL scenes have drawn. Here the page is
// given until window.__widgetReady is true (or --timeout ms), and any console error or
// uncaught exception makes the run fail.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const LANDSCAPE = { XL: [2536, 696], L: [1688, 696], M: [840, 696], S: [840, 344] };

function parseArgs(argv) {
  const opts = { sizes: Object.keys(LANDSCAPE), query: "", wait: 1500, timeout: 30000, frames: 1, every: 500, tag: "" };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--sizes") opts.sizes = next().split(",").map((s) => s.trim().toUpperCase());
    else if (arg === "--portrait") opts.portrait = true;
    else if (arg === "--portrait-only") opts.portraitOnly = true;
    else if (arg === "--query") opts.query = next().replace(/^[?&]/, "");
    else if (arg === "--wait") opts.wait = Number(next());
    else if (arg === "--timeout") opts.timeout = Number(next());
    else if (arg === "--eval") opts.evalExpr = next();
    else if (arg === "--frames") opts.frames = Number(next());
    else if (arg === "--each") opts.each = next();
    else if (arg === "--every") opts.every = Number(next());
    else if (arg === "--tag") opts.tag = next();
    else if (arg === "--out") opts.out = next();
    else if (arg === "--preview") opts.preview = true;
    else if (arg === "--swiftshader") opts.swiftshader = true;
    else if (arg === "--url") opts.url = next();
    else if (arg === "--size") opts.size = next().split("x").map(Number);
    else rest.push(arg);
  }
  opts.name = rest[0];
  return opts;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const listener of this.listeners) listener(msg);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(listener) {
    this.listeners.push(listener);
  }
}

async function launchEdge(opts) {
  const exe = EDGE_PATHS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error("Microsoft Edge not found.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "widget-shot-"));
  const args = [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    "--mute-audio",
    "--ignore-gpu-blocklist",
    ...(opts.swiftshader ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : []),
    "about:blank",
  ];
  const child = spawn(exe, args, { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i += 1) await delay(100);
  if (!fs.existsSync(portFile)) throw new Error("Edge did not start a DevTools endpoint.");
  await delay(100);
  const [port, wsPath] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  return { cdp: new Cdp(ws), child, profile, ws };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.name) {
    console.error("Usage: node scripts/shot.mjs <widget> [--sizes XL,M] [--portrait] [--query ...]");
    process.exit(1);
  }
  const widgetIndex = path.join(repoRoot, "widgets", opts.name, "widget", "index.html");
  if (!opts.url && !fs.existsSync(widgetIndex)) throw new Error(`No widget at ${widgetIndex}`);
  const outDir = opts.out ? path.resolve(opts.out) : path.join(repoRoot, "dist", "shots", opts.url ? "pages" : opts.name);
  fs.mkdirSync(outDir, { recursive: true });

  const jobs = [];
  if (opts.url) jobs.push({ label: opts.name, w: opts.size?.[0] ?? 1600, h: opts.size?.[1] ?? 1000, url: opts.url });
  else for (const size of opts.sizes) {
    const [w, h] = LANDSCAPE[size];
    if (!opts.portraitOnly) jobs.push({ label: size, w, h });
    if (opts.portrait || opts.portraitOnly) jobs.push({ label: `${size}-portrait`, w: h, h: w });
  }

  const { cdp, child, profile, ws } = await launchEdge(opts);
  const problems = [];
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const s = (method, params) => cdp.send(method, params, sessionId);
    let current = "";
    cdp.on((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === "Runtime.consoleAPICalled") {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
        if (msg.params.type === "error") problems.push(`[${current}] console.error: ${text}`);
        else if (process.env.SHOT_VERBOSE) console.log(`[${current}] ${msg.params.type}: ${text}`);
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        problems.push(`[${current}] exception: ${d.exception?.description || d.text} (${d.url || ""}:${d.lineNumber})`);
      }
    });
    await s("Runtime.enable");
    await s("Page.enable");

    for (const job of jobs) {
      current = job.label;
      await s("Emulation.setDeviceMetricsOverride", { width: job.w, height: job.h, deviceScaleFactor: 1, mobile: false });
      const query = `instance=${job.label}${opts.query ? "&" + opts.query : ""}`;
      const url = job.url ? job.url : opts.preview
        ? `http://127.0.0.1:47900/w/${opts.name}/index.html?${query}`
        : `${pathToFileURL(widgetIndex).href}?${query}`;
      await s("Page.navigate", { url });
      const started = Date.now();
      let ready = false;
      while (Date.now() - started < opts.timeout) {
        const { result } = await s("Runtime.evaluate", { expression: job.url ? "document.readyState === 'complete'" : "window.__widgetReady === true", returnByValue: true });
        if (result.value) {
          ready = true;
          break;
        }
        await delay(150);
      }
      if (!ready) problems.push(`[${job.label}] window.__widgetReady not set within ${opts.timeout} ms`);
      await delay(opts.wait);
      if (opts.evalExpr) {
        const { exceptionDetails } = await s("Runtime.evaluate", { expression: opts.evalExpr, awaitPromise: true });
        if (exceptionDetails) problems.push(`[${job.label}] --eval failed: ${exceptionDetails.exception?.description}`);
      }
      for (let frame = 0; frame < opts.frames; frame += 1) {
        if (opts.each) {
          const { exceptionDetails } = await s("Runtime.evaluate", { expression: `((__frame) => (${opts.each}))(${frame})`, awaitPromise: true });
          if (exceptionDetails) problems.push(`[${job.label}] --each failed: ${exceptionDetails.exception?.description}`);
        }
        if (frame > 0 || opts.each) await delay(opts.every);
        const { data } = await s("Page.captureScreenshot", { format: "png" });
        const suffix = (opts.tag ? `-${opts.tag}` : "") + (opts.frames > 1 ? `-${String(frame).padStart(2, "0")}` : "");
        const file = path.join(outDir, `${job.label}${suffix}.png`);
        fs.writeFileSync(file, Buffer.from(data, "base64"));
        console.log(file);
      }
      const { result: stats } = await s("Runtime.evaluate", {
        expression: "JSON.stringify(window.__widgetStats || null)",
        returnByValue: true,
      });
      if (stats.value && stats.value !== "null") console.log(`  stats ${stats.value}`);
    }
  } finally {
    ws.close();
    child.kill();
    await delay(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // Edge may still hold files in the profile for a moment.
    }
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
