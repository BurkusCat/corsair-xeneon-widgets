// Parser and checks for Mervin's content (content/FORMAT.md describes the format).
// Shared by build.mjs (compile), content-lint.mjs (writers' checker) and the tests.

import fs from "node:fs";
import path from "node:path";
import { lengthRange, parseTemplate, slotsOf, splitTokens } from "../src/core/grammar.js";
import { ACTIVITY_IDS, CONTEXT_TAGS, FACES, GESTURES } from "../src/core/registry.js";

export const MAX_LENGTH = 140;
export const MIN_LENGTH = 6;
const CONTEXT_SLOTS = { weekday: [6, 9], partOfDay: [5, 9], daysTogether: [1, 4], hour: [1, 2], time: [6, 20], planet: [8, 8], held: [4, 22] };
const ALLCAPS_OK = new Set(["OK", "TV", "UK", "I", "DVD", "WIFI", "PIN", "ATM", "DIY", "PE", "AM", "PM", "BBQ", "CD", "UFO", "VIP", "A", "ID", "LED", "USB", "PDF", "IKEA"]);
const AMERICAN = [
  [/\bcolor/i, "colour"], [/\bfavorite/i, "favourite"], [/\bmom\b/i, "mum"], [/\bmoms\b/i, "mums"], [/\bcenter/i, "centre"],
  [/\bgotten\b/i, "got"], [/\bneighbor/i, "neighbour"], [/\bflavor/i, "flavour"], [/\bhumor/i, "humour"], [/\bcookie/i, "biscuit"],
  [/\bfaucet/i, "tap"], [/\btrash\b/i, "rubbish/bin"], [/\bapartment/i, "flat"], [/\bvacation/i, "holiday"], [/\bsidewalk/i, "pavement"],
  [/\bgray\b/i, "grey"], [/\borganiz/i, "organis"], [/\brealiz/i, "realis"], [/\bapologiz/i, "apologis"], [/\bfall\b(?= (is|was|leaves))/i, "autumn"],
  [/\bmath\b/i, "maths"], [/\bpants\b/i, "trousers (pants are underwear)"], [/\bcandy\b/i, "sweets"], [/\bfries\b/i, "chips"], [/\bchips\b(?= and dip| bag)/i, "crisps"],
];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function readFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({ file: path.join(dir, f), name: f, text: fs.readFileSync(path.join(dir, f), "utf8") }));
}

