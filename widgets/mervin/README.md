# Mervin

Mervin is a very relaxed alien from Planet 6. He lives in a little 3D studio flat on your
XENEON EDGE.

- **He potters about.** He makes tea, raids the fridge, burns toast, waters Barry the plant,
  feeds Kevin the goldfish and naps on the sofa. He also dances to his one record, floats
  cross-legged above the rug, tries on hats, pops out and comes back with strange things, and
  sometimes walks right up to the glass to have a look at you.
- **He talks.** Every 15 seconds to 2 minutes he says something about Earth, about home, or
  about what he's doing. There are nearly 3,000 lines, and many of them change a little each
  time.
- **Tap him to chat.** He stops, turns to you, and starts a chain of thought. Tap again within
  30 seconds to hear the next bit, and keep going to the end; a golden dot on the bubble means
  there's more. If you stop tapping, he trails off and may pick up where he left off later.
- **Tap the furniture** and he'll go and use it: the fridge, kettle, toaster, sofa, bed, record
  player, goldfish, window, plant, wardrobe, front door, lamp or the TV remote.
- **His flat follows your clock.** It's sunny by day and lamplit at night, with the odd rainy
  spell. He goes to bed around 11pm and talks in his sleep; tap him and he wakes up, groggily.
- **He remembers you.** That includes how many days you've been housemates, the stories he's
  already told you, and a story you left halfway through.

## Install

```bash
npm install
npm run package -- mervin
```

In iCUE, open the Widgets panel, press **+**, and choose `dist/mervin.icuewidget`. Add it at
any size; XL shows the whole flat. In smaller sizes and portrait the camera follows him around.

## Settings (in iCUE)

| Setting | What it does |
|---|---|
| Quality | Low / Balanced / High: render resolution and shadow detail. Try Low if the EDGE stutters |
| Chattiness | How often he speaks on his own. 50 % is every 15 s to 2 min; 0 % means only when tapped |
| Bubble text size | 80 to 140 % |
| Day and night follow the clock | Off keeps it a sunny afternoon forever |
| Smooth motion (30 fps) | On by default. iCUE asks this widget for only 10 frames a second; this draws up to 30, which the EDGE shows. Turn it off to save a little GPU |

## Preview without the EDGE

```bash
npm run preview
```

Open http://127.0.0.1:47900/?widget=mervin to see every size side by side, change settings
live, and tap him with the mouse. Add `debug=1&now=21:30` in "Extra query" to see his state and
try other times of day.

## Privacy

Mervin works entirely offline. He stores his memories (taps, stories told, days together) in
the widget's local storage on this PC.
