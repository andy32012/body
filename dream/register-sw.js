if ("serviceWorker" in navigator && window.isSecureContext) {
  const scriptUrl = new URL("./sw.js", document.currentScript.src);
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(scriptUrl, { updateViaCache: "none" }).catch(() => {
      // The app stays usable online if this browser blocks offline storage.
    });
  });
}
