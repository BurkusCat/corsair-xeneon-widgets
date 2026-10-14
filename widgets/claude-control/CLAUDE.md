# Claude Control (widget + bridge)

An XENEON EDGE widget for Claude Code. It shows which sessions need you (permission prompts,
questions, failures, finished turns you have not seen), the context used by each session,
and plan usage for the 5-hour and weekly windows with a pace projection. A tap switches to a
session or starts a new one.

```
Claude Code (terminal + desktop app)                         iCUE (XENEON EDGE)
  ~/.claude/sessions/*.json           ─┐                     widget/ (file://)
  ~/.claude/projects/**/<id>.jsonl     │   bridge/server.mjs   │  GET  /api/state every 1.5 s
  %APPDATA%\Claude\claude-code-       ├──► 127.0.0.1:47821 ◄──┤  POST /api/... on tap
    sessions\**\local_*.json           │   (Node, no deps)     │  or plugins.Linkprovider.open(claude://...)
  %APPDATA%\Claude\plan-usage-        ─┘        ▲
    history.json                                │ POST /ingest/statusline, /ingest/hook
  status line + hooks (optional) ───────────────┘ (bridge/statusline.mjs, bridge/hook.mjs)
```

A widget cannot read local files or start processes, so everything goes through the bridge.

## Files

| Path | Role |
|---|---|
| `widget/manifest.json` | id `uk.co.burkus.claude-control`, `localhost:47821` url permission, Link Provider plugin |
| `widget/index.html` | settings (`x-icue-property`), groups, the skeleton DOM |
| `widget/scripts/app.js` | polling, layout pick (xl/l/m/s/tall), rendering, tap actions (classic script) |
| `widget/styles/widget.css` | all styling; rem units, root font size set by app.js from the viewport |
| `bridge/server.mjs` | HTTP server, request guards, static preview; `--print` dumps one snapshot |
| `bridge/lib/sources/*.mjs` | one reader per data source (see below) |
| `bridge/lib/snapshot.mjs` | merges sources, derives each session's state, sorts by urgency (pure) |
| `bridge/lib/usage.mjs` | merges usage sources, pace and limit projection (pure) |
| `bridge/lib/feeds.mjs` | in-memory store for status line and hook pushes; persists usage samples |
| `bridge/lib/actions.mjs` | deep links and terminal focus; the only code with side effects |
| `bridge/lib/mock.mjs` | demo snapshot for `?mock=1` (keep it sorted like real output) |
| `bridge/preview/` | `/preview/` harness (all sizes in iframes) and `shim.js` (fake iCUE globals) |
| `bridge/setup.mjs` | prints, `--apply`s or `--remove`s the status line and hooks in `~/.claude/settings.json` |
| `bridge/install-startup.ps1`, `start-hidden.vbs` | start the bridge at sign-in, with no window |

## Data sources

Documented interfaces are preferred. The internal ones are read defensively: unknown fields
are ignored and a missing file means "no data". Each reader's header comment holds the format
as observed. Versions seen: Claude Code 2.1.295, desktop 2.37337.

