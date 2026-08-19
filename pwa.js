(function initializePwa(global) {
  "use strict";

  const buildVersion = "__CHAKUCHAKU_BUILD_VERSION__";
  const capacitor = global.Capacitor;
  const isNative = Boolean(
    capacitor?.isNativePlatform?.() ||
    (typeof capacitor?.getPlatform === "function" && capacitor.getPlatform() !== "web")
  );

  if (isNative || !("serviceWorker" in navigator)) {
    return;
  }

  global.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`service-worker.js?v=${encodeURIComponent(buildVersion)}`)
      .catch((error) => console.error("Could not enable offline study.", error));
  });
})(globalThis);
