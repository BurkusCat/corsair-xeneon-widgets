// Chooses what Mervin says: one-liners that fit the moment, and chains of thought.
// Pure: the content (window.MERVIN_CONTENT shape), a seeded rng and a memory object.

import { createGrammar, splitTokens } from "./grammar.js";

// Categories that are only used on purpose, never as random chatter.
export const SPECIAL = new Set(["sleep", "wake", "greeting", "timeout", "resume", "tapFurniture", "floorTap", "returnHome", "peek"]);

const RECENT_LIMIT = 600;

export function createPicker(content, rng, memory) {
  const grammar = createGrammar(content.lexicons, rng);
  const byCategory = new Map();
  for (const line of content.lines) {
    if (!byCategory.has(line.c)) byCategory.set(line.c, []);
    byCategory.get(line.c).push(line);
  }
  const chatterPool = content.lines.filter((l) => !SPECIAL.has(l.c));
  const recentSet = new Set(memory.recent);
  const recentCategories = [];

  function remember(line) {
    memory.recent.push(line.id);
    recentSet.add(line.id);
    while (memory.recent.length > RECENT_LIMIT) recentSet.delete(memory.recent.shift());
    recentCategories.push(line.c);
    if (recentCategories.length > 10) recentCategories.shift();
  }

  const fits = (tags, context) => tags.every((t) => context.has(t));

  function choose(pool, context, { boostTagged = 4 } = {}) {
    const eligible = pool.filter((l) => fits(l.t, context));
    if (!eligible.length) return null;
    // Forget the oldest repeats if nearly everything here has been said recently.
    let fresh = eligible.filter((l) => !recentSet.has(l.id));
    if (fresh.length < Math.max(3, eligible.length * 0.15)) {
      const keep = new Set(memory.recent.slice(-Math.floor(eligible.length * 0.5)));
      fresh = eligible.filter((l) => !keep.has(l.id));
      if (!fresh.length) fresh = eligible;
    }
    const line = rng.weighted(fresh, (l) => {
      let w = l.w ?? 1;
      if (l.t.length) w *= boostTagged;
      const sameCat = recentCategories.filter((c) => c === l.c).length;
      if (sameCat) w *= 0.3 ** Math.min(2, sameCat);
      return w;
    });
    remember(line);
    return line;
  }

  function render(line, values) {
    const { text, tokens } = splitTokens(line.x ?? line);
    return { text: grammar.expand(text, values), tokens, id: line.id };
  }

  return {
    grammar,
    // Random chatter that fits the context (a Set of tags).
    chatter(context, values) {
      const line = choose(chatterPool, context);
      return line ? render(line, values) : null;
    },
    // A line from a special category (sleep, wake, greeting, ...).
    special(category, context, values) {
      const pool = byCategory.get(category) ?? [];
      const line = choose(pool, context, { boostTagged: 6 });
      return line ? render(line, values) : null;
    },
    // A chain to start: prefers ones that fit `start` and the context, then ones not heard
    // yet, then the least recently finished.
    chain(start, context) {
      const fitsStart = (c) => c.start === start || c.start === "any" || (start === "idle" && c.start.startsWith("act:"));
      let pool = content.chains.filter((c) => fitsStart(c) && fits(c.tags, context));
      if (!pool.length) pool = content.chains.filter((c) => c.start === "idle" || c.start === "any");
      if (!pool.length) return null;
      const unheard = pool.filter((c) => !memory.chainsDone[c.id]);
      const candidates = unheard.length ? unheard : pool.slice().sort((a, b) => memory.chainsDone[a.id] - memory.chainsDone[b.id]).slice(0, Math.max(1, Math.ceil(pool.length / 3)));
      return rng.weighted(candidates, (c) => (c.tags.length ? 3 : 1) * (c.start === start ? 2 : 1));
    },
    // Fix a chain's wording for this telling: pick alternatives, drop some optional steps.
    tellChain(chain) {
      const steps = [];
      for (const step of chain.steps) {
        if (step.o && rng.chance(0.5)) continue;
        steps.push({ template: rng.pick(step.a), end: !!step.e });
      }
      return steps;
    },
    render,
    renderTemplate(template, values) {
      const { text, tokens } = splitTokens(template);
      return { text: grammar.expand(text, values), tokens };
    },
    chainById(id) {
      return content.chains.find((c) => c.id === id) ?? null;
    },
  };
}

// "ten past three", "quarter to four", "just gone nine"...
export function timePhrase(date) {
  const words = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
  const h = date.getHours();
  const m = date.getMinutes();
  const rounded = Math.round(m / 5) * 5;
  const hourWord = (offset) => words[(h + offset) % 12];
  if (rounded === 0 || rounded === 60) return m <= 2 ? `${hourWord(rounded === 60 ? 1 : 0)} o'clock` : `just gone ${hourWord(0)}`;
  if (rounded === 15) return `quarter past ${hourWord(0)}`;
  if (rounded === 30) return `half past ${hourWord(0)}`;
  if (rounded === 45) return `quarter to ${hourWord(1)}`;
  if (rounded < 30) return `${["", "five", "ten", "quarter", "twenty", "twenty-five"][rounded / 5]} past ${hourWord(0)}`;
  return `${["", "five", "ten", "quarter", "twenty", "twenty-five"][(60 - rounded) / 5]} to ${hourWord(1)}`;
}
