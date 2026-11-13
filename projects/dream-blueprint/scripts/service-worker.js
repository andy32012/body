// The build prepends the verified list of core files and content hashes for gallery photos.
const scope = self.registration.scope;
const absolute = file => new URL(file, scope).href;
const prefix = "dream-blueprint:" + scope + ":";
const coreName = prefix + "core-" + config.version;
const galleryName = prefix + "photos";
const coreURLs = new Set(config.core.map(absolute));
const photos = new Map(Object.entries(config.gallery).map(([file, hash]) => {
  const url = absolute(file);
  return [url, url + "?photo=" + hash];
}));
const photoKeys = new Set(photos.values());
const shell = absolute("index.html");
const fallback = absolute(config.fallback);
const pending = new Map();

async function savePhoto(url, cache) {
  const key = photos.get(url);
  const cached = await cache.match(key);
  if (cached) return cached;
  if (!pending.has(key)) {
    const download = (async () => {
      const response = await fetch(key, { cache: "no-cache" });
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("image/")) {
        throw new Error("照片尚未下載，請確認網路後再試一次。");
      }
      // An online photo can still display when the device has exhausted its storage.
      await cache.put(key, response.clone()).catch(() => {});
      return response;
    })();
    pending.set(key, download);
    download.finally(() => pending.delete(key)).catch(() => {});
  }
  return (await pending.get(key)).clone();
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const core = await caches.open(coreName);
    await core.addAll([...coreURLs].map(url => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(prefix) && name !== coreName && name !== galleryName) await caches.delete(name);
    }
    await self.clients.claim();
    const gallery = await caches.open(galleryName);
    for (const request of await gallery.keys()) {
      if (!photoKeys.has(request.url)) await gallery.delete(request);
    }
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(scope)) return;
  const url = new URL(request.url);
  url.search = "";
  if (photos.has(url.href)) {
    event.respondWith((async () => {
      const gallery = await caches.open(galleryName);
      try { return await savePhoto(url.href, gallery); }
      catch { return Response.error(); }
    })());
    return;
  }
  const key = request.mode === "navigate" && !coreURLs.has(url.href) ? shell : url.href;
  if (request.mode === "navigate" && key === shell) {
    // Online opens see the published HTML; offline opens use one fully installed release.
    event.respondWith((async () => {
      let response;
      try {
        response = await fetch(shell, { cache: "no-cache", signal: AbortSignal.timeout(4000) });
        if (response.ok && response.headers.get("Content-Type")?.includes("text/html")) return response;
      } catch { /* Offline or slow connection. */ }
      return (await (await caches.open(coreName)).match(shell)) || response || Response.error();
    })());
    return;
  }
  if (coreURLs.has(key)) {
    event.respondWith((async () => (await (await caches.open(coreName)).match(key)) || fetch(request))());
  }
});

async function manageGallery(download, send) {
  const cache = await caches.open(galleryName);
  const cached = new Set((await cache.keys()).map(request => request.url));
  const missing = [...photos].filter(([, key]) => !cached.has(key)).map(([url]) => url);
  const total = photos.size;
  let done = total - missing.length;
  send({ type: "progress", done, total });
  if (download) {
    const worker = async () => {
      while (missing.length) {
        const url = missing.pop();
        await savePhoto(url, cache);
        if (!await cache.match(photos.get(url))) throw new Error("儲存空間不足。");
        send({ type: "progress", done: ++done, total });
      }
    };
    // Limit network competition with practice screens; a retry reuses finished photos.
    const results = await Promise.allSettled([worker(), worker(), worker()]);
    if (results.some(result => result.status === "rejected")) throw new Error("部分照片還沒存好，請確認網路與裝置空間後接著下載。");
  }
  send({ type: "complete", done, total });
}

self.addEventListener("message", event => {
  const action = event.data?.type;
  if (action === "PRIME_COVER" && photos.has(fallback)) {
    event.source?.postMessage({ type: "APP_SHELL", script: config.entry });
    event.waitUntil(caches.open(galleryName).then(cache => savePhoto(fallback, cache)).catch(() => {}));
    return;
  }
  if (action === "SAVE_VIEWED_PHOTOS" && Array.isArray(event.data.urls)) {
    const urls = [...new Set(event.data.urls)].filter(url => photos.has(url));
    event.waitUntil(caches.open(galleryName).then(cache =>
      Promise.allSettled(urls.map(url => savePhoto(url, cache)))));
    return;
  }
  const port = event.ports[0];
  if (!port || (action !== "GALLERY_STATUS" && action !== "GALLERY_DOWNLOAD")) return;
  const send = value => port.postMessage(value);
  event.waitUntil(manageGallery(action === "GALLERY_DOWNLOAD", send)
    .catch(error => send({ type: "error", message: error.message })));
});





