import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BRIDGE_VERSION = "0.1.0";

// The widget manifest declares `{ "type": "url", "domain": "localhost", "port": 47821 }`.
// iCUE permissions are static, so changing this means editing the manifest and app.js too.
export const DEFAULT_PORT = 47821;

export const BRIDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WIDGET_DIR = path.resolve(BRIDGE_DIR, "..", "widget");

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw new Error(`Could not read ${file}: ${error.message}`);
  }
}

// The Claude desktop app is an MSIX package. Its data normally lands in %APPDATA%\Claude,
// but MSIX file-system virtualisation can redirect it into the package's LocalCache, so
// both locations are candidates.
export function defaultDesktopDirs(env = process.env) {
  const dirs = [];
  if (env.APPDATA) dirs.push(path.join(env.APPDATA, "Claude"));
  if (env.LOCALAPPDATA) {
    const packages = path.join(env.LOCALAPPDATA, "Packages");
    try {
      for (const entry of fs.readdirSync(packages)) {
        if (/^Claude_/i.test(entry)) dirs.push(path.join(packages, entry, "LocalCache", "Roaming", "Claude"));
      }
    } catch {
      // No Packages folder: not an MSIX install.
    }
  }
  if (process.platform === "darwin") dirs.push(path.join(os.homedir(), "Library", "Application Support", "Claude"));
  return dirs;
}

export function loadConfig(env = process.env) {
  const file = env.CLAUDE_CONTROL_CONFIG || path.join(BRIDGE_DIR, "config.json");
  const fromFile = readJsonIfExists(file) ?? {};
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share");

  const config = {
    port: Number(env.CLAUDE_CONTROL_PORT || fromFile.port || DEFAULT_PORT),
    // Optional shared secret. When set, /api/* requests must send it as X-Claude-Control-Token
    // (the widget reads it from its "Bridge token" setting).
    token: String(env.CLAUDE_CONTROL_TOKEN || fromFile.token || ""),
    claudeDir: env.CLAUDE_CONFIG_DIR || fromFile.claudeDir || path.join(os.homedir(), ".claude"),
    desktopDirs: fromFile.desktopDir ? [fromFile.desktopDir] : defaultDesktopDirs(env),
    dataDir: env.CLAUDE_CONTROL_DATA_DIR || fromFile.dataDir || path.join(localAppData, "ClaudeControlBridge"),
    // Desktop sessions that are not running are listed if they were active this recently.
    recentHours: Number(fromFile.recentHours ?? 24),
    maxSessions: Number(fromFile.maxSessions ?? 12),
    // A finished turn you have not opened is "done" for this long, then idle.
    unseenHours: Number(fromFile.unseenHours ?? 12),
    // Model id -> context window in tokens; overrides the built-in guess in context.mjs.
    contextWindows: fromFile.contextWindows ?? {},
    // Folders offered as "new session" shortcuts before the recently used ones.
    quickStartFolders: Array.isArray(fromFile.quickStartFolders) ? fromFile.quickStartFolders : [],
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port: ${config.port}`);
  }
  return config;
}
