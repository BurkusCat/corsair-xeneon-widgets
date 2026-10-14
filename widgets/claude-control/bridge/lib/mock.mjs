// Fixed demo data for GET /api/state?mock=1, used by the browser preview so the layout can
// be designed and screenshotted without real sessions. Times are relative to `now`.
// Actions on "mock-" keys are dry runs.

const MIN = 60_000;
const HOUR = 60 * MIN;

export function mockSnapshot(now = Date.now(), meta = {}) {
  const sessions = [
    {
      key: "mock-permission",
      title: "Migrate billing to Stripe v2",
      project: "payments-api",
      branch: "feat/stripe-v2",
      state: "permission",
      since: now - 2 * MIN,
      detail: "Bash: npm run db:migrate -- --env staging",
      modelLabel: "Opus 5.5",
      context: { tokens: 612_000, window: 1_000_000, percent: 61.2 },
      surface: "desktop",
      live: true,
    },
    {
      key: "mock-input",
      title: "Fix flaky checkout e2e test",
      project: "storefront",
      branch: "fix/checkout-flake",
      state: "input",
      since: now - 14 * MIN,
      detail: "Go-ahead to commit and push to main",
      modelLabel: "Sonnet 5.5",
      context: { tokens: 148_500, window: 1_000_000, percent: 14.9 },
      surface: "desktop",
      live: false,
    },
    {
      key: "mock-done",
      title: "Add dark mode toggle",
      project: "storefront",
      branch: "feat/dark-mode",
      state: "done",
      since: now - 9 * MIN,
      detail: "Toggle added to settings; 14 tests pass",
      modelLabel: "Sonnet 5.5",
      context: { tokens: 856_000, window: 1_000_000, percent: 85.6 },
      surface: "desktop",
      live: false,
    },
    {
      key: "mock-busy-1",
      title: "Refactor auth middleware",
      project: "gateway",
      branch: "main",
      state: "busy",
      since: now - 6 * MIN - 12_000,
      detail: "› split session refresh into its own module and add tests",
      modelLabel: "Opus 5.5",
      context: { tokens: 402_000, window: 1_000_000, percent: 40.2 },
      surface: "terminal",
      live: true,
    },
    {
      key: "mock-busy-2",
      title: "Write onboarding docs",
      project: "handbook",
      branch: "docs/onboarding",
      state: "busy",
      since: now - 48_000,
      detail: "› draft the local setup guide from the README",
      modelLabel: "Haiku 5.5",
      context: { tokens: 38_000, window: 1_000_000, percent: 3.8 },
      surface: "desktop",
      live: true,
    },
    {
      key: "mock-idle",
      title: "Investigate memory leak in worker",
      project: "jobs",
      branch: "main",
      state: "idle",
      since: now - 3 * HOUR,
      detail: "Heap snapshots compared; leak is in the retry queue",
      modelLabel: "Opus 5.5",
      context: { tokens: 233_000, window: 1_000_000, percent: 23.3 },
      surface: "desktop",
      live: false,
    },
  ].map((s) => ({ ...s, lastActivityAt: s.since, openUrl: s.surface === "desktop" ? "claude://code/continue?session=last" : undefined }));

  const counts = { permission: 1, input: 1, failed: 0, done: 1, busy: 2, idle: 1 };
  return {
    version: 1,
    generatedAt: now,
    mock: true,
    bridge: { ...meta, statuslineAt: now - 40_000, hookAt: now - 5_000 },
    usage: {
      fiveHour: {
        percent: 64,
        observedAt: now - 40_000,
        source: "statusline",
        resetsAt: now + 1 * HOUR + 52 * MIN,
        pace: { percentPerHour: 22.5, limitAt: now + 1 * HOUR + 36 * MIN, beforeReset: true },
      },
      sevenDay: {
        percent: 41,
        observedAt: now - 40_000,
        source: "statusline",
        resetsAt: now + 3 * 24 * HOUR + 5 * HOUR,
        pace: { percentPerHour: 0.4, limitAt: now + 6 * 24 * HOUR, beforeReset: false },
      },
    },
    counts,
    today: { sessions: 6, linesAdded: 1284, linesRemoved: 377, costUsd: 18.4 },
    next: "mock-permission",
    sessions,
    quickStart: [
      { folder: "C:\\Repos\\storefront", label: "storefront", pinned: true },
      { folder: "C:\\Repos\\payments-api", label: "payments-api", pinned: false },
      { folder: "C:\\Repos\\gateway", label: "gateway", pinned: false },
      { folder: "C:\\Repos\\handbook", label: "handbook", pinned: false },
    ],
  };
}