// Lexicons: "@lexicon name", optional "@kind phrase" (default noun), entries one per line,
// "singular | plural" for irregular plurals.
function parseLexicons(files, errors) {
  const lexicons = {};
  const origin = {};
  for (const { file, text } of files) {
    let current = null;
    text.split(/\r?\n/).forEach((raw, i) => {
      const where = `${path.basename(file)}:${i + 1}`;
      const line = raw.replace(/\s+#.*$/, "").trim();
      if (!line || line.startsWith("#")) return;
      const directive = /^@(\w+)\s*(.*)$/.exec(line);
      if (directive) {
        const [, key, value] = directive;
        if (key === "lexicon") {
          if (!/^[a-z][A-Za-z0-9]*$/.test(value)) errors.push(`${where}: lexicon names are camelCase letters: "${value}"`);
          if (lexicons[value]) errors.push(`${where}: lexicon "${value}" already defined in ${origin[value]}`);
          current = lexicons[value] = { kind: "noun", entries: [] };
          origin[value] = where;
        } else if (key === "kind") {
          if (!current) errors.push(`${where}: @kind before @lexicon`);
          else if (!["noun", "phrase"].includes(value)) errors.push(`${where}: @kind must be noun or phrase`);
          else current.kind = value;
        } else errors.push(`${where}: unknown directive @${key} in a lexicon file`);
        return;
      }
      if (!current) {
        errors.push(`${where}: entry before any @lexicon`);
        return;
      }
      const [s, p] = line.split("|").map((x) => x.trim());
      try {
        parseTemplate(s);
        if (p) parseTemplate(p);
      } catch (error) {
        errors.push(`${where}: ${error.message}`);
      }
      current.entries.push(p ? { s, p, where } : { s, where });
    });
  }
  for (const [name, lex] of Object.entries(lexicons)) if (!lex.entries.length) errors.push(`${origin[name]}: lexicon "${name}" is empty`);
  return lexicons;
}

function parseDirectives(key, value, state, where, errors) {
  if (key === "category") state.category = value;
  else if (key === "tags") state.tags = value ? value.split(",").map((t) => t.trim()).filter(Boolean) : [];
  else if (key === "weight") {
    state.weight = Number(value);
    if (!(state.weight > 0)) errors.push(`${where}: @weight must be a positive number`);
  } else return false;
  return true;
}

// Lines: "@category x" and "@tags a,b" are sticky; every other line is one thing he says.
function parseLines(files, errors) {
  const lines = [];
  for (const { file, text, name } of files) {
    const state = { category: null, tags: [], weight: 1 };
    text.split(/\r?\n/).forEach((raw, i) => {
      const where = `${name}:${i + 1}`;
      const line = raw.replace(/\s{2,}#.*$/, "").trim();
      if (!line || line.startsWith("#")) return;
      const directive = /^@(\w+)\s*(.*)$/.exec(line);
      if (directive) {
        if (!parseDirectives(directive[1], directive[2].trim(), state, where, errors)) errors.push(`${where}: unknown directive @${directive[1]}`);
        return;
      }
      if (!state.category) errors.push(`${where}: line before any @category`);
      lines.push({ text: line, category: state.category, tags: state.tags.slice(), weight: state.weight, where, file: name });
    });
  }
  return lines;
}

// Chains: "@chain id", "@topic", "@start idle|any|night|act:<id>", optional "@tags".
// Steps: "- text" (always), "-? text" (optional, 50%), alternatives "| text" under a step,
// and the ending "= text" (exactly one, last).
function parseChains(files, errors) {
  const chains = [];
  for (const { text, name } of files) {
    let chain = null;
    const finish = () => {
      if (chain) chains.push(chain);
      chain = null;
    };
    text.split(/\r?\n/).forEach((raw, i) => {
      const where = `${name}:${i + 1}`;
      const line = raw.replace(/\s{2,}#.*$/, "").trim();
      if (!line || line.startsWith("#")) return;
      const directive = /^@(\w+)\s*(.*)$/.exec(line);
      if (directive) {
        const [, key, value] = directive;
        if (key === "chain") {
          finish();
          chain = { id: value.trim(), topic: "", start: "idle", tags: [], steps: [], where, file: name };
          if (!/^[a-z][a-zA-Z0-9-]*$/.test(chain.id)) errors.push(`${where}: chain ids are lowercase words with hyphens: "${chain.id}"`);
        } else if (!chain) errors.push(`${where}: @${key} before @chain`);
        else if (key === "topic") chain.topic = value.trim();
        else if (key === "start") chain.start = value.trim();
        else if (key === "tags") chain.tags = value.split(",").map((t) => t.trim()).filter(Boolean);
        else errors.push(`${where}: unknown directive @${key}`);
        return;
      }
      if (!chain) {
        errors.push(`${where}: text outside a @chain`);
        return;
      }
      const step = /^(-\?|-|=|\|)\s+(.*)$/.exec(line);
      if (!step) {
        errors.push(`${where}: chain lines start with "- ", "-? ", "| " or "= "`);
        return;
      }
      const [, mark, body] = step;
      if (mark === "|") {
        const last = chain.steps[chain.steps.length - 1];
        if (!last) errors.push(`${where}: "|" alternative before any step`);
        else last.alts.push({ text: body, where });
        return;
      }
      if (chain.steps.some((s) => s.end)) errors.push(`${where}: steps after the "=" ending`);
      chain.steps.push({ optional: mark === "-?", end: mark === "=", alts: [{ text: body, where }], where });
    });
    finish();
  }
  return chains;
}

export function lexiconLengths(lexicons) {
  // Approximate: entry text length (slots inside entries count as ~8 characters).
  const out = {};
  for (const [name, lex] of Object.entries(lexicons)) {
    const lengths = lex.entries.flatMap((e) => [e.s, e.p].filter(Boolean)).map((t) => t.replace(/\{[^}]*\}/g, "xxxxxxxx").length);
    out[name] = [Math.min(...lengths), Math.max(...lengths)];
  }
  return out;
}

// Check one template (a line or a chain step). Returns problems as strings.
function checkTemplate(textWithTokens, where, lexicons, lexLengths) {
  const problems = [];
  const { text, tokens } = splitTokens(textWithTokens);
  for (const t of tokens) {
    const valid = t.kind === "act" ? ACTIVITY_IDS : t.kind === "face" ? FACES : GESTURES;
    if (!valid.includes(t.value)) problems.push(`${where}: unknown <${t.kind}:${t.value}> (valid: ${valid.join(", ")})`);
  }
  let nodes;
  try {
    nodes = parseTemplate(text);
  } catch (error) {
    problems.push(`${where}: ${error.message}`);
    return problems;
  }
  const { slots, binds } = slotsOf(nodes);
  for (const b of binds) if (lexicons[b] || CONTEXT_SLOTS[b]) problems.push(`${where}: binding name "${b}" clashes with a lexicon or context slot`);
  for (const s of slots) {
    if (!lexicons[s.name] && !CONTEXT_SLOTS[s.name] && !binds.includes(s.name)) problems.push(`${where}: unknown slot {${s.name}}`);
    if (s.mods.includes("pl") && lexicons[s.name]?.kind === "phrase") problems.push(`${where}: {${s.name}.pl} on a phrase lexicon`);
  }
  const [min, max] = lengthRange(nodes, lexLengths, CONTEXT_SLOTS);
  if (max > MAX_LENGTH) problems.push(`${where}: can be ${max} characters long (max ${MAX_LENGTH}): "${text}"`);
  if (min < MIN_LENGTH && !/^(z+|zz.*|\.\.\.)/i.test(text)) problems.push(`${where}: too short`);
  if (/\b(a|an) \{/i.test(text)) problems.push(`${where}: write {name.a} instead of "a {name}" so the article matches`);
  if (EMOJI.test(text)) problems.push(`${where}: no emoji`);
  if ((text.match(/!/g) || []).length > 1) problems.push(`${where}: at most one "!" (he is very relaxed)`);
  const caps = text.replace(/\{[^}]*\}/g, "").match(/\b[A-Z]{2,}\b/g) || [];
  for (const c of caps) if (!ALLCAPS_OK.has(c)) problems.push(`${where}: no shouting (${c})`);
  for (const [re, fix] of AMERICAN) if (re.test(text.replace(/\{[^}]*\}/g, ""))) problems.push(`${where}: British English please (${fix})`);
  if (!/[.?!…"')\]]$/.test(text) && !/\}$/.test(text)) problems.push(`${where}: end with punctuation`);
  if (/  /.test(text)) problems.push(`${where}: double space`);
  return problems;
}

function normalise(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9{} ]/g, "").replace(/\s+/g, " ").trim();
}

function trigrams(text) {
  const words = normalise(text).split(" ");
  const set = new Set();
  for (let i = 0; i + 2 < words.length; i += 1) set.add(words.slice(i, i + 3).join(" "));
  return set;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function loadContent(contentDir) {
  const errors = [];
  const lexicons = parseLexicons(readFiles(path.join(contentDir, "lexicon")), errors);
  const lines = parseLines(readFiles(path.join(contentDir, "lines")), errors);
  const chains = parseChains(readFiles(path.join(contentDir, "chains")), errors);
  return { lexicons, lines, chains, errors };
}

// Full check. `onlyFiles` limits per-line problems to those files (cross-file duplicate
// checks still look at everything).
export function checkContent(content, { onlyFiles = null, nearDuplicates = true } = {}) {
  const { lexicons, lines, chains } = content;
  const problems = [...content.errors];
  const lexLengths = lexiconLengths(lexicons);
  const mine = (file) => !onlyFiles || onlyFiles.includes(file);

  // Lexicon entries: nested slots must resolve.
  for (const lex of Object.values(lexicons)) {
    for (const e of lex.entries) {
      for (const t of [e.s, e.p].filter(Boolean)) {
        try {
          for (const s of slotsOf(parseTemplate(t)).slots) if (!lexicons[s.name] && !CONTEXT_SLOTS[s.name]) problems.push(`${e.where}: unknown slot {${s.name}} in lexicon entry`);
        } catch (error) {
          problems.push(`${e.where}: ${error.message}`);
        }
      }
    }
  }

  const validTag = (tag) => {
    if (CONTEXT_TAGS.includes(tag)) return true;
    if (tag.startsWith("act:")) return ACTIVITY_IDS.includes(tag.slice(4));
    return /^furniture:[a-zA-Z]+$/.test(tag);
  };
  for (const line of lines) {
    if (!mine(line.file)) continue;
    problems.push(...checkTemplate(line.text, line.where, lexicons, lexLengths));
    for (const tag of line.tags) if (!validTag(tag)) problems.push(`${line.where}: unknown tag "${tag}"`);
    if (line.category && !/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)?$/.test(line.category)) problems.push(`${line.where}: category looks wrong: "${line.category}"`);
  }

  const chainIds = new Map();
  for (const chain of chains) {
    if (chainIds.has(chain.id)) problems.push(`${chain.where}: chain "${chain.id}" also at ${chainIds.get(chain.id)}`);
    chainIds.set(chain.id, chain.where);
    if (!mine(chain.file)) continue;
    const required = chain.steps.filter((s) => !s.optional).length;
    const total = chain.steps.length;
    if (!chain.steps.length || !chain.steps[chain.steps.length - 1].end) problems.push(`${chain.where}: chain "${chain.id}" must end with one "=" step`);
    if (chain.steps.filter((s) => s.end).length > 1) problems.push(`${chain.where}: more than one "=" ending`);
    if (required < 3 || total > 10) problems.push(`${chain.where}: chain "${chain.id}" has ${required}-${total} steps (needs 3 to 10)`);
    if (!/^(idle|any|night|act:[A-Za-z]+)$/.test(chain.start) || (chain.start.startsWith("act:") && !ACTIVITY_IDS.includes(chain.start.slice(4)))) problems.push(`${chain.where}: bad @start "${chain.start}"`);
    for (const tag of chain.tags) if (!validTag(tag)) problems.push(`${chain.where}: unknown tag "${tag}"`);
    if (!chain.topic) problems.push(`${chain.where}: chain "${chain.id}" needs a @topic`);
    for (const step of chain.steps) for (const alt of step.alts) problems.push(...checkTemplate(alt.text, alt.where, lexicons, lexLengths));
  }

  // Duplicates across everything (exact after normalising), near-duplicates within files I own.
  const seen = new Map();
  const all = [
    ...lines.map((l) => ({ text: l.text, where: l.where, file: l.file })),
    ...chains.flatMap((c) => c.steps.flatMap((s) => s.alts.map((a) => ({ text: a.text, where: a.where, file: c.file })))),
  ];
  for (const item of all) {
    const key = normalise(item.text);
    if (seen.has(key) && (mine(item.file) || mine(seen.get(key).file))) problems.push(`${item.where}: duplicate of ${seen.get(key).where}`);
    else seen.set(key, item);
  }
  if (nearDuplicates) {
    const grams = all.map((item) => ({ ...item, g: trigrams(item.text) }));
    for (let i = 0; i < grams.length; i += 1) {
      if (!mine(grams[i].file) || grams[i].g.size < 4) continue;
      for (let j = 0; j < grams.length; j += 1) {
        if (j === i || grams[j].g.size < 4) continue;
        if (j < i && mine(grams[j].file)) continue;
        if (jaccard(grams[i].g, grams[j].g) >= 0.85) problems.push(`${grams[i].where}: nearly the same as ${grams[j].where}`);
      }
    }
  }

  return [...new Set(problems)];
}

export function stats(content) {
  const byCategory = {};
  for (const l of content.lines) byCategory[l.category] = (byCategory[l.category] ?? 0) + 1;
  const templated = content.lines.filter((l) => l.text.includes("{")).length;
  return {
    lines: content.lines.length,
    templated,
    chains: content.chains.length,
    lexicons: Object.keys(content.lexicons).length,
    lexiconEntries: Object.values(content.lexicons).reduce((s, l) => s + l.entries.length, 0),
    byCategory,
  };
}
