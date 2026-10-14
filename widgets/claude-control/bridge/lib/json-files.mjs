import fs from "node:fs";
import path from "node:path";

// Small JSON files that other processes rewrite while we poll. Cache parsed contents by
// mtime + size so a 1.5 s poll does not re-parse dozens of unchanged files, and treat a
// half-written file as "unchanged" rather than an error.
const cache = new Map();

export function readJsonCached(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    cache.delete(file);
    return undefined;
  }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.value;
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, value });
    return value;
  } catch {
    return hit?.value;
  }
}

export function listFiles(dir, pattern) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

export function listDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}
