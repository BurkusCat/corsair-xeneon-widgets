// Plan usage samples recorded by the Claude desktop app in <desktopDir>/plan-usage-history.json.
//
// Format (version 2, internal): { version: 2, samples: [{ t, org, u: { fh, sd, so, sn, ... } }] }
// where the keys abbreviate the usage API's windows (fh = five_hour, sd = seven_day,
// so = seven_day_opus, sn = seven_day_sonnet, xu = extra usage) and values are percentages.
// The app appends a sample at most every 4.5 minutes, only when it fetched usage, and stores
// no reset times. A window missing from a sample was not reported for the plan.

import path from "node:path";
import { readJsonCached } from "../json-files.mjs";

const KEYS = { fh: "fiveHour", sd: "sevenDay", so: "sevenDayOpus", sn: "sevenDaySonnet", xu: "extraUsage" };

export function readPlanUsageSamples(desktopDir) {
  if (!desktopDir) return [];
  const raw = readJsonCached(path.join(desktopDir, "plan-usage-history.json"));
  const samples = Array.isArray(raw?.samples) ? raw.samples : [];
  const out = [];
  for (const sample of samples) {
    if (!Number.isFinite(sample?.t)) continue;
    // Version 1 stored fh/sd at the top level.
    const values = sample.u && typeof sample.u === "object" ? sample.u : sample;
    const windows = {};
    for (const [key, name] of Object.entries(KEYS)) {
      if (Number.isFinite(values[key])) windows[name] = values[key];
    }
    out.push({ t: sample.t, org: sample.org ?? null, windows });
  }
  return out.sort((a, b) => a.t - b.t);
}
