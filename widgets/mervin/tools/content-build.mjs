// Compiles content/ into widget/scripts/content.js (window.MERVIN_CONTENT). Called by build.mjs.
// Fails the build on any content problem, so a bad line never ships. With `lenient` (dev
// builds while content is being written), files with problems are left out instead.

import { checkContent, loadContent, stats } from "./content-format.mjs";

export function compileContent(contentDir, { lenient = false } = {}) {
  let content = loadContent(contentDir);
  let problems = checkContent(content, { nearDuplicates: false });
  const skipped = new Set();
  if (problems.length && lenient) {
    for (const p of problems) skipped.add(p.split(":")[0]);
    content = {
      ...content,
      lines: content.lines.filter((l) => !skipped.has(l.file)),
      chains: content.chains.filter((c) => !skipped.has(c.file)),
    };
    problems = [];
  }
  if (problems.length) {
    throw new Error(`Content problems (run node widgets/mervin/tools/content-lint.mjs):\n  ${problems.slice(0, 30).join("\n  ")}${problems.length > 30 ? `\n  ...and ${problems.length - 30} more` : ""}`);
  }
  const lexicons = {};
  for (const [name, lex] of Object.entries(content.lexicons)) {
    lexicons[name] = { kind: lex.kind, entries: lex.entries.map((e) => (e.p ? { s: e.s, p: e.p } : { s: e.s })) };
  }
  const lines = content.lines.map((l, i) => ({ id: i, c: l.category, t: l.tags, w: l.weight, x: l.text }));
  const chains = content.chains.map((c) => ({
    id: c.id,
    topic: c.topic,
    start: c.start,
    tags: c.tags,
    steps: c.steps.map((s) => ({ o: s.optional ? 1 : 0, e: s.end ? 1 : 0, a: s.alts.map((a) => a.text) })),
  }));
  const data = { lexicons, lines, chains };
  const s = stats(content);
  return {
    script: `window.MERVIN_CONTENT = ${JSON.stringify(data)};\n`,
    stats: `${s.lines} lines (${s.templated} with slots), ${s.chains} chains, ${s.lexicons} lexicons / ${s.lexiconEntries} entries${skipped.size ? `; skipped ${[...skipped].join(", ")}` : ""}`,
  };
}
