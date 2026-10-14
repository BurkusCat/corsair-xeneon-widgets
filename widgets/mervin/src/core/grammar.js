// Phrase templates with random substitution. Pure; used by the widget and by the content
// tools (lint, build, tests).
//
//   {food}            a random entry from the "food" lexicon
//   {food.pl}         its plural        {food.a}  with "a"/"an"     {food.cap}  Capitalised
//   {food=x} ... {x}  pick once and reuse (the binding name must not be a lexicon name)
//   {a|b|c}           inline choice (choices may contain slots)
//   {n:2-14}          a whole number in a range
//   {weekday} {partOfDay} {daysTogether} {hour} {time} {planet} {held}   from the context
//   <act:dance> <face:grin> <gesture:shrug>   tokens: stripped from the text and returned
//
// Lexicon entries may contain slots themselves (nested up to 4 deep).

const VOWEL_SOUND = /^(a|e|i|o|u(?!ni|se|su|ra|ro|ti|ku)|hour|honest|heir|8|11|18)/i;

export function article(word) {
  return VOWEL_SOUND.test(word.trim()) ? `an ${word}` : `a ${word}`;
}

export function pluralise(word) {
  // Pluralise the last word of the phrase only ("cheese sandwich" -> "cheese sandwiches"),
  // unless the phrase is "x of y" ("cup of tea" -> "cups of tea").
  const of = /^(.*?)( of .*)$/.exec(word);
  if (of) return pluralise(of[1]) + of[2];
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

export function capitalise(text) {
  return text.replace(/^(\s*["'(]?)([a-z])/, (m, p, c) => p + c.toUpperCase());
}

// Parse a template into nodes. Throws on unbalanced braces.
export function parseTemplate(source) {
  let pos = 0;
  function parseSeq(stopChars) {
    const nodes = [];
    let text = "";
    while (pos < source.length) {
      const ch = source[pos];
      if (stopChars.includes(ch)) break;
      if (ch === "{") {
        if (text) nodes.push({ type: "text", text });
        text = "";
        pos += 1;
        nodes.push(parseBrace());
        continue;
      }
      if (ch === "}") throw new Error(`Unexpected "}" at ${pos}`);
      text += ch;
      pos += 1;
    }
    if (text) nodes.push({ type: "text", text });
    return nodes;
  }
  function parseBrace() {
    const start = pos;
    const options = [parseSeq(["|", "}"])];
    while (source[pos] === "|") {
      pos += 1;
      options.push(parseSeq(["|", "}"]));
    }
    if (source[pos] !== "}") throw new Error(`Unclosed "{" at ${start - 1}`);
    pos += 1;
    if (options.length > 1) return { type: "choice", options };
    const inner = options[0];
    const raw = inner.length === 1 && inner[0].type === "text" ? inner[0].text.trim() : null;
    if (raw === null) return { type: "choice", options };
    const num = /^n:(\d+)-(\d+)$/.exec(raw);
    if (num) return { type: "number", min: Number(num[1]), max: Number(num[2]) };
    const slot = /^([A-Za-z][\w]*)(?:=([A-Za-z]\w*))?((?:\.(?:a|pl|cap))*)$/.exec(raw);
    if (!slot) throw new Error(`Bad slot "{${raw}}"`);
    return { type: "slot", name: slot[1], bind: slot[2] ?? null, mods: slot[3] ? slot[3].slice(1).split(".") : [] };
  }
  const nodes = parseSeq([]);
  if (pos < source.length) throw new Error(`Unexpected "${source[pos]}" at ${pos}`);
  return nodes;
}

const TOKEN = /<(act|face|gesture):([A-Za-z]+)>/g;

export function splitTokens(line) {
  const tokens = [];
  const text = line
    .replace(TOKEN, (m, kind, value) => {
      tokens.push({ kind, value });
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text, tokens };
}

// lexicons: { name: { kind: "noun" | "phrase", entries: [{ s, p }] } }
export function createGrammar(lexicons, rng) {
  const parsedEntries = new Map();
  const parsedTemplates = new Map();

  function parsedEntry(text) {
    if (!parsedEntries.has(text)) parsedEntries.set(text, parseTemplate(text));
    return parsedEntries.get(text);
  }

  function applyMods(word, entry, mods, nounKind) {
    let out = word;
    if (mods.includes("pl")) out = entry && entry.p ? entry.p : nounKind ? pluralise(out) : out;
    if (mods.includes("a")) out = article(out);
    if (mods.includes("cap")) out = capitalise(out);
    return out;
  }

  function render(nodes, ctx, depth) {
    let out = "";
    for (const node of nodes) {
      if (node.type === "text") out += node.text;
      else if (node.type === "number") out += String(rng.int(node.min, node.max));
      else if (node.type === "choice") out += render(rng.pick(node.options), ctx, depth);
      else out += renderSlot(node, ctx, depth);
    }
    return out;
  }

  function renderSlot(node, ctx, depth) {
    const { name, bind, mods } = node;
    if (ctx.bound[name] && !lexicons[name]) {
      const b = ctx.bound[name];
      return applyMods(b.text, b.entry, mods, b.noun);
    }
    const lex = lexicons[name];
    if (lex) {
      // Avoid repeating the same entry twice in one line.
      const used = ctx.used[name] ?? (ctx.used[name] = new Set());
      let entry = rng.pick(lex.entries);
      for (let i = 0; i < 4 && used.has(entry.s) && lex.entries.length > 1; i += 1) entry = rng.pick(lex.entries);
      used.add(entry.s);
      const text = depth < 4 ? render(parsedEntry(entry.s), ctx, depth + 1) : entry.s;
      const plural = entry.p && depth < 4 ? render(parsedEntry(entry.p), ctx, depth + 1) : null;
      const resolved = { s: text, p: plural };
      if (bind) ctx.bound[bind] = { text, entry: resolved, noun: lex.kind === "noun" };
      return applyMods(text, resolved, mods, lex.kind === "noun");
    }
    if (ctx.values && name in ctx.values) {
      const value = String(typeof ctx.values[name] === "function" ? ctx.values[name]() : ctx.values[name]);
      return applyMods(value, null, mods, false);
    }
    return `{${name}}`;
  }

  return {
    // Expand a template. values: context slots ({weekday}, {planet}, ...).
    expand(template, values = {}) {
      if (!parsedTemplates.has(template)) parsedTemplates.set(template, parseTemplate(template));
      const ctx = { bound: {}, used: {}, values };
      const text = render(parsedTemplates.get(template), ctx, 0)
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .trim();
      return capitalise(text);
    },
  };
}

// Slots a template uses (for lint): lexicon names, bindings, context names.
export function slotsOf(nodes, out = { slots: [], binds: [] }) {
  for (const node of nodes) {
    if (node.type === "slot") {
      out.slots.push(node);
      if (node.bind) out.binds.push(node.bind);
    } else if (node.type === "choice") for (const option of node.options) slotsOf(option, out);
  }
  return out;
}

// Shortest and longest possible expansion, given each lexicon's [min, max] lengths.
export function lengthRange(nodes, lexLengths, contextLengths = {}) {
  let min = 0;
  let max = 0;
  for (const node of nodes) {
    if (node.type === "text") {
      min += node.text.length;
      max += node.text.length;
    } else if (node.type === "number") {
      min += String(node.min).length;
      max += String(node.max).length;
    } else if (node.type === "choice") {
      const ranges = node.options.map((o) => lengthRange(o, lexLengths, contextLengths));
      min += Math.min(...ranges.map((r) => r[0]));
      max += Math.max(...ranges.map((r) => r[1]));
    } else {
      const range = lexLengths[node.name] ?? contextLengths[node.name] ?? [6, 14];
      const extra = (node.mods.includes("a") ? 3 : 0) + (node.mods.includes("pl") ? 3 : 0);
      min += range[0];
      max += range[1] + extra;
    }
  }
  return [min, max];
}
