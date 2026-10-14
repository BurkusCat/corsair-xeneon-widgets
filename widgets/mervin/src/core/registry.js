// Ids shared by the content (tokens like <act:dance>), the brain and the tests.

// Things Mervin does. brain/activities.js has a program for each.
export const ACTIVITY_IDS = [
  "stroll",
  "idleStand",
  "loungeSofa",
  "watchTv",
  "napSofa",
  "napBed",
  "sleepBed",
  "readBed",
  "lookOutWindow",
  "waterPlant",
  "makeTea",
  "raidFridge",
  "makeToast",
  "snackAtTable",
  "dance",
  "floatMeditate",
  "stretch",
  "exercise",
  "feedFish",
  "checkClock",
  "phoneHome",
  "sweep",
  "lieOnRug",
  "peekViewer",
  "waveViewer",
  "popOut",
  "tryHats",
  "mirror",
  "playGame",
  "followFly",
  "admirePainting",
  "lavaLamp",
  "toggleLamp",
];

// Short expressions for <face:...> (eyelids, jaw, head).
export const FACES = ["wide", "sleepy", "squint", "grin", "blank", "closed"];

// One-off body gestures for <gesture:...>.
export const GESTURES = ["shrug", "wave", "think", "nod", "headShake", "point", "yawn", "stretch", "scratch"];

// Context tags a line can require (all of a line's tags must hold for it to be said).
// Activity tags are "act:<id>"; weekday tags are the day names.
export const CONTEXT_TAGS = ["morning", "afternoon", "evening", "night", "weekend", "weekday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "rain", "firstDay", "longTime"];

// Categories with a special use (not general chatter).
export const SPECIAL_CATEGORIES = {
  sleep: "sleep-talk while asleep",
  greeting: "when the widget starts",
  timeout: "a chain lapsed: he trails off",
  resume: "picking up a lapsed chain",
  wake: "woken by a tap",
  tapFurniture: "tapped furniture (tag furniture:<id>)",
  floorTap: "glancing at a tapped spot",
  returnHome: "coming back through the door (with {held})",
  peek: "close to the lens, talking to the viewer",
};
