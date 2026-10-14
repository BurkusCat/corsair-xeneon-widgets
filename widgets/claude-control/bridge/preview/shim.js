/* Stand-in for the iCUE widget runtime when the widget is opened in a normal browser via
 * the bridge (http://localhost:47821/widget/index.html). The bridge injects this script
 * as the first thing in <head>; inside iCUE it is never loaded.
 *
 * - defines the globals iCUE injects (iCUE, iCUE_initialized, uniqueId, device, tr)
 * - sets every x-icue-property global from its data-default, or from ?name=value
 * - calls icueEvents.onICUEInitialized once the page has loaded
 * - ?mock=1 makes the widget render the bridge's demo data instead of real sessions
 */
(function () {
  "use strict";
  if (typeof window.iCUE !== "undefined") return;

  var params = new URLSearchParams(location.search);
  window.__claudeControlPreview = { mock: params.get("mock") === "1" };
  window.iCUE = {
    iCUELanguage: "en",
    fpsLimit: 30,
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
