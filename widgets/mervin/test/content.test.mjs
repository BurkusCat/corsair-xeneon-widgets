import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createGrammar, splitTokens } from "../src/core/grammar.js";
import { ACTIVITY_IDS } from "../src/core/registry.js";
import { createRng } from "../src/core/rng.js";
import { checkContent, loadContent, MAX_LENGTH } from "../tools/content-format.mjs";

const contentDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");
const content = loadContent(contentDir);

test("the content passes every check (format, slots, tags, lengths, duplicates, style)", () => {
  const problems = checkContent(content);
  assert.deepEqual(problems.slice(0, 20), []);
});

test("there are thousands of lines and over a hundred chains", () => {
  assert.ok(content.lines.length >= 2000, `${content.lines.length} lines`);
  assert.ok(content.chains.length >= 100, `${content.chains.length} chains`);
  const templated = content.lines.filter((l) => l.text.includes("{")).length;
  assert.ok(templated >= 400, `${templated} lines with slots`);
});

test("every activity has lines of its own", () => {
  for (const id of ACTIVITY_IDS) {
    const count = content.lines.filter((l) => l.tags.includes(`act:${id}`)).length;
    assert.ok(count >= 8, `${id} has ${count} lines`);
  }
});

test("the special situations are all covered", () => {
  const minimums = { sleep: 30, wake: 15, greeting: 20, timeout: 15, resume: 15, tapFurniture: 60, floorTap: 10, returnHome: 15, peek: 20 };
  for (const [category, min] of Object.entries(minimums)) {
    const count = content.lines.filter((l) => l.category === category).length;
    assert.ok(count >= min, `${category}: ${count}`);
  }
  for (const line of content.lines.filter((l) => l.category === "returnHome")) assert.match(line.text, /\{held\}/, line.where);
});

test("every chain has 3 to 10 steps and ends with an ending step", () => {
  for (const chain of content.chains) {
    const required = chain.steps.filter((s) => !s.optional).length;
    assert.ok(required >= 3 && chain.steps.length <= 10, chain.where);
    assert.ok(chain.steps[chain.steps.length - 1].end, chain.where);
  }
});

test("action chains open with their activity", () => {
  for (const chain of content.chains.filter((c) => c.start.startsWith("act:"))) {
    for (const alt of chain.steps[0].alts) {
      assert.ok(splitTokens(alt.text).tokens.some((t) => t.kind === "act"), `${alt.where}: first step lacks <act:...>`);
    }
  }
});

test("random expansions stay within the bubble limit and leave no slots behind", () => {
  const lexicons = Object.fromEntries(Object.entries(content.lexicons).map(([n, l]) => [n, { kind: l.kind, entries: l.entries }]));
  const g = createGrammar(lexicons, createRng(42));
  const values = { planet: "Planet 6", weekday: "Wednesday", partOfDay: "afternoon", daysTogether: 12, hour: 3, time: "twenty-five to four", held: "a bunch of bananas" };
  const all = [...content.lines.map((l) => l.text), ...content.chains.flatMap((c) => c.steps.flatMap((s) => s.alts.map((a) => a.text)))];
  let over = 0;
  for (const template of all) {
    for (let i = 0; i < 3; i += 1) {
      const out = g.expand(splitTokens(template).text, values);
      assert.doesNotMatch(out, /[{}<>]/, template);
      if (out.length > MAX_LENGTH + 10) over += 1;
    }
  }
  assert.equal(over, 0);
});
