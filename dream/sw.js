const scope = self.registration.scope;
const prefix = "dream-blueprint:" + scope + ":";
const cacheName = prefix + "a026671456d9e3f6";
const urls = ["assets/index-CXpDhF0i.js","assets/index-Dm77fHge.css","ecdict-license.txt","icon-192.png","icon-512.png","icon-maskable.png","index.html","manifest.webmanifest","orbit.webp","register-sw.js"].map(file => new URL(file, scope).href);
const assets = new Set(urls);
const shell = new URL("index.html", scope).href;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(urls.map(url => new Request(url, {cache: "reload"})))
  ));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(scope)) return;
  const key = request.mode === "navigate" ? shell : request.url;
  if (!assets.has(key)) return;
  event.respondWith((async () => {
    const hit = await (await caches.open(cacheName)).match(key);
    return hit || fetch(request);
  })());
});
