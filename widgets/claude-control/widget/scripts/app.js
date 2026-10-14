/* Claude Control — XENEON EDGE widget.
 *
 * Polls the local bridge (bridge/server.mjs) for GET /api/state and renders it. Taps open
 * sessions through iCUE's Link Provider plugin (claude:// deep links) or, when that is not
 * available, by asking the bridge to do it.
 *
 * Classic script on purpose: the icuewidget validator compiles referenced .js files as
 * scripts, so ES module syntax fails validation.
 */
(function () {
  "use strict";

  // Must match the url permission in manifest.json and the bridge's port.
  var BRIDGE = "http://localhost:47821";
  var POLL_MS = 1500;
  var OFFLINE_POLL_MS = 5000;

  var STATE_LABELS = {
    permission: "Permission",
    input: "Needs input",
    failed: "Failed",
    done: "Done",
    busy: "Working",
    idle: "Idle",
  };
  var CHIP_LABELS = {
    permission: "permission",
    input: "need input",
    failed: "failed",
    done: "done",
    busy: "working",
    idle: "idle",
  };
  var STATE_ORDER = ["permission", "input", "failed", "done", "busy", "idle"];
  var TIMED_STATES = { permission: true, input: true, failed: true, done: true, busy: true };

  var preview = window.__claudeControlPreview || {};
  var app = document.getElementById("app");
  var els = {
    usage: document.getElementById("usage"),
    queue: document.getElementById("queue"),
    actions: document.getElementById("actions"),
    banner: document.getElementById("banner"),
    toast: document.getElementById("toast"),
  };

  var view = {
    snapshot: null,
    signature: "",
    layout: "",
    lastOkAt: 0,
    error: null,
    started: false,
    pollTimer: 0,
    toastTimer: 0,
  };

  // ---------------------------------------------------------------- settings

  // iCUE exposes each x-icue-property as a global named after its `content` attribute.
  function setting(name, fallback) {
    var value = window[name];
    return value === undefined || value === null || value === "" ? fallback : value;
  }

  function bool(value) {
    return value === true || value === "true" || value === 1;
  }

  function clampNumber(value, min, max, fallback) {
    var n = Number(value);
    return isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function settings() {
    return {
      pinned: String(setting("pinnedFolders", ""))
        .split(/[;\n]/)
        .map(function (s) { return s.trim(); })
        .filter(Boolean),
      showIdle: bool(setting("showIdle", true)),
      contextWarn: clampNumber(setting("contextWarn", 50), 10, 95, 50),
      glow: bool(setting("attentionGlow", true)),
      linkMode: String(setting("linkMode", "auto")),
      token: String(setting("bridgeToken", "")).trim(),
    };
  }

  function applyTheme() {
    var style = document.documentElement.style;
    style.setProperty("--text", colour(setting("textColor"), "#f4f1ea"));
    style.setProperty("--accent", colour(setting("accentColor"), "#d97757"));
    style.setProperty("--bg", colour(setting("backgroundColor"), "#151413"));
    style.setProperty("--bg-opacity", clampNumber(setting("backgroundOpacity", 100), 0, 100, 100) + "%");
  }

  function colour(value, fallback) {
    return typeof value === "string" && value ? value : fallback;
  }

  // ---------------------------------------------------------------- layout

  // XENEON EDGE widget sizes: S 840x344, M 840x696, L 1688x696, XL 2536x696, and the same
  // rotated in portrait. S and L share an aspect ratio, so height separates them.
  function updateLayout() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (!w || !h) return;
    var aspect = w / h;
    var layout;
    var rem;
    if (aspect < 0.85) {
      layout = "tall";
      rem = w / 26;
    } else if (aspect >= 3) {
      layout = "xl";
      rem = h / 34;
    } else if (aspect >= 1.8 && h < 450) {
      layout = "s";
      rem = h / 17;
    } else if (aspect >= 1.8) {
      layout = "l";
      rem = h / 34;
    } else {
      layout = "m";
      rem = Math.min(h / 34, w / 40);
    }
    document.documentElement.style.fontSize = clampNumber(rem, 11, 34, 20).toFixed(2) + "px";
    if (layout !== view.layout) {
      view.layout = layout;
      app.setAttribute("data-layout", layout);
      render(true);
    }
  }

  // ---------------------------------------------------------------- bridge

  function requestHeaders(json) {
    var headers = {};
    var token = settings().token;
    if (token) headers["X-Claude-Control-Token"] = token;
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  function BridgeError(kind, message) {
    this.kind = kind;
    this.message = message;
  }

  function fetchState() {
    var url = BRIDGE + "/api/state" + (preview.mock ? "?mock=1" : "");
    return fetch(url, { cache: "no-store", headers: requestHeaders(false) }).then(function (res) {
      if (res.status === 401) throw new BridgeError("token", "Bridge token missing or wrong");
      if (!res.ok) throw new BridgeError("http", "Bridge error " + res.status);
      return res.json();
    });
  }

  function post(path, body) {
    return fetch(BRIDGE + path, {
      method: "POST",
      cache: "no-store",
      headers: requestHeaders(true),
      body: JSON.stringify(body || {}),
    })
      .catch(function () {
        throw new BridgeError("offline", "Bridge is not running");
      })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new BridgeError("http", data.error || "Bridge error " + res.status);
          return data;
        });
      });
  }

  function schedule(ms) {
    clearTimeout(view.pollTimer);
    view.pollTimer = setTimeout(poll, ms);
  }

  function poll() {
    fetchState()
      .then(function (snapshot) {
        view.snapshot = snapshot;
        view.lastOkAt = Date.now();
        view.error = null;
        render(false);
        schedule(POLL_MS);
      })
      .catch(function (error) {
        view.error = error instanceof BridgeError ? error : new BridgeError("offline", "Bridge is not running");
        renderBanner();
        schedule(OFFLINE_POLL_MS);
      });
  }

  // ---------------------------------------------------------------- DOM helpers

  function el(tag, attrs) {
    var node = document.createElement(tag);
    setAttrs(node, attrs);
    for (var i = 2; i < arguments.length; i += 1) append(node, arguments[i]);
    return node;
  }

  function svg(tag, attrs) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var key in attrs) {
      if (key === "text") node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    }
    for (var i = 2; i < arguments.length; i += 1) append(node, arguments[i]);
    return node;
  }

  function setAttrs(node, attrs) {
    if (!attrs) return;
    for (var key in attrs) {
      var value = attrs[key];
      if (value === undefined || value === null || value === false) continue;
      if (key === "text") node.textContent = value;
      else if (key === "class") node.className = value;
      else if (key === "onClick") node.addEventListener("click", value);
      else if (key === "data") for (var d in value) { if (value[d] !== undefined) node.setAttribute("data-" + d, value[d]); }
      else if (key === "style") for (var s in value) node.style.setProperty(s, value[s]);
      else if (value === true) node.setAttribute(key, "");
      else node.setAttribute(key, value);
    }
  }

  function append(parent, child) {
    if (child === undefined || child === null || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { append(parent, c); });
    else parent.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }

  // ---------------------------------------------------------------- formatting

  function duration(ms) {
    if (!(ms > 0)) return "0s";
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h " + pad(m % 60) + "m";
    return Math.floor(h / 24) + "d " + (h % 24) + "h";
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function clock(t) {
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function dayClock(t) {
    return new Date(t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }

  function number(n) {
    return Number(n || 0).toLocaleString();
  }

  // Elements whose text is a live relative time, refreshed by tick().
  function since(t, prefix, suffix) {
    return el("span", { data: { since: t, prefix: prefix || "", suffix: suffix || "" }, text: (prefix || "") + duration(Date.now() - t) + (suffix || "") });
  }

  function until(t, prefix) {
    return el("span", { data: { until: t, prefix: prefix || "" }, text: (prefix || "") + duration(t - Date.now()) });
  }

  function tick() {
    var now = Date.now();
    var nodes = app.querySelectorAll("[data-since],[data-until]");
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var prefix = node.getAttribute("data-prefix") || "";
      var suffix = node.getAttribute("data-suffix") || "";
      var value = node.hasAttribute("data-since")
        ? duration(now - Number(node.getAttribute("data-since")))
        : duration(Number(node.getAttribute("data-until")) - now);
      node.textContent = prefix + value + suffix;
    }
    if (view.error) renderBanner();
  }

  function severity(percent, warnAt, dangerAt) {
    if (percent >= dangerAt) return "danger";
    if (percent >= warnAt) return "warn";
    return "";
  }

  // ---------------------------------------------------------------- render

  function signature(snapshot) {
    return JSON.stringify(snapshot, function (key, value) {
      return key === "generatedAt" || key === "uptimeMs" ? undefined : value;
    });
  }

  function render(force) {
    var snapshot = view.snapshot;
    if (!snapshot) {
      renderBanner();
      return;
    }
    var sig = signature(snapshot) + "|" + view.layout + "|" + JSON.stringify(settings());
    if (!force && sig === view.signature) return;
    view.signature = sig;
    applyTheme();
    renderUsage(snapshot);
    renderQueue(snapshot);
    renderActions(snapshot);
    renderGlow(snapshot);
    renderBanner();
  }

  function renderUsage(snapshot) {
    var usage = snapshot.usage || {};
    var big = view.layout === "xl" || view.layout === "l";
    var parts = [el("div", { class: "label" }, el("span", { text: "Plan usage" }), el("span", { class: "source", text: sourceLabel(usage) }))];
    if (big) {
      parts.push(el("div", { class: "rings" }, ring("Session", usage.fiveHour), ring("Weekly", usage.sevenDay)));
    } else {
      parts.push(el("div", { class: "meters" }, meter("Session", usage.fiveHour), meter("Weekly", usage.sevenDay)));
    }
    if (view.layout !== "s") parts.push(paceNote(usage.fiveHour));
    // In L the actions share this column, so there is no room for the stats block.
    if (view.layout === "xl") parts.push(stats(snapshot));
    els.usage.replaceChildren.apply(els.usage, parts.filter(Boolean));
  }

  function sourceLabel(usage) {
    var w = usage.fiveHour || usage.sevenDay;
    if (!w) return "";
    return w.source === "statusline" ? "via status line" : "via desktop app";
  }

  function usageColour(percent) {
    var level = severity(percent, 75, 90);
    return level === "danger" ? "var(--danger)" : level === "warn" ? "var(--warn)" : "var(--accent)";
  }

  function resetLine(w) {
    if (!w) return el("span", { text: "Not reported for this plan" });
    if (w.resetSinceObserved) return el("span", { text: "Reset — waiting for new data" });
    if (w.resetsAt) {
      return w.resetsAt - Date.now() > 24 * 3600 * 1000
        ? el("span", { text: "Resets " + dayClock(w.resetsAt) })
        : until(w.resetsAt, "Resets in ");
    }
    return since(w.observedAt, "As of ", " ago");
  }

  function ring(name, w) {
    var percent = w ? w.percent : null;
    var circumference = 2 * Math.PI * 50;
    var offset = circumference * (1 - Math.min(100, percent || 0) / 100);
    var graphic = svg(
      "svg",
      { viewBox: "0 0 120 120", "aria-hidden": "true" },
      svg("circle", { class: "track", cx: 60, cy: 60, r: 50, fill: "none", "stroke-width": 11 }),
      svg("circle", {
        class: "value",
        cx: 60,
        cy: 60,
        r: 50,
        fill: "none",
        "stroke-width": 11,
        "stroke-dasharray": circumference.toFixed(2),
        "stroke-dashoffset": (percent === null ? circumference : offset).toFixed(2),
        transform: "rotate(-90 60 60)",
      }),
      svg("text", {
        class: percent === null ? "pct unknown" : "pct",
        x: 60,
        y: 61,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        text: percent === null ? "—" : Math.round(percent) + "%",
      }),
    );
    return el(
      "div",
      { class: "ring", style: { "--meter": usageColour(percent || 0) } },
      graphic,
      el("div", { class: "name", text: name }),
      el("div", { class: "sub" }, resetLine(w)),
    );
  }

  function meter(name, w) {
    var percent = w ? w.percent : null;
    return el(
      "div",
      { class: "meter", style: { "--meter": usageColour(percent || 0) } },
      el("span", { class: "name", text: name }),
      el("span", { class: "value", text: percent === null ? "—" : Math.round(percent) + "%" }),
      el("div", { class: "bar" }, el("i", { style: { width: (percent || 0) + "%" } })),
      el("div", { class: "sub" }, resetLine(w)),
    );
  }

  function paceNote(w) {
    var pace = w && w.pace;
    if (!pace || !(pace.percentPerHour > 0)) return null;
    var rate = "~" + pace.percentPerHour + "%/h";
    if (pace.limitAt && pace.beforeReset !== false) {
      var left = pace.limitAt - Date.now();
      var level = left < 20 * 60 * 1000 ? "danger" : "warn";
      return el("div", { class: "pace " + level }, rate + " · 5-hour limit ≈ " + clock(pace.limitAt));
    }
    return el("div", { class: "pace" }, rate + " · resets before the limit");
  }

  function stats(snapshot) {
    var today = snapshot.today || {};
    var bridge = snapshot.bridge || {};
    var feed = bridge.statuslineAt
      ? since(bridge.statuslineAt, "status line ", " ago")
      : el("span", { text: "no status line feed" });
    return el(
      "div",
      { class: "stats" },
      el("div", { class: "label", text: "Today" }),
      el(
        "div",
        { class: "row" },
        el("span", { text: today.sessions + (today.sessions === 1 ? " session" : " sessions") }),
        today.linesAdded || today.linesRemoved ? el("span", { class: "add", text: "+" + number(today.linesAdded) }) : null,
        today.linesAdded || today.linesRemoved ? el("span", { class: "del", text: "−" + number(today.linesRemoved) }) : null,
        today.costUsd > 0 ? el("span", { class: "muted", text: "≈ $" + today.costUsd.toFixed(2) + " API" }) : null,
      ),
      el("div", { class: "source" }, el("span", { class: "dot" }), "Bridge live · ", feed),
    );
  }

  function visibleSessions(snapshot) {
    var sessions = snapshot.sessions || [];
    return settings().showIdle
      ? sessions
      : sessions.filter(function (s) { return s.state !== "idle"; });
  }

  function renderQueue(snapshot) {
    var s = settings();
    var counts = snapshot.counts || {};
    var chips = STATE_ORDER.filter(function (state) {
      return counts[state] > 0 && (state !== "idle" || s.showIdle);
    }).map(function (state) {
      return el("span", { class: "chip", data: { state: state }, text: counts[state] + " " + CHIP_LABELS[state] });
    });
    var sessions = visibleSessions(snapshot);
    var list = sessions.length
      ? sessions.map(function (session) { return card(session, s); })
      : [el("div", { class: "empty" }, el("div", { class: "big", text: "No active sessions" }), el("div", { text: "Start one from the buttons, or in Claude." }))];
    els.queue.replaceChildren(
      el("div", { class: "queue-head" }, el("span", { class: "label", text: "Sessions" }), el("div", { class: "chips" }, chips)),
      el("div", { class: "list" }, list),
    );
  }

  function card(session, s) {
    var button = el("button", { class: "card", data: { state: session.state, key: session.key }, type: "button" });
    button.addEventListener("click", function () {
      openSession(session, button);
    });
    var meta = [session.project, session.branch, session.surface === "terminal" ? "terminal" : null].filter(Boolean).join(" · ");
    append(
      button,
      [
        el(
          "div",
          { class: "top" },
          el("span", { class: "state-label", text: STATE_LABELS[session.state] || session.state }),
          TIMED_STATES[session.state] && session.since ? el("span", { class: "elapsed" }, since(session.since)) : null,
          el("span", { class: "model", text: session.modelLabel || "" }),
        ),
        el("div", { class: "title", text: session.title || "Untitled session" }),
        meta ? el("div", { class: "meta", text: meta }) : null,
        el("div", { class: "detail", text: session.detail || "" }),
        contextBar(session.context, s.contextWarn),
      ],
    );
    return button;
  }

  function contextBar(context, warnAt) {
    if (!context) return null;
    if (context.percent === undefined || context.percent === null) {
      return context.compacted ? el("div", { class: "ctx" }, el("span", { text: "Context compacted" })) : null;
    }
    var dangerAt = warnAt + (100 - warnAt) * 0.6;
    return el(
      "div",
      { class: "ctx " + severity(context.percent, warnAt, dangerAt) },
      el("div", { class: "bar" }, el("i", { style: { width: Math.min(100, context.percent) + "%" } })),
      el("span", { text: Math.round(context.percent) + "% context" }),
    );
  }

  function folderShortcuts(snapshot, limit) {
    var seen = {};
    var out = [];
    settings().pinned.forEach(function (folder) {
      out.push({ folder: folder, label: folder.split(/[\\/]/).filter(Boolean).pop() || folder });
    });
    (snapshot.quickStart || []).forEach(function (entry) {
      out.push(entry);
    });
    return out
      .filter(function (entry) {
        var id = entry.folder.toLowerCase();
        if (seen[id]) return false;
        seen[id] = true;
        return true;
      })
      .slice(0, limit);
  }

  function renderActions(snapshot) {
    if (view.layout === "s") {
      els.actions.replaceChildren();
      return;
    }
    var next = null;
    (snapshot.sessions || []).forEach(function (s) {
      if (!next && s.key === snapshot.next) next = s;
    });

    var primary = next
      ? actionButton("btn primary", next.state, "Jump to next", (STATE_LABELS[next.state] || "") + " · " + next.title, function (button) {
          openSession(next, button);
        })
      : actionButton("btn primary", "clear", "All clear", "Nothing is waiting for you", null);

    var continueLast = actionButton("btn", null, "Continue last", "Most recent desktop session", function (button) {
      openLink("claude://code/continue?session=last", "/api/continue-last", {}, button, "Opening your last session");
    });

    var folderLimit = view.layout === "xl" ? 6 : view.layout === "l" ? 3 : 1;
    var folders = folderShortcuts(snapshot, folderLimit).map(function (entry) {
      return actionButton("btn folder", null, entry.label, "New session", function (button) {
        newSession(entry.folder, button);
      });
    });

    if (view.layout === "xl") {
      var column = [el("div", { class: "label", text: "Next up" }), primary, continueLast];
      if (folders.length) column.push(el("div", { class: "label", text: "New session" }), el("div", { class: "folders" }, folders));
      els.actions.replaceChildren.apply(els.actions, column);
    } else if (view.layout === "l") {
      els.actions.replaceChildren(primary, el("div", { class: "folders" }, [continueLast].concat(folders)));
    } else {
      els.actions.replaceChildren.apply(els.actions, [primary, continueLast].concat(folders));
    }
  }

  function actionButton(className, state, title, subtitle, onTap) {
    var button = el(
      "button",
      { class: className, type: "button", data: { state: state || undefined }, disabled: !onTap },
      el("span", { class: "t", text: title }),
      el("span", { class: "s", text: subtitle }),
    );
    if (onTap) {
      button.addEventListener("click", function () {
        onTap(button);
      });
    }
    return button;
  }

  function renderGlow(snapshot) {
    var counts = snapshot.counts || {};
    var waiting = (counts.permission || 0) + (counts.input || 0) + (counts.failed || 0);
    var on = settings().glow && waiting > 0;
    app.classList.toggle("alert", on);
    if (on) {
      var state = counts.permission ? "permission" : counts.input ? "input" : "failed";
      app.style.setProperty("--alert-color", "var(--c-" + state + ")");
    }
  }

  function renderBanner() {
    if (!view.error) {
      els.banner.hidden = true;
      app.classList.remove("offline");
      return;
    }
    app.classList.toggle("offline", true);
    var children;
    if (view.error.kind === "token") {
      children = [
        el("div", { class: "big", text: "Bridge token rejected" }),
        el("div", { class: "muted", text: "Use the same token in the widget settings and the bridge's config.json." }),
      ];
    } else {
      children = [
        el("div", { class: "big", text: "Claude Control bridge is not running" }),
        el("div", { class: "muted" }, "Start it with ", el("code", { text: "npm run bridge:claude" })),
        view.lastOkAt ? el("div", { class: "muted" }, since(view.lastOkAt, "Last update ", " ago")) : null,
      ];
    }
    els.banner.replaceChildren.apply(els.banner, children.filter(Boolean));
    els.banner.hidden = false;
  }

  // ---------------------------------------------------------------- actions

  function press(button) {
    if (!button) return;
    button.classList.add("pressed");
    setTimeout(function () {
      button.classList.remove("pressed");
    }, 180);
  }

  function toast(text, isError) {
    clearTimeout(view.toastTimer);
    els.toast.textContent = text;
    els.toast.className = isError ? "toast error" : "toast";
    els.toast.hidden = false;
    view.toastTimer = setTimeout(function () {
      els.toast.hidden = true;
    }, 2400);
  }

  function linkProvider() {
    var plugins = window.plugins;
    if (settings().linkMode === "bridge" || !plugins || !plugins.Linkprovider) return null;
    // iCUE sets this flag once the plugin is ready.
    if (window.pluginLinkprovider_initialized === false) return null;
    return typeof plugins.Linkprovider.open === "function" ? plugins.Linkprovider : null;
  }

  // Desktop deep links go through iCUE when possible: iCUE handled the touch, so Windows
  // lets the app it launches come to the front. The bridge is the fallback.
  function openLink(url, bridgePath, body, button, message) {
    press(button);
    if (preview.mock) {
      toast("Preview: would open " + url);
      return;
    }
    var provider = url ? linkProvider() : null;
    if (provider) {
      provider.open(url);
      toast(message);
      return;
    }
    post(bridgePath, body)
      .then(function (result) {
        if (result.dryRun) toast("Preview: nothing opened");
        else if (result.ok === false) toast(result.reason || "Could not open that", true);
        else toast(message);
      })
      .catch(function (error) {
        toast(error.message, true);
      });
  }

  function openSession(session, button) {
    var message = session.surface === "terminal" ? "Bringing the terminal forward" : "Opening " + session.title;
    openLink(session.openUrl, "/api/sessions/" + encodeURIComponent(session.key) + "/open", {}, button, message);
  }

  function newSession(folder, button) {
    var url = "claude://code/new?" + new URLSearchParams({ folder: folder }).toString();
    openLink(url, "/api/new", { folder: folder }, button, "New session in " + folder);
  }

  // ---------------------------------------------------------------- start

  function init() {
    if (view.started) {
      render(true);
      return;
    }
    view.started = true;
    applyTheme();
    updateLayout();
    window.addEventListener("resize", updateLayout);
    setInterval(tick, 1000);
    poll();
  }

  window.icueEvents = {
    onICUEInitialized: init,
    onDataUpdated: function () {
      applyTheme();
      render(true);
    },
  };

  if (window.iCUE_initialized || typeof window.iCUE === "undefined") {
    // Already initialised, or running in a plain browser with no iCUE at all.
    init();
  } else {
    // Normally onICUEInitialized fires shortly; never sit blank if it does not.
    setTimeout(init, 3000);
  }
})();
