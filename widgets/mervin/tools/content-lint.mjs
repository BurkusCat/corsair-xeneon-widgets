#!/usr/bin/env node
// Checks Mervin's content files and prints every problem with file:line.
//
//   node widgets/mervin/tools/content-lint.mjs                  everything
//   node widgets/mervin/tools/content-lint.mjs food.txt tech.txt   only these files
//                                                                  (duplicates still checked against all)
//   --stats   counts per category

import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkContent, loadContent, stats } from "./content-format.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--")).map((f) => path.basename(f));
const content = loadContent(path.join(root, "content"));
const problems = checkContent(content, { onlyFiles: files.length ? files : null });
for (const p of problems) console.log(p);
if (args.includes("--stats") || !problems.length) {
  const s = stats(content);
  console.log(`${problems.length} problems. ${s.lines} lines (${s.templated} with slots), ${s.chains} chains, ${s.lexicons} lexicons / ${s.lexiconEntries} entries.`);
  if (args.includes("--stats")) console.log(s.byCategory);
}
process.exit(problems.length ? 1 : 0);
