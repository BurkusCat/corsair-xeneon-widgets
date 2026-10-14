// Widget settings. Inside iCUE each x-icue-property is a global named after it; in a plain
// browser (file:// screenshots) there are no globals, so ?name=value query params stand in.

const DEFAULTS = {
  quality: "balanced",
  chattiness: 50,
  bubbleSize: 100,
  realTimeLighting: true,
  ignoreFpsLimit: true,
};

function parse(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
}

export function readSettings(params) {
  const settings = {};
  for (const [name, fallback] of Object.entries(DEFAULTS)) {
    let value = window[name];
    if ((value === undefined || value === null || value === "") && params.has(name)) value = parse(params.get(name));
    if (value === undefined || value === null || value === "") value = fallback;
    if (typeof fallback === "boolean") value = value === true || value === "true" || value === 1;
    if (typeof fallback === "number") value = Number.isFinite(Number(value)) ? Number(value) : fallback;
    settings[name] = value;
  }
  if (!["low", "balanced", "high"].includes(settings.quality)) settings.quality = DEFAULTS.quality;
  return settings;
}

export const QUALITY = {
  low: { renderScale: 0.6, shadowMap: 1024, sunShadows: false, mervinShadows: true, antialias: false },
  balanced: { renderScale: 0.8, shadowMap: 2048, sunShadows: true, mervinShadows: true, antialias: true },
  high: { renderScale: 1.0, shadowMap: 2048, sunShadows: true, mervinShadows: true, antialias: true },
};