| Source | Gives | Status |
|---|---|---|
| `~/.claude/sessions/<pid>.json` | running sessions: `status` busy/waiting/idle/shell, `waitingFor` ("permission prompt", "input needed", "dialog open"), `hostSessionId` (desktop id), `entrypoint` | Internal format; the same registry backs the documented `claude agents --json`. Stale files are filtered by checking the pid. |
| `<desktop>/claude-code-sessions/<install>/<org>/local_*.json` | every desktop Code session: title, cwd, model, effort, archived, `lastActivityAt`/`lastFocusedAt`, `postTurnSummary` {status_category, status_detail, needs_action} | Internal. The app treats `status_category` blocked/need_input/failed as "needs input". The summary is current only when `postTurnSummaryFor === lastAssistantUuid`. |
| `~/.claude/projects/<slug>/<sessionId>.jsonl` | context tokens (last main-thread assistant `usage`, input + cache tokens), model, git branch, last prompt, cost and lines | The path is documented; line format internal. Only the last 768 KB is read, cached by size+mtime. `compact_boundary` after the last usage means the old size no longer applies. |
| `<desktop>/plan-usage-history.json` | 5-hour/weekly utilisation % (`u.fh`, `u.sd`, ...), sampled at most every 4.5 min, **no reset times** | Internal. A missing window means the plan does not report it. |
| status line (`bridge/statusline.mjs`) | `rate_limits.five_hour/seven_day` {used_percentage, resets_at (epoch s)}, exact `context_window` | Documented. Account-wide limits, Pro/Max only. Not known to run in desktop sessions. |
| hooks (`bridge/hook.mjs`, async) | PermissionRequest tool summary, Notification, Stop (turn done + preview), UserPromptSubmit, SessionEnd | Documented. Hooks run in desktop sessions too. Only short summaries are kept. |

`<desktop>` is `%APPDATA%\Claude` or the MSIX copy under
`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude`; `findDesktopDir` picks whichever
holds `claude-code-sessions`.

Context window: from the status line when present, otherwise `context.mjs` decides: current
models (Fable/Mythos 5.x, Opus/Sonnet/Haiku 5.x, Opus/Sonnet 4.6+) are 1M, older ones 200K,
and `[1m]` always means 1M. `contextWindows` in config overrides both.

There is deliberately no OAuth usage-endpoint client. `/api/oauth/usage` is undocumented and
needs the user's credentials; don't add it without asking.

## State model (snapshot.mjs `deriveState`)

Ranked most urgent first. Waiting and working sessions sort by longest-waiting; done and idle by most recent.

1. `permission`: live `status: waiting` with waitingFor "permission prompt", or a PermissionRequest hook that arrived within 5 s of the wait starting.
2. `input`: any other live wait, or a current desktop summary of blocked/need_input.
3. `failed`: a current summary of failed, or a StopFailure hook.
4. `done`: a finished turn not seen yet. Desktop: `lastActivityAt > lastFocusedAt`, it is not the most recently focused session (assumed on screen), and it finished less than `unseenHours` (12) ago. Terminal: a Stop hook with no prompt since.
5. `busy`: live `status: busy`.
6. `idle`: everything else.

Listed: every running session; non-archived desktop sessions active within `recentHours` (24);
and permission/input/failed desktop sessions for up to 7 days. `next` is the first
attention-state session, which the "Jump to next" button opens.

## Bridge API

All on `127.0.0.1:47821`. **The port appears in three places**: `bridge/lib/config.mjs`
(`DEFAULT_PORT`), `widget/manifest.json` (permission), and `widget/scripts/app.js` (`BRIDGE`).
Change all three together.

| Route | Purpose |
|---|---|
| `GET /api/state[?mock=1]` | the snapshot (trimmed to `maxSessions`); `mock=1` returns demo data |
| `POST /api/sessions/<key>/open` | desktop: `claude://code/continue?session=<local id>`; terminal: bring the hosting window forward; `mock-*` keys: dry run |
| `POST /api/next` | open `snapshot.next` |
| `POST /api/new` `{folder, prompt?, dryRun?}` | `claude://code/new?folder=...&q=...` |
| `POST /api/continue-last`, `POST /api/needs-input` | the desktop app's own entry points |
| `POST /ingest/statusline`, `POST /ingest/hook` | feed pushes |
| `GET /health`, `/preview/`, `/widget/*` | liveness, preview harness, widget files with the shim injected |

Snapshot shape: `{ version, generatedAt, bridge{version, statuslineAt, hookAt, warnings},
usage{fiveHour, sevenDay: {percent, observedAt, source, resetsAt?, pace?{percentPerHour, limitAt?, beforeReset?}} | null},
counts{<state>: n}, today{sessions, linesAdded, linesRemoved, costUsd}, next, sessions[], quickStart[] }`.
Session fields are built in `describe()` in snapshot.mjs. Additive changes are fine. Renames
break installed widgets until they are re-imported.

