// Mervin's brain: what he does, where he walks, what he says, and how he reacts to taps.
//
// Activities are generator programs (brain/activities.js) driven one frame at a time: a
// program yields to wait a frame and receives dt back. Helpers like walkTo, sitOn and wait
// are generators too, used with `yield*`. A chain of thought pauses the program (he stops
// and turns to you) and resumes it when the chain ends or lapses.

import * as THREE from "three";
import { hourOf, partOfDay, WEEKDAYS } from "../core/clock.js";
import { PEEK_Z, SPOTS, TAP_TARGETS, WALKABLE } from "../core/layout.js";
import { timePhrase } from "../core/picker.js";
import { ACTIVITIES } from "./activities.js";

const WALK_SPEED = 0.55;
const TURN_SPEED = 2.6;
const STRIDE = 0.62; // metres per full walk cycle (two steps)
const CHAIN_WAIT = 30;
const SUSPEND_KEEP_MS = 2 * 60 * 60 * 1000;
const UP = new THREE.Vector3(0, 1, 0);

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createBrain(deps) {
  const { mervin, room, lighting, nav, picker, memory, bubbles, props, clock, rng, camera } = deps;
  const rig = mervin.rig;
  const root = mervin.root;
  let settings = deps.settings;

  const state = {
    yaw: 0,
    extra: new THREE.Quaternion(), // lying down etc.
    speed: 0,
    program: null, // { id, gen, startedAt }
    programPose: "stand",
    paused: false,
    seated: null, // spot name while sitting or lying
    sleeping: false,
    away: false,
    energy: 0.85,
    chain: null,
    attention: null, // { savedYaw }
    cameraMode: "normal",
    look: null, // Vector3 | "viewer" | null
    glance: null, // { target, until }
    faceUntil: 0,
    gestureUntil: 0,
    gestureReturnPose: null,
    chatterIn: 6,
    sleepTalkIn: 30,
    greeted: false,
    history: {}, // activity id -> time last started (s)
    time: 0,
    currentActivity: null,
    hatUntil: 0,
    held: null,
    flyTarget: null,
  };

  const lookVec = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const yawQ = new THREE.Quaternion();

  // ---- Body helpers --------------------------------------------------------------------

  function applyRoot() {
    yawQ.setFromAxisAngle(UP, state.yaw);
    root.quaternion.copy(yawQ).multiply(state.extra);
  }

  function setPose(name, duration = 0.6) {
    state.programPose = name;
    if (!state.attention || state.chain?.action) rig.setPose(name, duration);
  }

  function cameraPos() {
    return camera.getWorldPosition(tmp).clone();
  }

  function contextTags() {
    const date = clock.date();
    const tags = new Set([partOfDay(hourOf(date)), WEEKDAYS[date.getDay()]]);
    tags.add(date.getDay() === 0 || date.getDay() === 6 ? "weekend" : "weekday");
    const days = memory.daysTogether();
    if (days <= 1) tags.add("firstDay");
    if (days >= 30) tags.add("longTime");
    if (state.currentActivity) tags.add(`act:${state.currentActivity}`);
    if (lighting.state.raining) tags.add("rain");
    return tags;
  }

  function values(extra = {}) {
    const date = clock.date();
    return {
      planet: "Planet 6",
      weekday: WEEKDAYS[date.getDay()],
      partOfDay: partOfDay(hourOf(date)),
      daysTogether: memory.daysTogether(),
      hour: ((date.getHours() + 11) % 12) + 1,
      time: timePhrase(date),
      held: state.held ?? "something",
      ...extra,
    };
  }

  // ---- Program helpers (generators) ----------------------------------------------------

  function* wait(seconds) {
    let t = 0;
    while (t < seconds) t += yield;
  }

  function* waitRange(min, max) {
    yield* wait(rng.range(min, max));
  }

  function* turnTo(target) {
    for (;;) {
      const d = angleDiff(state.yaw, target);
      if (Math.abs(d) < 0.03) {
        state.yaw = target;
        return;
      }
      const dt = yield;
      state.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN_SPEED * dt);
      state.turning = true;
    }
  }

  function* moveStraight(x, z, { speed = WALK_SPEED, face = true } = {}) {
    for (;;) {
      const dx = x - root.position.x;
      const dz = z - root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.03) {
        state.speed = 0;
        return;
      }
      const dt = yield;
      if (face) {
        const want = Math.atan2(dx, dz);
        const d = angleDiff(state.yaw, want);
        state.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN_SPEED * dt);
        // Turn mostly on the spot before setting off.
        if (Math.abs(d) > 0.9) {
          state.speed = 0.12;
          continue;
        }
      }
      const step = Math.min(dist, speed * dt);
      root.position.x += (dx / dist) * step;
      root.position.z += (dz / dist) * step;
      state.speed = speed;
    }
  }

  function* walkTo(target, { toSpot = true } = {}) {
    const spot = typeof target === "string" ? SPOTS[target] : null;
    const goal = spot ? spot.approach : target;
    if (state.seated) yield* getUp();
    setPose("stand", 0.4);
    const path = nav.findPath([root.position.x, root.position.z], goal) ?? [goal];
    for (let i = 1; i < path.length; i += 1) yield* moveStraight(path[i][0], path[i][1]);
    if (path.length === 1) yield* moveStraight(goal[0], goal[1]);
    if (spot && toSpot && !spot.seatY) yield* moveStraight(spot.at[0], spot.at[1]);
    state.speed = 0;
    if (spot) yield* turnTo(spot.facing);
  }

  // Tween the root (position, height, lying rotation) while the pose crossfades.
  function* tweenRoot(to, duration) {
    const from = { x: root.position.x, y: root.position.y, z: root.position.z, q: state.extra.clone(), yaw: state.yaw };
    const toQ = to.extra ?? from.q;
    let t = 0;
    while (t < duration) {
      t += yield;
      const k = Math.min(1, t / duration);
      const e = k * k * (3 - 2 * k);
      if (to.x !== undefined) root.position.x = from.x + (to.x - from.x) * e;
      if (to.y !== undefined) root.position.y = from.y + (to.y - from.y) * e;
      if (to.z !== undefined) root.position.z = from.z + (to.z - from.z) * e;
      if (to.yaw !== undefined) state.yaw = from.yaw + angleDiff(from.yaw, to.yaw) * e;
      state.extra.copy(from.q).slerp(toQ, e);
    }
  }

  // Sit on a seat spot (sofa, stool, bed edge): back up onto it facing the spot's direction.
  function* sitOn(spotName, pose = "sit") {
    const spot = SPOTS[spotName];
    yield* walkTo(spotName, { toSpot: false });
    yield* turnTo(spot.facing);
    setPose(pose, 0.8);
    state.seated = spotName;
    yield* tweenRoot({ x: spot.at[0], z: spot.at[1], y: spot.seatY - 0.41 }, 0.8);
  }

  // Lie down at a spot. layout: { at: [x, y, z], yaw, roll: "back" | "side" | "backLeft" }
  function* lieDown(spotName, layout, pose) {
    const q = new THREE.Quaternion();
    if (layout.roll === "back") q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    else if (layout.roll === "side") q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    setPose(pose, 1.0);
    state.seated = spotName;
    state.lying = true;
    yield* tweenRoot({ x: layout.at[0], y: layout.at[1], z: layout.at[2], yaw: layout.yaw ?? state.yaw, extra: q }, 1.1);
  }

  function* getUp() {
    if (!state.seated) return;
    const spot = SPOTS[state.seated];
    setPose("stand", 0.8);
    const approach = spot ? spot.approach : [root.position.x, Math.min(WALKABLE.maxZ, root.position.z + 0.4)];
    const upright = new THREE.Quaternion();
    yield* tweenRoot({ x: approach[0], z: approach[1], y: 0, extra: upright }, state.lying ? 1.1 : 0.7);
    state.seated = null;
    state.lying = false;
    state.sleeping = false;
    rig.setLidOverride(null);
  }

  function say(category, extraValues, kind = "chatter") {
    if (bubbles.active || state.chain) return null;
    const line = category ? picker.special(category, contextTags(), values(extraValues)) : picker.chatter(contextTags(), values(extraValues));
    if (!line) return null;
    applyTokens(line.tokens, line.text);
    state.chatterIn = nextChatter();
    return bubbles.say(line.text, { kind });
  }

  function* sayAndWait(category, extra) {
    const handle = say(category, extra);
    if (!handle) return;
    while (!handle.closed) yield;
  }

  // The API activities use.
  const api = {
    rng,
    room,
    lighting,
    props,
    state,
    wait,
    waitRange,
    walkTo,
    sitOn,
    lieDown,
    getUp,
    turnTo,
    moveStraight,
    tweenRoot,
    pose: setPose,
    look(target) {
      state.look = target;
    },
    say,
    sayAndWait,
    sayActivity() {
      // A remark about what he's doing, if nothing else is being said.
      if (rng.chance(0.55)) say(null);
    },
    sleep(on) {
      state.sleeping = on;
      rig.setLidOverride(on ? 1 : null);
    },
    setCamera(mode) {
      state.cameraMode = mode;
    },
    cameraPos,
    hold(name, side = "R", opts) {
      props.hold(name, side, opts);
    },
    drop(side) {
      props.drop(side);
    },
    setHeld(text) {
      state.held = text;
    },
    hide(hidden) {
      state.away = hidden;
      root.visible = !hidden;
    },
    get position() {
      return root.position;
    },
    get yaw() {
      return state.yaw;
    },
    set yaw(value) {
      state.yaw = value;
    },
    setFly(target) {
      state.flyTarget = target;
    },
    hour() {
      return hourOf(clock.date());
    },
  };

  // ---- Activities ----------------------------------------------------------------------

  function cleanupActivity() {
    const activity = ACTIVITIES[state.currentActivity];
    if (activity?.cleanup) activity.cleanup(api);
    lighting.setTv(false);
    room.parts.fridge?.setOpen(false);
    room.parts.toaster?.setUp(false);
    room.parts.door?.setOpen(false);
    props.drop();
    state.flyTarget = null;
    state.cameraMode = "normal";
    if (state.away) api.hide(false);
  }

  function startActivity(id) {
    const activity = ACTIVITIES[id];
    if (!activity) return;
    if (state.program) cleanupActivity();
    state.currentActivity = id;
    state.history[id] = state.time;
    state.look = null;
    const gen = (function* run() {
      // Whatever comes next starts on his feet (activities that sit sit down again).
      if (state.seated) yield* getUp();
      yield* activity.program(api);
    })();
    state.program = { id, gen, startedAt: state.time };
    gen.next(0);
  }

  function pickActivity() {
    const hour = hourOf(clock.date());
    const ctx = { hour, energy: state.energy, night: hour >= 23 || hour < 7, rng, time: state.time };
    const candidates = Object.entries(ACTIVITIES).filter(([id, a]) => id !== state.currentActivity && a.weight);
    const choice = rng.weighted(candidates, ([id, a]) => {
      let w = a.weight(ctx);
      const last = state.history[id];
      if (last !== undefined) w *= Math.min(1, 0.15 + (state.time - last) / 900);
      return w;
    });
    return choice ? choice[0] : "stroll";
  }

  // ---- Chains of thought ---------------------------------------------------------------

  function applyTokens(tokens, text) {
    for (const t of tokens) {
      if (t.kind === "act" && ACTIVITIES[t.value]) {
        if (state.chain) state.chain.action = true;
        endAttention(false);
        startActivity(t.value);
      } else if (t.kind === "face") {
        const level = { wide: 0.05, sleepy: 0.75, squint: 0.66, grin: 0.5, blank: 0.3, closed: 1 }[t.value];
        if (level !== undefined && !state.sleeping) {
          rig.setLidOverride(level);
          state.faceUntil = state.time + 1.5 + text.length / 30;
        }
      } else if (t.kind === "gesture") gesture(t.value);
    }
  }

  function gesture(name) {
    if (state.seated || state.speed > 0.05) return;
    const pose = { shrug: "shrug", wave: "wave", think: "think", point: "reach", yawn: "yawn", stretch: "stretch", scratch: "think", nod: null, headShake: null }[name];
    if (name === "nod" || name === "headShake") {
      state.nod = { kind: name, t: 0 };
      return;
    }
    if (!pose) return;
    state.gestureReturnPose = state.gestureReturnPose ?? state.programPose;
    rig.setPose(pose, 0.35);
    state.gestureUntil = state.time + 2.2;
  }

  function beginAttention() {
    if (state.attention) return;
    state.attention = { savedYaw: state.yaw, savedPose: state.programPose };
    state.paused = true;
    state.speed = 0;
    if (!state.seated) rig.setPose(rng.chance(0.5) ? "standChill" : "stand", 0.5);
    if (state.cameraMode === "normal") state.cameraMode = "chat";
  }

  function endAttention(restore = true) {
    if (!state.attention) return;
    const saved = state.attention;
    state.attention = null;
    state.cameraMode = state.cameraMode === "chat" ? "normal" : state.cameraMode;
    if (restore && state.program) {
      state.restoreYaw = state.seated ? null : saved.savedYaw;
      rig.setPose(saved.savedPose, 0.6);
    }
    state.paused = false;
  }

  function startChain(chain, prefixLine = null, steps = null) {
    if (!chain) return;
    const told = steps ?? picker.tellChain(chain);
    if (prefixLine) told.unshift({ template: prefixLine, end: false, raw: true });
    state.chain = { id: chain.id, steps: told, index: -1, action: false };
    if (!chain.start.startsWith("act:")) beginAttention();
    memory.data.suspended = null;
    memory.touch();
    showStep(0);
  }

  function showStep(index) {
    const chain = state.chain;
    chain.index = index;
    const step = chain.steps[index];
    const rendered = step.raw ? { text: step.template, tokens: [] } : picker.renderTemplate(step.template, values());
    applyTokens(rendered.tokens, rendered.text);
    const isEnd = step.end || index === chain.steps.length - 1;
    chain.handle = bubbles.say(rendered.text, {
      kind: isEnd ? "end" : "chain",
      wait: CHAIN_WAIT,
      onTimeout: () => chainLapsed(),
      onClosed: isEnd ? () => chainFinished() : null,
    });
  }

  function chainLapsed() {
    const chain = state.chain;
    if (!chain) return;
    const remaining = chain.steps.slice(chain.index + 1).filter((s) => !s.raw);
    memory.data.suspended = remaining.length ? { id: chain.id, steps: remaining, at: Date.now() } : null;
    memory.touch();
    state.chain = null;
    endAttention(true);
    state.chatterIn = Math.max(state.chatterIn, 8);
    if (rng.chance(0.55)) {
      setTimeout(() => {
        if (!state.chain && !bubbles.active) {
          const line = picker.special("timeout", contextTags(), values());
          if (line) bubbles.say(line.text, { kind: "aside" });
        }
      }, 600);
    }
  }

  function chainFinished() {
    const chain = state.chain;
    if (!chain) return;
    memory.data.chainsDone[chain.id] = Date.now();
    memory.touch();
    state.chain = null;
    endAttention(true);
    state.chatterIn = Math.max(nextChatter(), 25);
  }

  function nextChatter() {
    const c = settings.chattiness;
    if (c <= 0) return Infinity;
    const f = 50 / c;
    return rng.range(15 * f, 120 * f);
  }

  // ---- Taps ----------------------------------------------------------------------------

  function tapMervin() {
    memory.data.taps += 1;
    memory.touch();
    if (state.away) return;
    const chain = state.chain;
    if (chain) {
      const handle = chain.handle;
      if (handle && !handle.done) {
        handle.finish();
        return;
      }
      if (chain.index < chain.steps.length - 1) {
        showStep(chain.index + 1);
        return;
      }
      // The ending is showing: close it and start something new.
      handle?.close();
    }
    bubbles.clear();
    const context = contextTags();
    if (state.sleeping) {
      const wake = picker.special("wake", context, values());
      rig.setLidOverride(0.55);
      state.wokenUntil = state.time + 60;
      startChain(picker.chain("night", context), wake?.text ?? "Mm? Oh. Hello.");
      return;
    }
    const suspended = memory.data.suspended;
    if (suspended && Date.now() - suspended.at < SUSPEND_KEEP_MS && rng.chance(0.6)) {
      const chainData = picker.chainById(suspended.id);
      const resume = picker.special("resume", context, values());
      if (chainData && suspended.steps.length) {
        startChain(chainData, resume?.text ?? "Where was I? Oh, yeah.", suspended.steps.map((s) => ({ ...s })));
        return;
      }
    }
    startChain(picker.chain("idle", context));
  }

  function tapFurniture(id) {
    if (state.away) return;
    const activity = TAP_TARGETS[id];
    if (!activity) return;
    if (state.chain) {
      state.chain.handle?.close();
      chainLapsed();
    }
    bubbles.clear();
    const context = contextTags();
    context.add(`furniture:${id}`);
    const line = picker.special("tapFurniture", context, values());
    if (line && line.text) {
      bubbles.say(line.text, { kind: "chatter" });
      state.chatterIn = nextChatter();
    }
    startActivity(activity);
  }

  function tapFloor(point) {
    if (state.away || state.chain) return;
    state.glance = { target: point.clone().setY(0.2), until: state.time + 2.5 };
    if (!bubbles.active && rng.chance(0.3)) say("floorTap");
  }

  // ---- Per-frame -----------------------------------------------------------------------

  function updateLook() {
    let target = null;
    if (state.glance && state.time < state.glance.until) target = state.glance.target;
    else if (state.attention || (state.chain && !state.chain.action)) target = "viewer";
    else if (state.flyTarget) target = state.flyTarget;
    else target = state.look;
    if (target === "viewer") {
      lookVec.copy(cameraPos());
      rig.lookAt(lookVec, 1);
    } else if (target) {
      rig.lookAt(target, 1);
    } else {
      rig.lookAt(null, 0);
    }
  }

  return {
    state,
    api,
    tapMervin,
    tapFurniture,
    tapFloor,
    startActivity,
    get cameraMode() {
      if (state.away) return "normal";
      return state.cameraMode;
    },
    setSettings(next) {
      settings = next;
      if (state.chatterIn === Infinity && settings.chattiness > 0) state.chatterIn = nextChatter();
    },
    start() {
      root.position.set(rng.range(-1, 2), 0, rng.range(2.6, 3.4));
      state.yaw = rng.range(-0.5, 0.5);
      applyRoot();
      const hour = hourOf(clock.date());
      startActivity(hour >= 23 || hour < 7 ? "sleepBed" : "idleStand");
      state.chatterIn = 3;
    },
    update(dt) {
      state.time += dt;
      state.energy = Math.max(0, state.energy - dt / 1500);
      if (state.sleeping) state.energy = Math.min(1, state.energy + dt / 300);

      // Advance the program unless a chain of thought has paused it.
      if (state.program && !state.paused) {
        if (state.restoreYaw !== null && state.restoreYaw !== undefined) {
          const d = angleDiff(state.yaw, state.restoreYaw);
          state.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN_SPEED * dt);
          if (Math.abs(d) < 0.03) state.restoreYaw = null;
        } else {
          state.turning = false;
          const result = state.program.gen.next(dt);
          if (result.done) {
            state.program = null;
            startActivity(pickActivity());
          }
        }
      }

      // Facing the viewer while chatting.
      if (state.attention && !state.seated) {
        const cam = cameraPos();
        const want = Math.atan2(cam.x - root.position.x, cam.z - root.position.z);
        const d = angleDiff(state.yaw, want);
        state.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN_SPEED * 0.8 * dt);
        state.speed = 0;
      }

      // Walk cycle follows ground speed.
      const walk = rig.state.walk;
      const moving = state.paused ? 0 : state.speed;
      walk.weight += ((moving > 0.05 ? 1 : 0) - walk.weight) * Math.min(1, dt * 6);
      walk.phase += (moving * dt * Math.PI * 2) / STRIDE + (state.turning ? dt * 4 : 0);
      if (!state.paused && state.program) state.speed *= 0.8;

      // Gestures and faces wear off.
      if (state.gestureUntil && state.time > state.gestureUntil) {
        state.gestureUntil = 0;
        if (!state.seated) rig.setPose(state.attention ? "standChill" : state.gestureReturnPose ?? state.programPose, 0.5);
        state.gestureReturnPose = null;
      }
      if (state.faceUntil && state.time > state.faceUntil) {
        state.faceUntil = 0;
        rig.setLidOverride(state.sleeping ? 1 : null);
      }
      if (state.wokenUntil && state.time > state.wokenUntil && !state.chain) {
        state.wokenUntil = 0;
        if (state.sleeping) rig.setLidOverride(1);
      }
      if (state.nod) {
        state.nod.t += dt;
        if (state.nod.t > 1.2) state.nod = null;
      }

      applyRoot();
      updateLook();

      // Chatter.
      if (!state.chain && !bubbles.active && !state.away) {
        if (!state.greeted && state.time > 2.5) {
          state.greeted = true;
          if (!state.sleeping) say("greeting");
        } else if (state.sleeping) {
          state.sleepTalkIn -= dt;
          if (state.sleepTalkIn <= 0 && settings.chattiness > 0) {
            state.sleepTalkIn = rng.range(40, 150);
            const line = picker.special("sleep", contextTags(), values());
            if (line) bubbles.say(line.text, { kind: "aside" });
          }
        } else {
          state.chatterIn -= dt;
          if (state.chatterIn <= 0) say(null);
        }
      }
      memory.save();
    },
    // Talking: mouth openness from the bubble's typing.
    setMouth(open) {
      rig.setJaw(state.sleeping ? 0 : open * 0.85);
    },
    peekTarget() {
      return Math.min(PEEK_Z, cameraPos().z - 1.7);
    },
  };
}
