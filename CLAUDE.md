# Corsair XENEON EDGE widgets

Custom iCUE HTML widgets for the Corsair XENEON EDGE, a 14.5" 2560×720 touchscreen that
iCUE treats as a `dashboard_lcd` device. The repo holds many widgets, one per folder.

## Layout

```
widgets/<name>/
  widget/      what ships: the icuewidget CLI zips EVERY file in this folder into the package
  bridge/      optional local companion process (Node, zero dependencies) the widget talks to
  CLAUDE.md    widget-specific architecture, data sources, gotchas
  README.md    user-facing setup
scripts/widgets.mjs   validate/package every widgets/*/widget with Corsair's CLI
dist/                 build output (git-ignored)
```

Never put tests, docs, configs or secrets inside a `widget/` folder: they would be packaged.
Each widget's own CLAUDE.md is the source of truth for that widget; read it before changing one.

Current widgets:
- `claude-control`: Claude Code sessions, attention queue, context and plan usage, plus a bridge. See widgets/claude-control/CLAUDE.md.

## Commands

```bash
npm install                                  # installs icuewidget-cli (Corsair's official CLI, pinned)
npm run validate                             # validate every widget (or: npm run validate -- <name>)
npm run package                              # -> dist/<name>.icuewidget
npm test                                     # node:test suites in widgets/*/bridge/test
npm run list                                 # widget folder, manifest id, version
```

Install a package into iCUE: Widgets panel, then **+**, then pick the `.icuewidget` (or
double-click it). Bump `manifest.version` for every build you import. iCUE unpacks it into
`%APPDATA%\Corsair\CUE5\html_widgets\<id, dots as folders>\` and loads it from `file://`.

New widget: `npx icuewidget init widgets/<name>/widget`, then follow the rules below. The CLI
template writes a flat `translation.json`; the bundled Corsair widgets use
`{ "en": { "translation": { ... } } }`, so match those.

## iCUE widget platform: verified facts

Checked against iCUE 5.52, icuewidget-cli 0.4.49 and https://docs.elgato.com/icue/widgets/
(Widget API 1.9). The CLI source (node_modules/icuewidget-cli/src-node/validation.js) is the
best reference for what iCUE rejects.

- **`<head>` is parsed as strict XML** (Qt QDomDocument) on import. Void elements must
  self-close: `<meta ... />`, `<link ... />`. Otherwise iCUE reports "Missing Title Element".
- **Scripts are classic, not modules.** The validator compiles every referenced `.js` as a
  script, so `import`/`export` fails. Wrap code in an IIFE and assign globals on `window`.
- **Settings** are `<meta name="x-icue-property" content="name" data-type=... data-default=...>`.
  Each becomes a global named after `content`. `data-default` is a JS expression (`"'#fff'"`,
  `"50"`, `"true"`, `"tr('Label')"`). Allowed `data-type`: slider, switch, color, combobox,
  search-combobox, tab-buttons, textfield, media-selector, sensors-combobox, sensors-factory.
- **Groups** live in `<script type="application/json" id="x-icue-groups">`, must be valid JSON,
  and need at least one property each. A group titled like the widget merges into the default
  panel. On the XENEON EDGE, a group containing textColor/accentColor/backgroundColor gets a
  "Custom Style" toggle.
- **Lifecycle**: set `icueEvents = { onICUEInitialized, onDataUpdated }`. Globals are injected
  before your scripts run, but `iCUE_initialized` may already be true, so check it as well.
- **Manifest**: author, id, name, description, version, preview_icon, min_framework_version,
  min_app_version, os (`windows` only), supported_devices are required. Ids may contain only
  lowercase letters, digits, dots and hyphens. `interactive: true` (touch) works on `dashboard_lcd` only.
- **Network**: declare `{ "type": "url", "domain": "...", "port": N }`. Localhost needs a port,
  and `"any"` never covers localhost. Widget pages run from `file://`, so requests carry
  `Origin: null` and a local server must answer CORS for `null`.
- **Plugins** (`required_plugins`, then `window.plugins.<Name>` with a
  `plugin<Name>_initialized` flag): `widgetbuilder.linkprovider:Url:1.0` gives
  `plugins.Linkprovider.open(url)` (Qt.openUrlExternally), and there are sensors, media, fps,
  notifications, filesystem, device-action and Stream Deck providers. Async plugin calls use the
  `IcueWidgetApiWrapper` pattern in the bundled `common/plugins/`.
- **Sizes (px)**: S 840×344, M 840×696, L 1688×696, XL 2536×696, swapped when the EDGE is
  mounted in portrait. S and L have the same aspect ratio, so tell them apart by height.
  Keep text ≥ 16 px and touch targets ≥ 60 px. Widgets render at about 30 fps (`iCUE.fpsLimit`).
- **Storage**: `localStorage` persists per widget instance; key your data by the injected `uniqueId`.
- **Packaging**: put `index.html` first in the zip. The CLI sorts entries, which keeps it first
  unless a file name sorts before `index.html`.
- **Reference implementations**: `C:\Program Files\Corsair\Corsair iCUE5 Software\widgets\com\corsair\`
  (weather, calendar, sensorlist, streamdeck).
- **Logs**: `%LOCALAPPDATA%\Corsair\Logs\CUE5\*.log`. Grep `html_cache` for import and validation
  errors, and `js.executor` for plugin loading.

## Working in this repo

- You cannot run the iCUE runtime here. Verify in this order: `npm run validate`, the widget's
  browser preview (bridges serve one, with a shim for the iCUE globals), then full-size
  screenshots with headless Edge:
  `msedge --headless=new --window-size=2536,696 --screenshot=<file> <url>`. Use a fresh
  `--user-data-dir` per run, and wait for the PNG: it appears after the launcher exits.
- Node ≥ 20 and ES modules for tooling and bridges. Bridges have no runtime dependencies and
  use `node:test` for tests.
- Windows-specific traps on this machine:
  - The Microsoft Store Python sees a virtualised `%APPDATA%`, so files that exist are "missing". Use Node for scripts that read app data.
  - Git Bash collapses backslashes in arguments (`"D:\\Repos"` reaches the program as `D:\Repos`, then `\R` is an escape). Use `String.raw` in `node -e`, or PowerShell.
- Anything that changes the user's machine outside the repo needs the user's go-ahead first.
  That covers `~/.claude/settings.json`, the Startup folder, and installing into iCUE.
