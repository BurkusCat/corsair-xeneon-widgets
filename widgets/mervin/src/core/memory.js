// What Mervin remembers between sessions, in localStorage under a key per widget instance.
// Storage can be missing or throw (previews, private windows): everything degrades to an
// in-memory copy.

const DAY = 24 * 60 * 60 * 1000;

export function createMemory(key, storage = globalThis.localStorage, now = () => Date.now()) {
  let data = null;
  try {
    data = JSON.parse(storage?.getItem(key) ?? "null");
  } catch {
    data = null;
  }
  if (!data || typeof data !== "object") data = {};
  const memory = {
    firstSeen: typeof data.firstSeen === "number" ? data.firstSeen : now(),
    taps: data.taps | 0,
    chainsDone: data.chainsDone && typeof data.chainsDone === "object" ? data.chainsDone : {},
    recent: Array.isArray(data.recent) ? data.recent.filter((n) => Number.isInteger(n)).slice(-600) : [],
    suspended: data.suspended ?? null,
    visits: (data.visits | 0) + 1,
  };
  let dirty = true;
  let lastSave = 0;

  return {
    data: memory,
    daysTogether() {
      return Math.max(1, Math.floor((now() - memory.firstSeen) / DAY) + 1);
    },
    touch() {
      dirty = true;
    },
    save(force = false) {
      if (!dirty || (!force && now() - lastSave < 5000)) return;
      try {
        storage?.setItem(key, JSON.stringify(memory));
        dirty = false;
        lastSave = now();
      } catch {
        // Storage full or blocked: keep going without it.
      }
    },
  };
}
