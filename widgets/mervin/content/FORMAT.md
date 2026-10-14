# Content format

Everything Mervin says lives in plain text files in this folder. `build.mjs` compiles them into
`widget/scripts/content.js`; the build fails on any problem, so run the checker while writing:

```bash
node widgets/mervin/tools/content-lint.mjs                 # everything
node widgets/mervin/tools/content-lint.mjs food.txt        # just your files (duplicates still checked against all)
node widgets/mervin/tools/content-lint.mjs --stats         # counts per category
```

Read `BIBLE.md` first: it fixes his voice and the facts about Planet 6.

## Lexicons: `lexicon/*.txt`

Word lists for slots. One entry per line. `#` starts a comment.

```
@lexicon food
toast
cheese sandwich
spaghetti hoop
loaf of bread | loaves of bread     # irregular plural after "|"

@lexicon shrug
@kind phrase                        # not a noun: no plural, no article
honestly
to be fair
```

- Lexicon names are camelCase (`food`, `householdObject`) and unique across all files.
- Nouns are written singular, lower case unless proper (`Gary`). Plurals are automatic
  (`toast` -> `toasts`, `sandwich` -> `sandwiches`, `cup of tea` -> `cups of tea`); give an
  explicit plural after `|` when that would be wrong.
- Entries can contain slots, e.g. `my cousin {cousinName}`.

## Lines: `lines/*.txt`

One thing he might say per line. Directives are sticky until changed.

```
@category earth.food                # required; dotted lower camelCase
@tags                               # optional: ALL of these must hold for the line to be said
@weight 1                           # optional: relative chance (default 1)
Humans keep {food.pl} in a cold box. On {planet}, we keep them in a warm hat.
You can put butter on toast. You can put toast on butter. Only one of those is allowed here, apparently.

@tags act:makeToast
The toaster and I have an understanding. It goes ding. I go "oh".
```

Tags: `morning`, `afternoon`, `evening`, `night`, `weekend`, `weekday`, a day name (`Monday`),
`act:<activityId>` (only while doing that), `furniture:<id>` (tap reactions),
`firstDay` (first day together), `longTime` (after 30 days together).

Special categories (picked on purpose, not as random chatter):

| category | when |
|---|---|
| `sleep` | sleep-talk while asleep (short, dreamy, often starts with "Mm" or "...") |
| `wake` | woken by a tap |
| `greeting` | when the widget starts (use time-of-day tags for some) |
| `timeout` | you stopped tapping mid-chain: he trails off |
| `resume` | he picks a lapsed chain back up ("Where was I? Oh yeah.") |
| `tapFurniture` | you tapped a thing; tag `furniture:<id>` |
| `floorTap` | you tapped the floor; he glances at it |
| `returnHome` | back through the front door holding `{held}` |
| `peek` | right up close to the glass, talking to you |
| `viewer` | general remarks to you, the person watching |

Furniture ids: sofa, remote, coffeeTable, bed, bedside, plant, window, recordPlayer,
sideboard, goldfish, fridge, kettle, counterBack, counterRight, toaster, wardrobe, door,
clock, floorLamp, bistroTable, stool, rug, painting.

## Chains: `chains/*.txt`

A chain of thought: what he says when tapped, one bubble per tap.

```
@chain moons                        # unique id: lowercase words and hyphens
@topic space                        # required
@start idle                         # idle | any | night | act:<activityId> (see below)
@tags evening                       # optional context requirement
- Earth's got one moon. Just the one. I noticed.
  | You ever look at your moon? There's only one of it.
- We've got fourteen on {planet}. One of them's called Gary.
-? Gary is mostly a rock. A beige one.       # optional step: included half the time
- He doesn't really do anything. We love him anyway.
= Anyway. That's moons. I'm going to go lie down about it.
  | So, yeah. Moons. Glad we had this chat.
```

- `- ` a step, `-? ` an optional step, `| ` an alternative wording for the step above,
  `= ` the ending: exactly one, last, and it must clearly wrap the topic up.
- 3 to 10 steps counting the ending (optional steps count toward the 10).
- Give most steps one or two `|` alternatives so repeats feel different.
- `@start act:dance` means the chain opens by changing what he is doing: put the token on the
  first step, e.g. `- <act:dance> You know what? I'm going to have a little dance.`
  `@start night` chains are told late at night; `any` works anywhere, `idle` is the default.

## Templates

| write | gives |
|---|---|
| `{food}` | a random entry (`toast`) |
| `{food.pl}` | plural (`toasts`) |
| `{food.a}` | with "a" or "an" (`an apple`). Never write `a {food}`: the article would not match |
| `{food.cap}` | capitalised; mods combine: `{food.a.cap}` |
| `{food=x} ... {x.pl}` | pick once, reuse later in the line (`x` must not be a lexicon name) |
| `{right|correct|true}` | inline choice; options may contain slots |
| `{n:2-14}` | a number |
| `{planet}` | "Planet 6" |
| `{weekday}` `{partOfDay}` `{daysTogether}` `{hour}` `{time}` | from the clock and his memory |
| `{held}` | what he is holding (returnHome lines only) |

Tokens (anywhere in a line, removed from the text):
`<act:id>` change activity, `<face:wide|sleepy|squint|grin|blank|closed>`,
`<gesture:shrug|wave|think|nod|headShake|point|yawn|stretch|scratch>`.

Activity ids: stroll, idleStand, loungeSofa, watchTv, napSofa, napBed, sleepBed, readBed,
lookOutWindow, waterPlant, makeTea, raidFridge, makeToast, snackAtTable, dance,
floatMeditate, stretch, exercise, feedFish, checkClock, phoneHome, sweep, lieOnRug,
peekViewer, waveViewer, popOut, tryHats, mirror, playGame, followFly, admirePainting,
lavaLamp, toggleLamp.

## Rules the checker enforces

- Every expansion is 6 to 140 characters (aim for 40 to 110). Ends with punctuation.
- No exact or near duplicates anywhere. No emoji. At most one `!`. No shouting in capitals.
- British English: colour, favourite, mum, flat, holiday, biscuit, crisps, chips, rubbish.
- Every slot, tag and token must exist.