## Desktop deep links

Read from the desktop app's URL handler. Only `/new` with `ssh_*` parameters is documented.

- `claude://code/continue?session=<local_id|last>` opens that non-archived Code session.
- `claude://code/needs-input[?session=<local_id>]` opens the oldest session with a pending permission. The id is only honoured if that session is waiting.
- `claude://code/new?folder=<abs path>&q=<prompt>` opens the new-session screen. The prompt is never sent automatically.
- `claude://resume?session=<cli uuid>` imports a terminal session into the desktop app (not used).

If these stop working after a desktop update, search `app.asar` in
`C:\Program Files\WindowsApps\Claude_*\app\resources\` for `claudeURLHandler`. The folder
can't be listed, but the file reads fine.

The widget opens links with iCUE's Link Provider when it can: iCUE handled the touch, so
Windows lets the launched app take focus. The bridge path (`explorer.exe <url>`) is the
fallback, and the "Open sessions via" setting chooses between them. Terminal sessions can't be
deep-linked: `focusProcessWindow` walks up the parent processes to the first window and focuses
it. That brings the whole window forward, but cannot select a Windows Terminal tab.

## Security model

- The bridge listens on 127.0.0.1 only, and the `Host` must be `localhost:<port>` or `127.0.0.1:<port>` (blocks DNS rebinding).
- `/api/*` accepts no Origin, `null` (iCUE), or the bridge's own origin. Anything else gets 403.
- `/ingest/*` rejects any request with an Origin header, so browsers can't post feeds.
- Optional `token` (config or `CLAUDE_CONTROL_TOKEN`) is required as `X-Claude-Control-Token`; the widget sends its "Bridge token" setting. Turn it on if `null`-origin pages are a concern: sandboxed iframes also send `Origin: null`.
- Actions never pass request data to a shell. Desktop ids must match `^local_[A-Za-z0-9-]{1,64}$`. Folders must be absolute, local and existing. URLs are built with URLSearchParams. PowerShell gets `-EncodedCommand` with an integer pid.
- Feeds keep summaries only, never full prompts, tool input or file contents. Only usage samples are written to disk (`%LOCALAPPDATA%\ClaudeControlBridge\usage-samples.json`).

## Develop and verify

```bash
npm run bridge:claude                                   # from the repo root
node widgets/claude-control/bridge/server.mjs --print   # one snapshot from real data
npm test                                                # unit + HTTP tests
npm run validate -- claude-control && npm run package -- claude-control
```

- Preview: http://localhost:47821/preview/ shows every size, with demo data by default. For a
  single widget, use `/widget/index.html?mock=1`; add any setting as a query param, e.g.
  `&showIdle=false&accentColor=%2300aaff`.
- The bridge must be restarted after changing `bridge/`. Widget files are served fresh on every request.
- Check all five layouts (xl, l, m, s, tall) after UI changes, using headless Edge screenshots
  at full size (see the root CLAUDE.md). Mock data covers every state.
- When testing feeds, run a second bridge on another port with a scratch data dir
  (`CLAUDE_CONTROL_PORT=47999 CLAUDE_CONTROL_DATA_DIR=...`) so fake rate limits don't land in
  the real usage history.
- `setup.mjs --apply` and `install-startup.ps1` change the user's machine. Run them only when asked.

## Backlog

- Approve or deny permission prompts from the touchscreen through a blocking `PermissionRequest`
  hook that waits for a tap. Needs a careful design: it races the desktop's own prompt, and
  touch approval of shell commands needs guarding.
- Quick replies to a waiting session. The desktop's peer-messaging pipe (`messagingSocketPath`
  in the session registry) is undocumented, so not yet.
- Toggle permission mode, model or effort per session; a Windows toast on new attention items.
