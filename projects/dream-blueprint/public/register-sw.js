if ("serviceWorker" in navigator && window.isSecureContext) {
  const scriptUrl = new URL("./sw.js", document.currentScript.src);
  navigator.serviceWorker.register(scriptUrl, { updateViaCache: "none" }).then(registration => {
    // A hash route changes within the same document. Switch releases only when
    // the learner has chosen to leave the current view, never during an answer.
    const entry = document.querySelector('script[type="module"][src]')?.src;
    let nextRelease = false;
    // A new release is ready: a small button says so on any page, and one tap switches to it. It also switches by itself
    // on leaving the current view, or on coming back to the app after five minutes away (drafts are saved as he types).
    const showUpdate = () => {
      try {
        if (!document.body || document.getElementById("dream-update")) return;
        const button = document.createElement("button");
        button.id = "dream-update";
        button.type = "button";
        button.textContent = "新版本好了，點一下更新";
        button.setAttribute("style", "position:fixed;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top));z-index:9999;white-space:nowrap;" +
          "border:0;border-radius:999px;padding:11px 20px;font:600 15px/1.3 system-ui,sans-serif;color:#1d1440;background:#d9ccff;" +
          "box-shadow:0 6px 24px rgba(0,0,0,.35);cursor:pointer;max-width:calc(100vw - 32px)");
        button.addEventListener("click", () => window.location.reload());
        document.body.appendChild(button);
      } catch { /* Not a page that can show it. */ }
    };
    navigator.serviceWorker.addEventListener("message", event => {
      if (event.source !== navigator.serviceWorker.controller || event.data?.type !== "APP_SHELL") return;
      const nextEntry = event.data.script;
      const differs = Boolean(entry && nextEntry && new URL(nextEntry, scriptUrl).href !== entry);
      if (!differs) { nextRelease = false; document.getElementById?.("dream-update")?.remove?.(); return; }
      // A worker installed before this page was published reports an older entry: ask the site which one is current, so
      // the page that is already the newest never offers an "update". Offline, trust the worker.
      Promise.resolve(window.fetch ? window.fetch(new URL("./index.html", scriptUrl), { cache: "no-store" }).then(r => r.text()) : "")
        .then(html => !html.includes(new URL(entry).pathname.split("/").pop()), () => true)
        .then(newer => { nextRelease = newer; if (newer) showUpdate(); });
    });
    const view = url => new URL(url).hash.slice(1).split("/")[0] || "today";
    window.addEventListener("hashchange", event => {
      if (nextRelease && view(event.oldURL) !== view(event.newURL)) window.location.reload();
    });
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (nextRelease && hiddenAt && Date.now() - hiddenAt >= 5 * 60000) window.location.reload();
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
    window.setTimeout(() => registration.update().catch(() => {}), 15000);
  }).catch(() => {
    // Private browsing can block offline storage. Online practice stays available.
  });
}


