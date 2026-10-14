#!/usr/bin/env node
// Claude Code hook command that forwards the hook's JSON input to the bridge.
// Register it with "async": true so it never delays Claude (see setup.mjs). It prints
// nothing and always exits 0, so it can never block or alter a tool call.

import { DEFAULT_PORT } from "./lib/config.mjs";

const port = Number(process.env.CLAUDE_CONTROL_PORT || DEFAULT_PORT);

let body = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) body += chunk;

try {
  await fetch(`http://127.0.0.1:${port}/ingest/hook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(500),
  });
} catch {
  // Bridge not running: nothing to do.
}
process.exit(0);
