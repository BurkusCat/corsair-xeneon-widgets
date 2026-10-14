// Speech bubbles: one at a time, above (or beside) Mervin's head, typed out letter by letter.
// The brain asks for a bubble; this module types it, keeps it on screen, shows the "tap to
// continue" cue with a 30 s ring when a chain is waiting, and reports mouth openness for the
// jaw while typing. Positions are in CSS pixels of the widget.

const SVG_NS = "http://www.w3.org/2000/svg";
const CHARS_PER_SECOND = 34;

function cueElement() {
  const cue = document.createElement("div");
  cue.className = "cue";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  const disc = document.createElementNS(SVG_NS, "circle");
  disc.setAttribute("class", "disc");
  disc.setAttribute("cx", "20");
  disc.setAttribute("cy", "20");
  disc.setAttribute("r", "16");
  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("class", "ring");
  ring.setAttribute("cx", "20");
  ring.setAttribute("cy", "20");
  ring.setAttribute("r", "16");
  const length = 2 * Math.PI * 16;
  ring.setAttribute("stroke-dasharray", `${length}`);
  ring.setAttribute("stroke-dashoffset", "0");
  const dots = document.createElementNS(SVG_NS, "g");
  dots.setAttribute("class", "dots");
  for (const x of [13, 20, 27]) {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", "21");
    dot.setAttribute("r", "2.6");
    dots.append(dot);
  }
  svg.append(disc, ring, dots);
  cue.append(svg);
  return { cue, ring, length };
}

