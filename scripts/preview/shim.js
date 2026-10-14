/* Stand-in for the iCUE widget runtime when a widget is opened in a normal browser through
 * scripts/preview.mjs. The preview server injects this script as the first thing in <head>;
 * inside iCUE it is never loaded. Adapted from widgets/claude-control/bridge/preview/shim.js.
 *
 * - defines the globals iCUE injects (iCUE, iCUE_initialized, uniqueId, device, tr)
 * - sets every x-icue-property global from its data-default, or from ?name=value
 * - calls icueEvents.onICUEInitialized once the page has loaded
 * - ?fps=N overrides iCUE.fpsLimit
 * - window.__icuePreview.set(name, value) changes a setting and fires onDataUpdated
 */
(function () {
  "use strict";
  if (typeof window.iCUE !== "undefined") return;

  var params = new URLSearchParams(location.search);
  window.iCUE = {
    iCUELanguage: "en",
    fpsLimit: params.has("fps") ? Number(params.get("fps")) : 30,
    isPreview: true,
    defaultTemperatureUnit: function () { return "°C"; },
    default24HourFormat: function () { return "24h"; },
  };
  window.iCUE_initialized = false;
  window.uniqueId = "preview-" + (params.get("instance") || "1");
  window.device = { deviceId: "preview" };
  window.tr = function (text) { return text; };

  function parseOverride(raw) {
    if (raw === "true") return true;
    if (raw === "false") return false;
    return raw !== "" && !isNaN(Number(raw)) ? Number(raw) : raw;
  }

  window.__icuePreview = {
    params: params,
    set: function (name, value) {
      window[name] = value;
      if (window.icueEvents && typeof window.icueEvents.onDataUpdated === "function") {
        window.icueEvents.onDataUpdated();
      }
    },
  };

  document.addEventListener("DOMContentLoaded", function () {
    var metas = document.querySelectorAll('meta[name="x-icue-property"]');
    for (var i = 0; i < metas.length; i += 1) {
      var name = metas[i].getAttribute("content");
      var expression = metas[i].getAttribute("data-default");
      var value;
      if (params.has(name)) {
        value = parseOverride(params.get(name));
      } else if (expression) {
        try {
          value = new Function("tr", "iCUE", "return (" + expression + ");")(window.tr, window.iCUE);
        } catch (error) {
          console.warn("[shim] could not evaluate default for " + name + ": " + expression);
        }
      }
      window[name] = value;
    }
    window.iCUE_initialized = true;
    if (window.icueEvents && typeof window.icueEvents.onICUEInitialized === "function") {
      window.icueEvents.onICUEInitialized();
    }
  });
})();
