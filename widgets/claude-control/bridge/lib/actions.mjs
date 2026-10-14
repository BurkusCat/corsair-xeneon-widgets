// Side effects the widget can trigger. Everything here is built from validated ids and
// paths; nothing from a request is ever passed to a shell.
//
// Claude desktop deep links (handled by the desktop app's claude:// protocol handler,
// desktop 2.37337; only /new with ssh_* params is documented, the rest were read from the
// app's URL handler):
//   claude://code/continue?session=<local_id>|last   open that Code session
//   claude://code/needs-input                        oldest session with a pending permission
//   claude://code/new?folder=<abs path>&q=<prompt>   new session screen, prompt not sent

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DESKTOP_ID = /^local_[A-Za-z0-9-]{1,64}$/;
const MAX_PROMPT = 2000;

export function continueUrl(desktopId) {
  if (desktopId !== "last" && !DESKTOP_ID.test(desktopId)) throw new ActionError(400, "Invalid desktop session id");
  return `claude://code/continue?session=${encodeURIComponent(desktopId)}`;
}

export function newSessionUrl(folder, prompt) {
  if (typeof folder !== "string" || !path.isAbsolute(folder) || folder.startsWith("\\\\")) {
    throw new ActionError(400, "Folder must be an absolute local path");
  }
  let stat;
  try {
    stat = fs.statSync(folder);
  } catch {
    throw new ActionError(404, "Folder does not exist");
  }
  if (!stat.isDirectory()) throw new ActionError(400, "Not a folder");
  const params = new URLSearchParams({ folder });
  if (typeof prompt === "string" && prompt.trim()) params.set("q", prompt.trim().slice(0, MAX_PROMPT));
  return `claude://code/new?${params}`;
}

export const NEEDS_INPUT_URL = "claude://code/needs-input";

export function openDeepLink(url) {
  if (!url.startsWith("claude://")) throw new ActionError(400, "Only claude:// links can be opened");
  // URLSearchParams percent-encodes spaces, quotes and separators, so the URL is a single
  // safe argument. explorer.exe hands it to the registered protocol handler.
  if (process.platform === "win32") return detached("explorer.exe", [url]);
  if (process.platform === "darwin") return detached("open", [url]);
  return detached("xdg-open", [url]);
}

// Terminal sessions have no deep link: bring the window that hosts the process forward.
// Walks up the parent chain to the first process that owns a window (Windows Terminal,
// conhost, an IDE...). Tabs inside that window cannot be selected from outside.
const FOCUS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CcFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
"@
$p = $TargetPid
for ($i = 0; $i -lt 12 -and $p; $i++) {
  $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
  if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
    $h = $proc.MainWindowHandle
    if ([CcFocus]::IsIconic($h)) { [CcFocus]::ShowWindow($h, 9) | Out-Null }
    # A background process may not take the foreground; a synthetic Alt press lifts that lock.
    [CcFocus]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [CcFocus]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [CcFocus]::SetForegroundWindow($h) | Out-Null
    exit 0
  }
  $p = (Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue).ParentProcessId
}
exit 3
`;

export function focusProcessWindow(pid) {
  if (!Number.isInteger(pid) || pid <= 0) throw new ActionError(400, "Invalid pid");
  if (process.platform !== "win32") throw new ActionError(501, "Focusing terminal windows is only implemented on Windows");
  return new Promise((resolve) => {
    // -EncodedCommand (UTF-16LE base64) sidesteps every command-line quoting rule.
    const script = `$TargetPid = ${pid}\n${FOCUS_SCRIPT}`;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      windowsHide: true,
      stdio: "ignore",
    });
    const timer = setTimeout(() => child.kill(), 8000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.on("error", () => resolve(false));
  });
}

function detached(command, args) {
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", (error) => console.warn(`[actions] ${command} failed: ${error.message}`));
  child.unref();
  return true;
}

export class ActionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
