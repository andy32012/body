if ("serviceWorker" in navigator && window.isSecureContext) {
  const scriptUrl = new URL("./sw.js", document.currentScript.src);
  navigator.serviceWorker.register(scriptUrl, { updateViaCache: "none" }).then(registration => {
    // A hash route changes within the same document. Switch releases only when
    // the learner has chosen to leave the current view, never during an answer.
    const entry = document.querySelector('script[type="module"][src]')?.src;
    let nextRelease = false;
    navigator.serviceWorker.addEventListener("message", event => {
      if (event.source !== navigator.serviceWorker.controller || event.data?.type !== "APP_SHELL") return;
      const nextEntry = event.data.script;
      nextRelease = Boolean(entry && nextEntry && new URL(nextEntry, scriptUrl).href !== entry);
    });
    const view = url => new URL(url).hash.slice(1).split("/")[0] || "today";
    window.addEventListener("hashchange", event => {
      if (nextRelease && view(event.oldURL) !== view(event.newURL)) window.location.reload();
    });
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


