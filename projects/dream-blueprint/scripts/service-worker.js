// The build prepends the verified list of core files and hashes for gallery photos and sound packs.
const scope = self.registration.scope;
const absolute = file => new URL(file, scope).href;
const prefix = "dream-blueprint:" + scope + ":";
const corePrefix = prefix + "core-";
const coreName = corePrefix + config.version;
const galleryName = prefix + "photos";
const soundName = prefix + "sounds";
const shell = absolute("index.html");
const publication = absolute("publication.html");
const snapshotKey = absolute(".dream-installed-release");
const activatedKey = absolute(".dream-active-release");
const coreURLs = new Set(config.core.map(absolute));
const resourceSets = manifest => ({
  photos: new Map(Object.entries(manifest.gallery).map(([file, hash]) => [absolute(file), { hash, key: absolute(file) + "?photo=" + hash }])),
  sounds: new Map(Object.entries(manifest.sounds).map(([file, hash]) => [absolute(file), { hash, key: absolute(file) + "?sound=" + hash }])),
});
const currentResources = resourceSets(config);
const pageVersions = new Map();
const pending = new Map();
const mediaNotices = new Map();

function notifyMediaChanged(image) {
  const type = image ? "GALLERY_CACHE_CHANGED" : "SOUNDS_CACHE_CHANGED";
  if (!mediaNotices.has(type)) {
    const notice = self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(pages => {
      for (const page of pages) {
        if (page.url.startsWith(scope)) page.postMessage({ type });
      }
    }).catch(() => {}).finally(() => { mediaNotices.delete(type); });
    mediaNotices.set(type, notice);
  }
  return mediaNotices.get(type);
}

async function hasHash(response, hash) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await response.arrayBuffer()));
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
  return hex.startsWith(hash);
}

async function saveResource(resource, cache, image) {
  const { key, hash } = resource;
  const cached = await cache.match(key);
  if (cached) return cached;
  if (!pending.has(key)) {
    const download = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35000);
      let response;
      try {
        response = await fetch(key, { cache: "no-cache", signal: controller.signal });
        if (response.status !== 200 || (image && !response.headers.get("Content-Type")?.startsWith("image/"))
          || !await hasHash(response.clone(), hash)) {
          throw new Error("這個檔案尚未下載完成，請連線後再試一次。");
        }
      } finally {
        clearTimeout(timeout);
      }
      // Online playback still works when the device is full. The explicit download operation checks cache storage separately.
      await cache.put(key, response.clone()).then(() => notifyMediaChanged(image)).catch(() => {});
      return response;
    })();
    pending.set(key, download);
    download.finally(() => pending.delete(key)).catch(() => {});
  }
  return (await pending.get(key)).clone();
}

async function previousResources(version) {
  if (!/^[a-f0-9]{16}$/.test(version)) return null;
  const snapshot = await caches.match(snapshotKey, { cacheName: corePrefix + version });
  return snapshot ? resourceSets(await snapshot.json()) : null;
}

async function resourcesFor(version) {
  return !version || version === config.version ? currentResources : previousResources(version);
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const core = await caches.open(coreName);
    // A previously installed copy of these exact bytes can be reused if the site rolls back a release.
    if (await core.match(snapshotKey)) return;
    try {
      await core.addAll(config.core.map(file => new Request(absolute(file), { cache: "reload" })));
      for (const file of config.core) {
        const response = await core.match(absolute(file));
        if (!response || !await hasHash(response, config.coreHashes[file])) {
          throw new Error("網站還在更新，教材版本不一致。");
        }
      }
      await core.put(snapshotKey, new Response(JSON.stringify({ gallery: config.gallery, sounds: config.sounds })));
    } catch (error) {
      await caches.delete(coreName);
      throw error;
    }
  })());
});

const earlierCores = async () => (await caches.keys()).filter(name => name.startsWith(corePrefix) && name !== coreName);
async function fromEarlierRelease(href) {
  for (const name of await earlierCores()) {
    const hit = await caches.match(href, { cacheName: name });
    if (hit) return hit;
  }
}

