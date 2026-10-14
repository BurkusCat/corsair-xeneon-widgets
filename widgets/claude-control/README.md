# Claude Control

A XENEON EDGE widget for Claude Code (terminal and the Claude desktop app's Code tab).

- **Needs you**: permission prompts, questions, failed turns and finished turns you have not
  looked at, longest-waiting first. The widget edge glows while something is waiting.
- **Tap to switch**: opens the session in the Claude desktop app, or brings a terminal session's window forward.
- **Context** used by every session, with a warning colour as it fills.
- **Plan usage**: 5-hour and weekly windows, reset countdowns, and your current pace
  (for example "~22%/h · 5-hour limit ≈ 16:40").
- **Shortcuts**: jump to the next waiting session, continue the last one, or start a new session in a pinned or recent folder.
- **Today**: active sessions, lines added and removed, API-equivalent cost (when known).

Layouts adapt to every EDGE widget size (S, M, L, XL) and to portrait mounting.

## Setup

1. **Package and import the widget**

   ```bash
   npm install
   npm run package -- claude-control
   ```

   In iCUE, open the Widgets panel, press **+**, and choose `dist/claude-control.icuewidget`.
   Approve the `localhost:47821` permission. Add the widget to the EDGE at any size.

2. **Run the bridge.** The widget reads everything through it.

   ```bash
   npm run bridge:claude
   ```

   To start it automatically at sign-in, with no window:

   ```bash
   powershell -ExecutionPolicy Bypass -File widgets/claude-control/bridge/install-startup.ps1
   ```

3. **Optional: live usage with reset times and richer prompts.** This adds a status line and
   async hooks to `~/.claude/settings.json`. A backup is written first, and `--remove` undoes it.

   ```bash
   node widgets/claude-control/bridge/setup.mjs            # preview the change
   node widgets/claude-control/bridge/setup.mjs --apply
   ```

   Without this, usage comes from the desktop app's own history: percentages only, refreshed
   whenever the app checks.

## Settings (in iCUE)

| Setting | Effect |
|---|---|
| Pinned folders | `;`-separated folders offered as "new session" buttons, before recent ones |
| Show idle sessions | hide sessions with nothing happening |
| Context warning | % at which the context bar turns amber (red at 60% of the way to full) |
| Glow when Claude needs you | the pulsing edge glow |
| Open sessions via | **iCUE** (default, best focus behaviour) or **Bridge** |
| Bridge token | must match `token` in `bridge/config.json`, if you set one |

Bridge options go in `bridge/config.json` (see `config.example.json`): `token`,
`recentHours`, `unseenHours`, `maxSessions`, `quickStartFolders`, `contextWindows`.

## Preview without the EDGE

With the bridge running, open http://localhost:47821/preview/ to see every widget size, with
demo data or your real sessions.

## Privacy

Everything stays on this PC. The bridge listens on 127.0.0.1 only and refuses requests from
web pages. It stores only plan usage percentages. Hook data is held in memory as short
summaries.
