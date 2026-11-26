const config = {"entry":"assets/index-WFSAfnnP.js","version":"5e4b8abd4a762d6a","core":["assets/bridge-Bf1iI0eU.js","assets/index-B8Ff0OMH.css","assets/index-WFSAfnnP.js","assets/lessons-CPQvmOKR.js","assets/nursing-listening-BMKk4mDs.js","assets/nursing-reading-B9Ecsp8E.js","assets/nursing-words-BTufY05s.js","assets/passages-BcVRhPc8.js","assets/reading-DZ2JZyp8.js","assets/writing-DlkFeezA.js","ecdict-license.txt","icon-192.png","icon-512.png","icon-maskable.png","index.html","manifest.webmanifest","publication.html","register-sw.js"],"gallery":{"cosmos/d01.webp":"d7995e5a2504cac6","cosmos/d02.webp":"59a9eb6f3ccdb829","cosmos/d03.webp":"13fe7a1c87a1b730","cosmos/d04.webp":"814edc779a512625","cosmos/d05.webp":"c96b70f0059814bd","cosmos/d06.webp":"03286467a8e27f22","cosmos/d07.webp":"cd1e514786dfcabb","cosmos/d08.webp":"851ea290b95541fd","cosmos/d09.webp":"b1fcfb56bdafdf9d","cosmos/d10.webp":"eddd4207802517ce","cosmos/g01.webp":"ba70ee829e73af51","cosmos/g02.webp":"3debb42def81dfe8","cosmos/g03.webp":"3e0bf75222ebaf47","cosmos/g04.webp":"e09b07a31ec487b4","cosmos/g05.webp":"3739483261d4f2f0","cosmos/g06.webp":"f31c432169fa898a","cosmos/g07.webp":"e71cd0c07e7b1cfd","cosmos/g08.webp":"f4d012878208c893","cosmos/g09.webp":"8f6a680983dbd57f","cosmos/g10.webp":"6d085105a6fcfefd","cosmos/g11.webp":"255e80d74b2236a1","cosmos/g12.webp":"f22901e664aff215","cosmos/n01.webp":"a2f708245c1d13d1","cosmos/n02.webp":"f6777fffc7e0277e","cosmos/n03.webp":"62c29676d8e25b56","cosmos/n04.webp":"11fccf18b53321a7","cosmos/n05.webp":"a268fdfa9bbee20d","cosmos/n06.webp":"5895e66e6f8c71b9","cosmos/n07.webp":"dd82ab3bb6efeea1","cosmos/n08.webp":"467b1c3c9377340a","cosmos/n09.webp":"fa26ba4850c11a6f","cosmos/n10.webp":"faad3c4532db29dc","cosmos/n11.webp":"fe362c772233ad31","cosmos/n12.webp":"ebbb3cc104352932","cosmos/p01.webp":"174b1b97e02d8ab7","cosmos/p02.webp":"b13d8695ffdcd53c","cosmos/p03.webp":"3aa5a1176f52d047","cosmos/p04.webp":"93a0e7e4aff7f808","cosmos/p05.webp":"3131d948bcafc029","cosmos/p06.webp":"2a90bc2a80c2d73d","cosmos/p07.webp":"5616ba650c057c6b","cosmos/p08.webp":"a64d406c35164491","cosmos/p09.webp":"ab03d64c8f11e786","cosmos/p10.webp":"94f54132dab8fb93","cosmos/p11.webp":"0ab2932e5e53feda","cosmos/p12.webp":"cbe2db69baecc254","cosmos/s01.webp":"f156be17070acaac","cosmos/s02.webp":"493f7184553961c1","cosmos/s03.webp":"d6fbb4415a46672d","cosmos/s04.webp":"ee4ecc3b49ce21fe","cosmos/s05.webp":"93021b66958e3198","cosmos/s06.webp":"5cd364084bf3f7a6","cosmos/s07.webp":"286ee2d7c0dff291","cosmos/s08.webp":"a13527a73327fdad","cosmos/s09.webp":"8a41fbfc8d88bead","cosmos/s10.webp":"623fd6bc5bcb4104"},"sounds":{"pron/p00-f.pack":"32e876b4a921a9d7","pron/p00-m.pack":"59500544045b4b6a","pron/p01-f.pack":"9ace237210c1feee","pron/p01-m.pack":"2c85f9598cf727a2","pron/p02-f.pack":"acf2fe5817c7ed47","pron/p02-m.pack":"becaf768edfabf0a","pron/p03-f.pack":"f63aba1cfd7a2067","pron/p03-m.pack":"a46e27ae1da09033","pron/p04-f.pack":"3d4da474341560dd","pron/p04-m.pack":"3afb42c24e7a8d2e","pron/p05-f.pack":"81ddc79d03441127","pron/p05-m.pack":"c12cd057fc28a6f2","pron/p06-f.pack":"a721255b33af376f","pron/p06-m.pack":"01914422640d6183","pron/p07-f.pack":"e57cff82c7e729bf","pron/p07-m.pack":"28f659ddfdbc0147","pron/p08-f.pack":"3bfc63bc8e0c1325","pron/p08-m.pack":"9070d64853aee81d","pron/p09-f.pack":"473b7b0f814ef65f","pron/p09-m.pack":"0d933e11fcb88d01","pron/p10-f.pack":"b49a615bf4aaf5bb","pron/p10-m.pack":"5a1f7fa34b116d6f","pron/p11-f.pack":"c95466658452bbe2","pron/p11-m.pack":"bcd11282990e50e9","pron/p12-f.pack":"f1eb47c726793424","pron/p12-m.pack":"b805bfb0f68b6b6f","pron/p13-f.pack":"e865918cf83b1d54","pron/p13-m.pack":"eef8f48ce588ad7f","pron/p14-f.pack":"3e1e695bf3bba8dc","pron/p14-m.pack":"75660166643a51ad","pron/p15-f.pack":"d65b58d3eb762e07","pron/p15-m.pack":"6a64af9f125921ec","pron/p16-f.pack":"7ca7864d4bf063d7","pron/p16-m.pack":"e66939fc384755f7"},"fallback":"cosmos/n01.webp"};
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
// Pronunciation packs: kept the first time a lesson is opened (or all at once from the course page), across app updates.
const soundName = prefix + "sounds";
const sounds = new Map(Object.entries(config.sounds || {}).map(([file, hash]) => {
  const url = absolute(file);
  return [url, url + "?sound=" + hash];
}));
const soundKeys = new Set(sounds.values());
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
      if (name.startsWith(prefix) && name !== coreName && name !== galleryName && name !== soundName) await caches.delete(name);
    }
    await self.clients.claim();
    const gallery = await caches.open(galleryName);
    for (const request of await gallery.keys()) {
      if (!photoKeys.has(request.url)) await gallery.delete(request);
    }
    const kept = await caches.open(soundName);
    for (const request of await kept.keys()) {
      if (!soundKeys.has(request.url)) await kept.delete(request);
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
  if (sounds.has(url.href)) {
    event.respondWith((async () => {
      const key = sounds.get(url.href);
      const kept = await caches.open(soundName);
      const cached = await kept.match(key);
      if (cached) return cached;
      try {
        const response = await fetch(key, { cache: "no-cache" });
        // Only a whole, successful download is kept; a full device still gets to play it this once.
        if (response.status === 200) await kept.put(key, response.clone()).catch(() => {});
        return response;
      } catch { return Response.error(); }
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





