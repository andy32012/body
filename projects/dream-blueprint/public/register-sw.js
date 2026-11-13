if ("serviceWorker" in navigator && window.isSecureContext) {
  const scriptUrl = new URL("./sw.js", document.currentScript.src);
  navigator.serviceWorker.register(scriptUrl, { updateViaCache: "none" }).then(registration => {
    // The next navigation uses the new shell. Avoid reloading a learner's open exercise.
    const primeCover = () => {
      const controller = navigator.serviceWorker.controller;
      if (!controller) return;
      controller.postMessage({ type: "PRIME_COVER" });
      // Photos can finish loading before this first visit comes under worker control.
      const viewed = performance.getEntriesByType("resource")
        .filter(entry => entry.initiatorType === "img" && entry.name.startsWith(new URL("cosmos/", scriptUrl).href))
        .map(entry => entry.name);
      if (viewed.length) controller.postMessage({ type: "SAVE_VIEWED_PHOTOS", urls: viewed });
    };
    navigator.serviceWorker.ready.then(primeCover);
    navigator.serviceWorker.addEventListener("controllerchange", primeCover);
    let lastCheck = Date.now();
    const check = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck >= 60000) {
        lastCheck = Date.now();
        registration.update().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", () => registration.update().catch(() => {}));
    window.setInterval(check, 30 * 60000);
  }).catch(() => {
    // Private browsing can block offline storage. Online practice stays available.
  });
}


