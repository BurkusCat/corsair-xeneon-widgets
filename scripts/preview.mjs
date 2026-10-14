#!/usr/bin/env node
// Preview server for widgets that have no bridge of their own.
//
//   node scripts/preview.mjs [name]        -> http://127.0.0.1:47900/
//
// /                     harness: every widget size in iframes, portrait toggle, live settings
// /w/<name>/...         widgets/<name>/widget/ with preview/shim.js injected into index.html
// /dev/<name>/...       widgets/<name>/dev/ (development pages, never packaged)
// /preview/...          scripts/preview/ (harness and shim)
// /api/widgets          the widget list with their x-icue-property settings
//
// Listens on 127.0.0.1 only. Files are read fresh on every request.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const widgetsDir = path.join(repoRoot, "widgets");
const previewDir = path.join(repoRoot, "scripts", "preview");
const PORT = Number(process.env.PREVIEW_PORT || 47900);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function serveStatic(res, root, relative, { injectShim = false } = {}) {
  const file = path.resolve(root, decodeURIComponent(relative || "index.html"));
  if (file !== root && !file.startsWith(root + path.sep)) return send(res, 403, "text/plain", "Forbidden");
  let body;
  try {
    body = fs.readFileSync(fs.statSync(file).isDirectory() ? path.join(file, "index.html") : file);
  } catch {
    return send(res, 404, "text/plain", "Not found");
  }
  if (injectShim && path.basename(file) === "index.html") {
    // The shim stands in for iCUE (globals, settings, events) when the widget runs in a browser.
    body = Buffer.from(body.toString("utf8").replace(/<head>/i, '<head>\n  <script src="/preview/shim.js"></script>'));
  }
  send(res, 200, MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", body);
}

// Settings metadata from each widget's index.html, for the harness controls.
function listWidgets() {
  return fs
    .readdirSync(widgetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(widgetsDir, entry.name, "widget", "index.html")))
    .map((entry) => {
      const html = fs.readFileSync(path.join(widgetsDir, entry.name, "widget", "index.html"), "utf8");
      const settings = [...html.matchAll(/<meta\s+name="x-icue-property"([^>]*)\/?>/g)].map((match) => {
        const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
        return {
          name: attrs.content,
          label: (attrs["data-label"] || attrs.content).replace(/^tr\('(.*)'\)$/, "$1"),
          type: attrs["data-type"],
          default: attrs["data-default"],
          min: attrs["data-min"],
          max: attrs["data-max"],
          step: attrs["data-step"],
          values: attrs["data-values"],
        };
      });
      return { name: entry.name, settings };
    });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/") return serveStatic(res, previewDir, "index.html");
  if (parts[0] === "preview") return serveStatic(res, previewDir, parts.slice(1).join("/"));
  if (parts[0] === "api" && parts[1] === "widgets") return send(res, 200, MIME[".json"], JSON.stringify(listWidgets()));
  if ((parts[0] === "w" || parts[0] === "dev") && parts[1] && /^[a-z0-9-]+$/.test(parts[1])) {
    const sub = parts[0] === "w" ? "widget" : "dev";
    const root = path.join(widgetsDir, parts[1], sub);
    if (parts.length === 2 && !url.pathname.endsWith("/")) {
      res.writeHead(302, { Location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    return serveStatic(res, root, parts.slice(2).join("/"), { injectShim: parts[0] === "w" });
  }
  send(res, 404, "text/plain", "Not found");
});

server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `Port ${PORT} is already in use.` : error);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  const name = process.argv[2];
  console.log(`Preview: http://127.0.0.1:${PORT}/${name ? `?widget=${name}` : ""}`);
});
