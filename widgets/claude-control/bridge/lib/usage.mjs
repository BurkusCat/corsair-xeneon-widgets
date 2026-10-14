// Merge plan usage from the status line feed (has reset times) and the desktop app's
// history file (percentages only), then estimate the pace for each window.

const WINDOWS = {
  fiveHour: { durationMs: 5 * 60 * 60 * 1000, lookbackMs: 60 * 60 * 1000, minSpanMs: 10 * 60 * 1000 },
  sevenDay: { durationMs: 7 * 24 * 60 * 60 * 1000, lookbackMs: 24 * 60 * 60 * 1000, minSpanMs: 2 * 60 * 60 * 1000 },
};

export function buildUsage({ rateLimits = {}, feedSamples = [], planSamples = [], now = Date.now() }) {
  const usage = {};
  for (const [name, spec] of Object.entries(WINDOWS)) {
    const fromFeed = rateLimits[name];
    const fromDesktop = latestDesktop(planSamples, name);
    const window = resolveWindow(fromFeed, fromDesktop, now);
    if (!window) {
      usage[name] = null;
      continue;
    }
    const series = mergeSeries(feedSamples, planSamples, name);
    window.pace = estimatePace(series, window, spec, now);
    usage[name] = window;
  }
  return usage;
}

function latestDesktop(planSamples, name) {
  for (let i = planSamples.length - 1; i >= 0; i -= 1) {
    const value = planSamples[i].windows?.[name];
    if (Number.isFinite(value)) return { percent: value, at: planSamples[i].t };
  }
  return undefined;
}

export function resolveWindow(fromFeed, fromDesktop, now) {
  const candidates = [fromFeed && { ...fromFeed, source: "statusline" }, fromDesktop && { ...fromDesktop, source: "desktop" }]
    .filter((c) => c && Number.isFinite(c.percent) && Number.isFinite(c.at));
  if (!candidates.length) return undefined;
  const newest = candidates.reduce((a, b) => (b.at > a.at ? b : a));
  const knownReset = fromFeed?.resetsAt;

  const window = {
    percent: clampPercent(newest.percent),
    observedAt: newest.at,
    source: newest.source,
    resetsAt: knownReset && knownReset > now ? knownReset : undefined,
  };
  // The window rolled over after the newest observation: whatever it said no longer applies.
  if (knownReset && knownReset <= now && newest.at < knownReset) {
    window.percent = 0;
    window.resetSinceObserved = true;
  }
  return window;
}

function mergeSeries(feedSamples, planSamples, name) {
  const series = [];
  for (const s of feedSamples) if (Number.isFinite(s[name])) series.push({ t: s.t, p: s[name] });
  for (const s of planSamples) if (Number.isFinite(s.windows?.[name])) series.push({ t: s.t, p: s.windows[name] });
  return series.sort((a, b) => a.t - b.t);
}

export function estimatePace(series, window, spec, now) {
  if (window.resetSinceObserved) return undefined;
  const windowStart = window.resetsAt ? window.resetsAt - spec.durationMs : -Infinity;
  let points = series.filter((s) => s.t >= now - spec.lookbackMs && s.t >= windowStart && s.t <= now);
  // A drop means the window reset in between; only the points after it describe this window.
  for (let i = points.length - 1; i > 0; i -= 1) {
    if (points[i].p < points[i - 1].p) {
      points = points.slice(i);
      break;
    }
  }
  if (points.length < 2) return undefined;
  const first = points[0];
  const last = points.at(-1);
  const span = last.t - first.t;
  if (span < spec.minSpanMs) return undefined;

  const perMs = (last.p - first.p) / span;
  const pace = { percentPerHour: round1(perMs * 3_600_000) };
  if (perMs > 0) {
    const limitAt = last.t + (100 - last.p) / perMs;
    pace.limitAt = Math.round(limitAt);
    pace.beforeReset = window.resetsAt ? limitAt < window.resetsAt : undefined;
  }
  return pace;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
