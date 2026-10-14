import assert from "node:assert/strict";
import test from "node:test";
import { createMemory } from "../src/core/memory.js";
import { createPicker, timePhrase } from "../src/core/picker.js";
import { createRng } from "../src/core/rng.js";

const content = {
  lexicons: { thing: { kind: "noun", entries: [{ s: "kettle" }, { s: "sock" }] } },
  lines: [
    ...Array.from({ length: 20 }, (_, i) => ({ id: i, c: "earth.home", t: [], w: 1, x: `General line ${i} about {thing.a}.` })),
    { id: 20, c: "activity", t: ["act:makeTea"], w: 1, x: "Kettle's on." },
    { id: 21, c: "sleep", t: [], w: 1, x: "Mm... toast..." },
    { id: 22, c: "earth.time", t: ["Monday"], w: 1, x: "It's Monday." },
  ],
  chains: [
    { id: "a", topic: "x", start: "idle", tags: [], steps: [{ o: 0, e: 0, a: ["One."] }, { o: 1, e: 0, a: ["Two."] }, { o: 0, e: 1, a: ["End."] }] },
    { id: "b", topic: "x", start: "night", tags: [], steps: [{ o: 0, e: 0, a: ["Night."] }, { o: 0, e: 1, a: ["Bye."] }] },
    { id: "c", topic: "x", start: "act:dance", tags: [], steps: [{ o: 0, e: 0, a: ["<act:dance> Dance."] }, { o: 0, e: 1, a: ["Done."] }] },
  ],
};

const memoryStub = () => createMemory("t", null).data;

test("chatter never picks special categories and respects tags", () => {
  const picker = createPicker(content, createRng(1), memoryStub());
  for (let i = 0; i < 200; i += 1) {
    const line = picker.chatter(new Set(["afternoon"]), {});
    assert.ok(!/toast|Monday|Kettle/.test(line.text), line.text);
  }
});

test("lines for the current activity come up often", () => {
  const picker = createPicker(content, createRng(2), memoryStub());
  let tea = 0;
  for (let i = 0; i < 300; i += 1) if (picker.chatter(new Set(["act:makeTea"]), {}).text === "Kettle's on.") tea += 1;
  assert.ok(tea > 15, `${tea}`);
});

test("recently said lines are not repeated until most have been used", () => {
  const picker = createPicker(content, createRng(3), memoryStub());
  const seen = [];
  for (let i = 0; i < 10; i += 1) seen.push(picker.chatter(new Set(), {}).id);
  assert.equal(new Set(seen).size, 10);
});

test("special categories, chains and the telling of a chain", () => {
  const memory = memoryStub();
  const picker = createPicker(content, createRng(4), memory);
  assert.equal(picker.special("sleep", new Set(), {}).text, "Mm... toast...");
  assert.equal(picker.chain("night", new Set()).id, "b");
  assert.ok(["a", "c"].includes(picker.chain("idle", new Set()).id));
  memory.chainsDone.a = Date.now();
  memory.chainsDone.c = Date.now();
  assert.ok(picker.chain("idle", new Set()));
  const told = picker.tellChain(content.chains[0]);
  assert.ok(told.length === 2 || told.length === 3);
  assert.equal(told[told.length - 1].end, true);
});

test("times read the way people say them", () => {
  const at = (h, m) => timePhrase(new Date(2026, 9, 14, h, m));
  assert.equal(at(15, 0), "three o'clock");
  assert.equal(at(15, 15), "quarter past three");
  assert.equal(at(15, 30), "half past three");
  assert.equal(at(15, 45), "quarter to four");
  assert.equal(at(23, 50), "ten to twelve");
  assert.equal(at(9, 10), "ten past nine");
});

test("memory survives a reload and copes with broken storage", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let now = Date.UTC(2026, 9, 1);
  const first = createMemory("m", storage, () => now);
  first.data.taps = 7;
  first.data.chainsDone.socks = now;
  first.touch();
  first.save(true);
  now += 3 * 24 * 60 * 60 * 1000;
  const second = createMemory("m", storage, () => now);
  assert.equal(second.data.taps, 7);
  assert.equal(second.daysTogether(), 4);
  assert.equal(second.data.visits, 2);
  const broken = {
    getItem: () => "{not json",
    setItem: () => {
      throw new Error("full");
    },
  };
  const third = createMemory("m", broken);
  third.touch();
  third.save(true);
  assert.equal(third.data.taps, 0);
});
