// Push feeds from Claude Code itself (both optional, both documented interfaces):
//   status line  -> POST /ingest/statusline   (bridge/statusline.mjs)
//   hooks        -> POST /ingest/hook         (bridge/hook.mjs)
//
// The status line JSON is the only documented source of plan usage *with reset times*
// (rate_limits.five_hour / seven_day) and of the exact context window size. Hooks add
// "what is it waiting for" detail and a turn-finished signal for terminal sessions.
//
// Only short summaries are kept: never prompts in full, tool inputs or file contents.

import fs from "node:fs";
import path from "node:path";

const SAMPLE_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;
const MAX_SAMPLES = 4000;
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

export class FeedStore {
  constructor({ dataDir, now = () => Date.now() } = {}) {
    this.now = now;
    this.file = dataDir ? path.join(dataDir, "usage-samples.json") : undefined;
    this.sessions = new Map();
    this.rateLimits = {};
    this.samples = [];
    this.lastStatuslineAt = undefined;
    this.lastHookAt = undefined;
    this.load();
  }

  load() {
    if (!this.file) return;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (Array.isArray(saved.samples)) this.samples = saved.samples.filter((s) => Number.isFinite(s?.t));
      if (saved.rateLimits && typeof saved.rateLimits === "object") this.rateLimits = saved.rateLimits;
    } catch {
      // First run, or an unreadable file: start empty.
    }
  }

  save() {
    if (!this.file) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ samples: this.samples, rateLimits: this.rateLimits }));
        fs.renameSync(tmp, this.file);
      } catch (error) {
        console.warn(`[feeds] could not save usage samples: ${error.message}`);
      }
    }, 2000);
    this.saveTimer.unref?.();
  }

  session(sessionId) {
    let entry = this.sessions.get(sessionId);
    if (!entry) {
      entry = {};
      this.sessions.set(sessionId, entry);
    }
    entry.touchedAt = this.now();
    return entry;
  }

  ingestStatusline(data) {
    if (!data || typeof data !== "object" || typeof data.session_id !== "string") return false;
    const at = this.now();
    this.lastStatuslineAt = at;
    const entry = this.session(data.session_id);
    const window = data.context_window;
    entry.statusline = {
      at,
      model: data.model?.id,
      contextWindowSize: finite(window?.context_window_size),
      contextUsedPercent: finite(window?.used_percentage),
      contextTokens: finite(window?.total_input_tokens),
      costUsd: finite(data.cost?.total_cost_usd),
      linesAdded: finite(data.cost?.total_lines_added),
      linesRemoved: finite(data.cost?.total_lines_removed),
      sessionName: typeof data.session_name === "string" ? data.session_name : undefined,
    };

    const limits = data.rate_limits;
    if (limits && typeof limits === "object") {
      let changed = false;
      for (const [key, name] of [["five_hour", "fiveHour"], ["seven_day", "sevenDay"]]) {
        const w = limits[key];
        if (!w || !Number.isFinite(w.used_percentage)) continue;
        const resetsAt = Number.isFinite(w.resets_at) ? w.resets_at * 1000 : undefined;
        this.rateLimits[name] = { percent: w.used_percentage, resetsAt, at };
        changed = true;
      }
      if (changed) this.addSample(at, this.rateLimits);
    }
    this.prune();
    return true;
  }

  ingestHook(data) {
    if (!data || typeof data !== "object" || typeof data.session_id !== "string") return false;
    const at = this.now();
    this.lastHookAt = at;
    const entry = this.session(data.session_id);
    const event = data.hook_event_name;
    switch (event) {
      case "UserPromptSubmit":
        entry.turn = { state: "running", at };
        entry.waiting = undefined;
        break;
      case "Stop":
        entry.turn = { state: "done", at, preview: clip(data.last_assistant_message, 240) };
        entry.waiting = undefined;
        break;
      case "StopFailure":
        entry.turn = { state: "failed", at };
        break;
      case "Notification":
        if (data.notification_type === "permission_prompt" || data.notification_type === "idle_prompt" ||
            data.notification_type === "elicitation_dialog" || data.notification_type === "agent_needs_input") {
          entry.waiting = { at, type: data.notification_type, message: clip(data.message, 200) };
        }
        break;
      case "PermissionRequest":
        entry.waiting = { at, type: "permission_prompt", message: describeTool(data.tool_name, data.tool_input) };
        break;
      case "SessionEnd":
        this.sessions.delete(data.session_id);
        break;
      default:
        break;
    }
    entry.lastEvent = { name: event, at };
    this.prune();
    return true;
  }

  addSample(t, limits) {
    const sample = { t };
    if (limits.fiveHour) sample.fiveHour = limits.fiveHour.percent;
    if (limits.sevenDay) sample.sevenDay = limits.sevenDay.percent;
    const last = this.samples.at(-1);
    // One sample per minute is plenty for pace estimates.
    if (last && t - last.t < 60_000) this.samples[this.samples.length - 1] = sample;
    else this.samples.push(sample);
    this.save();
  }

  prune() {
    const now = this.now();
    for (const [id, entry] of this.sessions) {
      if (now - (entry.touchedAt ?? 0) > SESSION_RETENTION_MS) this.sessions.delete(id);
    }
    const cutoff = now - SAMPLE_RETENTION_MS;
    if (this.samples.length && (this.samples[0].t < cutoff || this.samples.length > MAX_SAMPLES)) {
      this.samples = this.samples.filter((s) => s.t >= cutoff).slice(-MAX_SAMPLES);
    }
  }
}

function finite(value) {
  return Number.isFinite(value) ? value : undefined;
}

function clip(value, max) {
  if (typeof value !== "string") return undefined;
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat || undefined;
}

// "Bash: npm test", "Edit: src/app.ts" — enough to recognise the prompt, nothing more.
export function describeTool(toolName, input) {
  if (typeof toolName !== "string") return undefined;
  const subject =
    (typeof input?.description === "string" && input.description) ||
    (typeof input?.command === "string" && input.command) ||
    (typeof input?.file_path === "string" && input.file_path) ||
    (typeof input?.url === "string" && input.url) ||
    (typeof input?.pattern === "string" && input.pattern);
  return clip(subject ? `${toolName}: ${subject}` : toolName, 120);
}
