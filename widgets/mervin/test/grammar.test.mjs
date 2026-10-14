import assert from "node:assert/strict";
import test from "node:test";
import { article, createGrammar, lengthRange, parseTemplate, pluralise, splitTokens } from "../src/core/grammar.js";
import { createRng } from "../src/core/rng.js";

const lexicons = {
  food: { kind: "noun", entries: [{ s: "apple" }, { s: "sandwich" }, { s: "loaf of bread", p: "loaves of bread" }] },
  cousin: { kind: "phrase", entries: [{ s: "my cousin {food}" }] },
};

test("articles follow the sound of the word", () => {
  assert.equal(article("apple"), "an apple");
  assert.equal(article("hour"), "an hour");
  assert.equal(article("unicorn"), "a unicorn");
  assert.equal(article("sandwich"), "a sandwich");
});

test("plurals cover the common English endings and 'x of y'", () => {
  assert.equal(pluralise("sandwich"), "sandwiches");
  assert.equal(pluralise("pony"), "ponies");
  assert.equal(pluralise("cup of tea"), "cups of tea");
  assert.equal(pluralise("toast"), "toasts");
});

test("slots, modifiers, bindings, choices and numbers expand", () => {
  const g = createGrammar(lexicons, createRng(1));
  for (let i = 0; i < 50; i += 1) {
    const out = g.expand("I had {food.a}. Then {food=x}, then more {x.pl}. {n:2-5} times, {honestly|really}.");
    assert.doesNotMatch(out, /[{}]/);
    assert.match(out, /^I had an? (apple|sandwich|loaf of bread)\./);
    const n = Number(/(\d) times/.exec(out)[1]);
    assert.ok(n >= 2 && n <= 5);
    const bound = /Then (.+?), then more (.+?)\./.exec(out);
    const plural = bound[1] === "loaf of bread" ? "loaves of bread" : `${bound[1]}${bound[1].endsWith("ch") ? "es" : "s"}`;
    assert.equal(bound[2], plural);
  }
});

test("lexicon entries can contain slots, and output is capitalised", () => {
  const g = createGrammar(lexicons, createRng(2));
  assert.match(g.expand("{cousin} came round."), /^My cousin (apple|sandwich|loaf of bread) came round\.$/);
});

test("context values fill their slots", () => {
  const g = createGrammar(lexicons, createRng(3));
  assert.equal(g.expand("It's {weekday} on {planet}.", { weekday: "Tuesday", planet: "Planet 6" }), "It's Tuesday on Planet 6.");
});

test("tokens are stripped and returned", () => {
  const { text, tokens } = splitTokens("<act:dance> Right. <face:grin>Let's go.");
  assert.equal(text, "Right. Let's go.");
  assert.deepEqual(tokens, [
    { kind: "act", value: "dance" },
    { kind: "face", value: "grin" },
  ]);
});

test("bad templates are rejected", () => {
  assert.throws(() => parseTemplate("{unclosed"));
  assert.throws(() => parseTemplate("stray }"));
  assert.throws(() => parseTemplate("{bad slot!}"));
});

test("length range accounts for choices and lexicon lengths", () => {
  const [min, max] = lengthRange(parseTemplate("Hi {a|bbb} {food.a}."), { food: [5, 13] });
  assert.equal(min, "Hi a .".length + 5);
  assert.equal(max, "Hi bbb .".length + 13 + 3);
});
