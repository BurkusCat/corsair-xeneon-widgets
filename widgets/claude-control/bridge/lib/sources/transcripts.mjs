// Facts read from the tail of a session transcript:
//   ~/.claude/projects/<cwd with every non-alphanumeric char replaced by "-">/<sessionId>.jsonl
//
// The path is documented; the line format is internal and changes between versions, so
// this only looks at a few well-established line types and ignores everything else:
//   {type:"assistant", message:{model, usage:{input_tokens, cache_*_input_tokens}}, gitBranch}
//   {type:"system", subtype:"compact_boundary"}   context was reset after this point
//   {type:"custom-title", customTitle}             /rename or desktop title
//   {type:"last-prompt", lastPrompt}
//   {type:"cost-state", totalCostUSD, totalLinesAdded, totalLinesRemoved}

import fs from "node:fs";
import path from "node:path";
import { listDirs } from "../json-files.mjs";

const TAIL_BYTES = 768 * 1024;
const INTERESTING = ['"type":"assistant"', "compact_boundary", '"custom-title"', '"last-prompt"', '"cost-state"'];
const MISS_TTL_MS = 60_000;
const tailCache = new Map();
const locationCache = new Map();
// Sessions whose transcript was not found anywhere: don't rescan every project each poll.
const missCache = new Map();

export function projectSlug(cwd) {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

export function findTranscript(claudeDir, sessionId, cwds = []) {
  const projectsDir = path.join(claudeDir, "projects");
  const fileName = `${sessionId}.jsonl`;
  const cached = locationCache.get(sessionId);
  if (cached && fs.existsSync(cached)) return cached;
  if ((missCache.get(sessionId) ?? 0) > Date.now()) return undefined;

  for (const cwd of cwds.filter(Boolean)) {
    const candidate = path.join(projectsDir, projectSlug(cwd), fileName);
    if (fs.existsSync(candidate)) {
      locationCache.set(sessionId, candidate);
      return candidate;
    }
  }
  // Worktrees and moved folders: fall back to scanning every project directory once.
  for (const dir of listDirs(projectsDir)) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) {
      locationCache.set(sessionId, candidate);
      return candidate;
    }
  }
  missCache.set(sessionId, Date.now() + MISS_TTL_MS);
  return undefined;
}

export function readTranscriptFacts(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return undefined;
  }
  const hit = tailCache.get(file);
  if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) return hit.facts;

  const facts = parseTail(readTail(file, stat.size));
  facts.modifiedAt = stat.mtimeMs;
  tailCache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, facts });
  return facts;
}

function readTail(file, size) {
  const length = Math.min(size, TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buffer, 0, length, size - length);
  } finally {
    fs.closeSync(fd);
  }
  const text = buffer.toString("utf8");
  // Drop the first, probably partial, line unless we read the whole file.
  return length < size ? text.slice(text.indexOf("\n") + 1) : text;
}

export function parseTail(text) {
  const lines = text.split("\n");
  const facts = {};
  let sawCompactAfterUsage = false;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    // Tool results make up most of a transcript; skip them without parsing.
    if (!line || !INTERESTING.some((marker) => line.includes(marker))) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.isSidechain) continue;

    if (facts.gitBranch === undefined && typeof entry.gitBranch === "string" && entry.gitBranch) {
      facts.gitBranch = entry.gitBranch;
    }
    switch (entry.type) {
      case "assistant": {
        const usage = entry.message?.usage;
        if (facts.contextTokens === undefined && usage && !sawCompactAfterUsage) {
          const last = Array.isArray(usage.iterations) && usage.iterations.length ? usage.iterations.at(-1) : usage;
          facts.contextTokens =
            (last.input_tokens ?? 0) + (last.cache_creation_input_tokens ?? 0) + (last.cache_read_input_tokens ?? 0);
          facts.model ??= entry.message.model;
          facts.lastAssistantAt ??= Date.parse(entry.timestamp) || undefined;
        }
        facts.model ??= entry.message?.model;
        break;
      }
      case "system":
        if (entry.subtype === "compact_boundary" && facts.contextTokens === undefined) {
          sawCompactAfterUsage = true;
          facts.compacted = true;
        }
        break;
      case "custom-title":
        facts.title ??= entry.customTitle;
        break;
      case "last-prompt":
        facts.lastPrompt ??= entry.lastPrompt;
        break;
      case "cost-state":
        if (facts.costUsd === undefined) {
          facts.costUsd = entry.totalCostUSD;
          facts.linesAdded = entry.totalLinesAdded;
          facts.linesRemoved = entry.totalLinesRemoved;
        }
        break;
      default:
        break;
    }
    if (facts.contextTokens !== undefined && facts.title && facts.lastPrompt && facts.costUsd !== undefined && facts.gitBranch) {
      break;
    }
  }
  return facts;
}