function mouthFor(ch) {
  if (!ch || /[\s.,!?;:…"'()-]/.test(ch)) return 0.05;
  if (/[aeiouAEIOU]/.test(ch)) return 1;
  if (/[mbpMBP]/.test(ch)) return 0.1;
  return 0.55;
}

export function createBubbles(layer) {
  let current = null;
  let fontPx = 22;
  let viewport = { w: 800, h: 400 };

  function setScale(width, height, sizePercent) {
    viewport = { w: width, h: height };
    const base = Math.max(16, Math.min(30, Math.min(height * 0.034, width * 0.03)));
    fontPx = Math.max(16, base * (sizePercent / 100));
    layer.style.setProperty("--bubble-font", `${fontPx.toFixed(1)}px`);
    const maxWidth = width / height > 1.8 ? Math.min(fontPx * 24, width * 0.42) : Math.min(fontPx * 20, width * 0.8);
    layer.style.setProperty("--bubble-max", `${Math.round(maxWidth)}px`);
  }

  function remove(bubble, immediate = false) {
    if (!bubble) return;
    bubble.el.classList.remove("shown");
    bubble.el.classList.add("leaving");
    const el = bubble.el;
    setTimeout(() => el.remove(), immediate ? 0 : 400);
  }

  // Show a bubble. kind: "chatter" | "chain" | "end" | "aside".
  // Returns a handle: { done (typed), finish(), close(), onTimeout }.
  function say(text, { kind = "chatter", wait = 30, onTimeout = null, onClosed = null } = {}) {
    if (current) {
      // Replaced by the next bubble: no close callback.
      current.closed = true;
      remove(current, false);
    }
    const el = document.createElement("div");
    el.className = `bubble ${kind === "aside" ? "aside" : ""} ${kind === "end" ? "ending" : ""}`.trim();
    const textEl = document.createElement("span");
    textEl.className = "text";
    const shown = document.createElement("span");
    const ghost = document.createElement("span");
    ghost.className = "ghost";
    ghost.textContent = text;
    textEl.append(shown, ghost);
    el.append(textEl);
    if (kind === "end") {
      const mark = document.createElement("span");
      mark.className = "end-mark";
      mark.textContent = "~";
      textEl.append(mark);
    }
    let cue = null;
    if (kind === "chain") {
      cue = cueElement();
      el.append(cue.cue);
    }
    layer.append(el);
    const bubble = {
      el,
      text,
      kind,
      shown,
      ghost,
      cue,
      typed: 0,
      shownCount: -1,
      age: 0,
      waitFor: wait,
      waited: 0,
      done: false,
      closed: false,
      onTimeout,
      onClosed,
      // Reading time after typing, for bubbles that close by themselves.
      linger: 2.2 + text.length * 0.06,
      lingerLeft: 0,
      place: null,
    };
    current = bubble;
    requestAnimationFrame(() => el.classList.add("shown"));
    return {
      get done() {
        return bubble.done;
      },
      get closed() {
        return bubble.closed;
      },
      finish() {
        bubble.typed = text.length;
      },
      close() {
        close(bubble);
      },
      element: el,
    };
  }

  function close(bubble) {
    if (bubble.closed) return;
    bubble.closed = true;
    remove(bubble);
    if (current === bubble) current = null;
    bubble.onClosed?.();
  }

  // Place the bubble near the head anchor (screen px), keeping it inside the widget.
  function place(bubble, anchor) {
    const el = bubble.el;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 10;
    const gap = fontPx * 0.9;
    let left;
    let top;
    let mode = "above";
    if (anchor.y - gap - h < margin) {
      // No room above: sit beside the head, on the side with more space.
      const roomRight = viewport.w - anchor.x;
      mode = roomRight > anchor.x ? "side-right" : "side-left";
      top = Math.min(viewport.h - h - margin, Math.max(margin, anchor.y + gap * 0.6 - h * 0.35));
      left = mode === "side-right" ? anchor.x + gap * 1.6 : anchor.x - gap * 1.6 - w;
    } else {
      top = anchor.y - gap - h;
      left = anchor.x - w * 0.42;
    }
    left = Math.min(viewport.w - w - margin, Math.max(margin, left));
    top = Math.min(viewport.h - h - margin, Math.max(margin, top));
    // Smooth movement so the bubble drifts with him instead of jittering.
    if (bubble.place) {
      left = bubble.place.left + (left - bubble.place.left) * 0.25;
      top = bubble.place.top + (top - bubble.place.top) * 0.25;
    }
    bubble.place = { left, top };
    el.style.left = `${left.toFixed(1)}px`;
    el.style.top = `${top.toFixed(1)}px`;
    el.classList.toggle("side-left", mode === "side-left");
    el.classList.toggle("side-right", mode === "side-right");
    if (mode === "above") {
      const tailX = Math.min(w - fontPx, Math.max(fontPx, anchor.x - left));
      el.style.setProperty("--tail-x", `${tailX.toFixed(0)}px`);
    } else {
      const tailY = Math.min(h - fontPx * 0.8, Math.max(fontPx * 0.8, anchor.y + gap * 0.6 - top));
      el.style.setProperty("--tail-y", `${tailY.toFixed(0)}px`);
    }
  }

  return {
    setScale,
    say,
    get active() {
      return current && !current.closed ? current : null;
    },
    // Is a screen point inside the current bubble? (taps on it count as taps on Mervin)
    hit(x, y) {
      if (!current || current.closed) return false;
      const r = current.el.getBoundingClientRect();
      const pad = 12;
      return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    },
    clear() {
      if (current) close(current);
    },
    // Returns the mouth openness (0..1) for the jaw.
    update(dt, anchor) {
      const b = current;
      if (!b || b.closed) return 0;
      b.age += dt;
      let mouth = 0;
      if (!b.done) {
        b.typed = Math.min(b.text.length, b.typed + dt * CHARS_PER_SECOND);
        const n = Math.floor(b.typed);
        if (n !== b.shownCount) {
          b.shownCount = n;
          b.shown.textContent = b.text.slice(0, n);
          b.ghost.textContent = b.text.slice(n);
        }
        mouth = b.kind === "aside" ? mouthFor(b.text[n]) * 0.4 : mouthFor(b.text[n]);
        if (b.typed >= b.text.length) {
          b.done = true;
          b.lingerLeft = b.linger;
          if (b.cue) b.el.classList.add("waiting");
        }
      } else if (b.kind === "chain") {
        b.waited += dt;
        const left = Math.max(0, 1 - b.waited / b.waitFor);
        b.cue.ring.setAttribute("stroke-dashoffset", `${(b.cue.length * (1 - left)).toFixed(1)}`);
        if (b.waited >= b.waitFor) {
          const timeout = b.onTimeout;
          close(b);
          timeout?.();
          return 0;
        }
      } else {
        b.lingerLeft -= dt;
        if (b.lingerLeft <= 0) close(b);
      }
      if (anchor) place(b, anchor);
      return mouth;
    },
  };
}
