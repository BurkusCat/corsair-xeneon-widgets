// Every widget's console output lands in the same iCUE log (as "js:" lines), so prefix ours.

export function log(...args) {
  console.log("[mervin]", ...args);
}

export function warn(...args) {
  console.warn("[mervin]", ...args);
}
