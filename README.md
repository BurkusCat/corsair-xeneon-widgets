# corsair-xeneon-widgets

Custom iCUE widgets for the Corsair XENEON EDGE touchscreen.

| Widget | What it does |
|---|---|
| [Claude Control](widgets/claude-control/README.md) | Claude Code at a glance: sessions waiting for you, context per session, 5-hour and weekly plan usage, one-tap switching |
| [Mervin](widgets/mervin/README.md) | A very relaxed alien from Planet 6 in a little 3D flat. He potters about, says things, and tells you about home when you tap him |

## Build

Requires Node.js 20+ and iCUE 5.47+.

```bash
npm install
npm run validate
npm run package
npm test
```

Packages land in `dist/`. In iCUE, open the Widgets panel, press **+**, and choose the `.icuewidget` file.
