// Context window size for a model id, used when no status line report gives the exact
// `context_window.context_window_size`. Current Claude models (Fable/Mythos 5.x, Opus/Sonnet/
// Haiku 5.x, Opus/Sonnet 4.6+) have 1M-token windows; older ones 200K. A "[1m]" suffix
// always means 1M. Override per model with `contextWindows` in bridge/config.json.

const ONE_MILLION = 1_000_000;
const DEFAULT_WINDOW = 200_000;

const ONE_MILLION_MODELS = [
  /^claude-(fable|mythos)-/,
  /^claude-(opus|sonnet|haiku)-5\b/,
  /^claude-(opus|sonnet)-4-([6-9])\b/,
];

export function contextWindowFor(model, overrides = {}) {
  if (!model) return undefined;
  if (Number.isFinite(overrides[model])) return overrides[model];
  if (/\[1m\]$/i.test(model)) return ONE_MILLION;
  const base = model.replace(/\[.*\]$/, "");
  if (Number.isFinite(overrides[base])) return overrides[base];
  return ONE_MILLION_MODELS.some((pattern) => pattern.test(base)) ? ONE_MILLION : DEFAULT_WINDOW;
}

// "claude-opus-5-5" -> "Opus 5.5"; unknown ids are returned unchanged.
export function shortModelName(model) {
  if (!model) return undefined;
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model.replace(/\[.*\]$/, ""));
  if (!match) return model;
  const family = match[1][0].toUpperCase() + match[1].slice(1);
  return match[3] && match[3].length <= 2 ? `${family} ${match[2]}.${match[3]}` : `${family} ${match[2]}`;
}