let cleaning;
function cleanUnusedReleases() {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    const pages = (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .filter(client => client.url.startsWith(scope) && client.url.split(/[?#]/, 1)[0] !== publication);
    const ids = new Set(pages.map(client => client.id));
    for (const id of pageVersions.keys()) if (!ids.has(id)) pageVersions.delete(id);

    // A legacy page or one that hasn't announced its version may still need any earlier release.
    if (pages.some(client => !pageVersions.has(client.id))) return;
    const live = new Set(pages.map(client => corePrefix + pageVersions.get(client.id)));
    const previous = [];
    for (const name of (await earlierCores()).reverse()) {
      const cacheName = { cacheName: name };
      const activated = await caches.match(activatedKey, cacheName);
      if (activated) {
        previous.push(name);
        continue;
      }
      // An installer may be filling a cache right now, or a completed release may be waiting.
      const installed = await caches.match(snapshotKey, cacheName);
      if (installed && live.has(name)) {
        previous.push(name);
        continue;
      }
      if (self.registration.installing || self.registration.waiting) continue;
      if (installed) {
        // A waiting release can be replaced by a newer build without ever activating.
        await caches.delete(name);
        continue;
      }
      if (await caches.match(shell, cacheName)) previous.push(name);
    }
    // Keep the last complete release as well. An old worker's interrupted addAll could leave an empty cache.
    for (const name of previous) {
      if (await caches.match(shell, { cacheName: name })) {
        live.add(name);
        break;
      }
    }
    const kept = [currentResources];
    for (const name of previous) {
      if (!live.has(name)) await caches.delete(name);
      else kept.push(await previousResources(name.slice(corePrefix.length)));
    }
    // A release installed before snapshots were introduced does not have a list of its media hashes.
    if (kept.includes(null)) return;
    for (const [kind, name] of [["photos", galleryName], ["sounds", soundName]]) {
      const keys = new Set(kept.flatMap(resources => [...resources[kind].values()].map(resource => resource.key)));
      const cache = await caches.open(name);
      let removed = false;
      for (const request of await cache.keys()) {
        if (!keys.has(request.url) && await cache.delete(request)) removed = true;
      }
      if (removed) await notifyMediaChanged(kind === "photos");
    }
  })().finally(() => { cleaning = undefined; });
  return cleaning;
}

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const core = await caches.open(coreName);
    await core.put(activatedKey, new Response(config.version)).catch(() => {});
    await self.clients.claim();
    await cleanUnusedReleases().catch(() => {});
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(scope)) return;
  const url = new URL(request.url);
  const version = url.searchParams.get("release");
  url.search = "";
  if (request.mode === "navigate" && (!coreURLs.has(url.href) || url.href === shell)) {
    // Serve the shell that belongs to this worker. A waiting release has already stored every file before it can activate.
    event.respondWith((async () => {
      const saved = await caches.match(shell, { cacheName: coreName });
      return saved || fetch(request);
    })());
    return;
  }
  const image = url.href.startsWith(absolute("cosmos/"));
  if (image || url.href.startsWith(absolute("pron/"))) {
    event.respondWith((async () => {
      const resources = await resourcesFor(version || pageVersions.get(event.clientId));
      const resource = resources?.[image ? "photos" : "sounds"].get(url.href);
      if (!resource) return fetch(request);
      try { return await saveResource(resource, await caches.open(image ? galleryName : soundName), image); }
      catch { return Response.error(); }
    })());
    return;
  }
  if (coreURLs.has(url.href)) {
    event.respondWith((async () => (await caches.match(url.href, { cacheName: coreName })) || fetch(request))());
    return;
  }
  if (url.href.startsWith(absolute("assets/"))) {
    event.respondWith((async () => (await fromEarlierRelease(url.href)) || fetch(request))());
  }
});

async function manageResources(resources, image, download, send) {
  const cache = await caches.open(image ? galleryName : soundName);
  const cached = new Set((await cache.keys()).map(request => request.url));
  const missing = [...resources.values()].filter(resource => !cached.has(resource.key));
  const total = resources.size;
  let done = total - missing.length;
  send({ type: "progress", done, total });
  if (download) {
    const worker = async () => {
      while (missing.length) {
        const resource = missing.pop();
        await saveResource(resource, cache, image);
        if (!await cache.match(resource.key)) throw new Error("儲存空間不足。");
        send({ type: "progress", done: ++done, total });
      }
    };
    // Limit network competition with practice screens. A retry reuses everything already saved.
    const results = await Promise.allSettled([worker(), worker(), worker()]);
    if (results.some(result => result.status === "rejected")) {
      throw new Error(image
        ? "部分照片還沒存好，請確認網路與裝置空間後接著下載。"
        : "部分發音還沒存好，請確認網路與裝置空間後接著下載。");
    }
  }
  const saved = new Set((await cache.keys()).map(request => request.url));
  done = [...resources.values()].filter(resource => saved.has(resource.key)).length;
  send({ type: "complete", done, total });
}

self.addEventListener("message", event => {
  const action = event.data?.type;
  if (action === "ACTIVATE_UPDATE") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  const version = event.data?.version;
  if (action === "PRIME_COVER") {
    // Legacy register scripts automatically reload when told about another version. Leave those pages alone.
    if (/^[a-f0-9]{16}$/.test(version) && event.source?.id) {
      pageVersions.set(event.source.id, version);
      event.source.postMessage({ type: "APP_SHELL", version: config.version });
    }
    event.waitUntil((async () => {
      const resource = (await resourcesFor(version))?.photos.get(absolute(config.fallback));
      if (resource) await saveResource(resource, await caches.open(galleryName), true);
    })().catch(() => {}));
    event.waitUntil(cleanUnusedReleases().catch(() => {}));
    return;
  }
  if (action === "SAVE_VIEWED_PHOTOS" && Array.isArray(event.data.urls)) {
    event.waitUntil((async () => {
      const photos = (await resourcesFor(version))?.photos;
      if (!photos) return;
      const cache = await caches.open(galleryName);
      const viewed = [...new Set(event.data.urls)].map(url => photos.get(url)).filter(Boolean);
      await Promise.allSettled(viewed.map(resource => saveResource(resource, cache, true)));
    })());
    return;
  }
  const port = event.ports[0];
  const gallery = action === "GALLERY_STATUS" || action === "GALLERY_DOWNLOAD";
  const sounds = action === "SOUNDS_STATUS" || action === "SOUNDS_DOWNLOAD";
  if (!port || (!gallery && !sounds)) return;
  const send = value => port.postMessage(value);
  event.waitUntil((async () => {
    const resources = await resourcesFor(version || pageVersions.get(event.source?.id));
    if (!resources) throw new Error("此版本的離線教材尚未就緒。");
    await manageResources(resources[gallery ? "photos" : "sounds"], gallery, action.endsWith("_DOWNLOAD"), send);
  })().catch(error => send({ type: "error", message: error.message })));
});
