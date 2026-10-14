// Small seeded random number generator (mulberry32) so runs can be reproduced with ?seed=.

export function createRng(seed = Date.now()) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    // Pick from [{weight, ...}] or with a weight function.
    weighted: (list, weightOf = (item) => item.weight) => {
      let total = 0;
      for (const item of list) total += Math.max(0, weightOf(item));
      if (total <= 0) return list.length ? list[Math.floor(next() * list.length)] : undefined;
      let r = next() * total;
      for (const item of list) {
        r -= Math.max(0, weightOf(item));
        if (r <= 0) return item;
      }
      return list[list.length - 1];
    },
    shuffle: (list) => {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
