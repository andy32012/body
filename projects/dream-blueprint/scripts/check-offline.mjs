import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const scope = "https://example.test/body/dream/";
const prefix = "dream-blueprint:" + scope + ":";
const read = file => readFile(path.join(dist, file));
const address = key => typeof key === "string" ? key : key.url;

async function browserHarness() {
  const listeners = new Map();
  const buckets = new Map();
  const requests = [];
  const controls = { offline: false, skipWaiting: false, claimed: false };
  const network = async input => {
    const url = address(input);
    assert.ok(url.startsWith(scope));
    requests.push(url);
    if (controls.offline) throw new Error("本測試已斷網");
    const file = decodeURIComponent(new URL(url).pathname.slice(new URL(scope).pathname.length));
    return new Response(await read(file), { headers: {
      "Content-Type": /\.(?:webp|png|jpg|jpeg|avif)$/.test(file) ? "image/" + file.split(".").pop() : "text/plain"
    } });
  };
  const cacheStorage = {
    async open(name) {
      if (!buckets.has(name)) {
        const records = new Map();
        buckets.set(name, {
          async keys() { return [...records.keys()].map(key => new Request(key)); },
          async addAll(requests) { for (const request of requests) records.set(address(request), await network(request)); },
          async put(key, response) { records.set(address(key), response); },
          async match(key) { return records.get(address(key))?.clone(); },
          async delete(key) { return records.delete(address(key)); }
        });
      }
      return buckets.get(name);
    },
    async keys() { return [...buckets.keys()]; },
    async delete(key) { return buckets.delete(key); }
  };
  const context = {
    self: {
      registration: { scope },
      clients: { claim: async () => {controls.claimed = true;} },
      skipWaiting: async () => {controls.skipWaiting = true;},
      addEventListener: (type, fn) => listeners.set(type, fn)
    },
    caches: cacheStorage, URL, Request, Response, fetch: network
  };
  const workerSource = (await read("sw.js")).toString();
  vm.runInNewContext(workerSource, context);
  const config = JSON.parse(workerSource.split("\n")[0].replace(/^const config = |;$/g, ""));
  const dispatch = async (type, event = {}) => {
    const promises = [];
    listeners.get(type)({ ...event, waitUntil: promise => promises.push(promise) });
    await Promise.all(promises);
  };
  const request = async (file, mode = "cors") => {
    let result;
    listeners.get("fetch")({ request: { url: new URL(file, scope).href, mode, method: "GET" },
      respondWith: promise => { result = promise; } });
    return result;
  };
  const message = async type => {
    let last;
    await dispatch("message", { data: { type }, ports: [{ postMessage: value => { last = value; } }] });
    return last;
  };
  return { config, controls, requests, caches: cacheStorage, dispatch, request, message };
}

test("子目錄安裝、核心離線與更新不連帶刪除其他網站及圖庫", async () => {
  const manifest = JSON.parse((await read("manifest.webmanifest")).toString("utf8").replace(/^\uFEFF/, ""));
  assert.equal(new URL(manifest.scope, scope).href, scope);
  assert.equal(new URL(manifest.start_url, scope).href, scope);
  for (const icon of manifest.icons) {
    const bytes = await read(icon.src);
    const [width, height] = icon.sizes.split("x").map(Number);
    assert.equal(bytes.readUInt32BE(16), width);
    assert.equal(bytes.readUInt32BE(20), height);
  }
  const html = (await read("index.html")).toString();
  assert.match(html, /href="\.\/manifest.webmanifest"/);
  assert.match(html, /src="\.\/register-sw.js"/);
  assert.ok(html.includes('rel="license" href="./publication.html"'));
  const app = await browserHarness();
  const unrelated = "dream-blueprint:https://example.test/other/:old";
  await app.caches.open(unrelated);
  await app.caches.open(prefix + "old");
  await app.dispatch("install");
  assert.equal(app.requests.filter(url => url.includes("/cosmos/") && /\.(webp|png|jpeg|jpg|avif)/.test(url)).length, 0);
  assert.equal(app.controls.skipWaiting, true);
  await app.dispatch("activate");
  const names = await app.caches.keys();
  assert.ok(names.includes(unrelated));
  assert.ok(!names.includes(prefix + "old"));
  assert.ok(names.includes(prefix + "photos"));
  assert.equal(app.controls.claimed, true);
  app.controls.offline = true;
  assert.equal(await (await app.request("./", "navigate")).text(), html);
  const publication = (await read("publication.html")).toString();
  assert.equal(await (await app.request("publication.html", "navigate")).text(), publication);
  assert.equal((publication.match(/<li><h2>/g) || []).length, Object.keys(app.config.gallery).length);
  for (const asset of await readdir(path.join(dist, "assets"))) {
    if (asset.endsWith(".map")) continue;
    assert.ok((await (await app.request("assets/" + asset)).arrayBuffer()).byteLength, asset);
  }
  assert.equal(await app.request("https://example.test/other/", "navigate"), undefined);
});

test("分開儲存預設首圖、已看照片與整套圖鑑，斷線下載可續傳", async t => {
  const app = await browserHarness();
  const photos = Object.keys(app.config.gallery);
  if (photos.length === 0) { t.skip("此建置尚未含照片"); return; }
  assert.ok(photos.includes("cosmos/n01.webp"));
  await app.dispatch("install");
  await app.dispatch("activate");
  await app.message("PRIME_COVER");
  const other = photos.find(file => file !== app.config.fallback);
  assert.equal((await app.message("GALLERY_STATUS")).done, 1);
  app.controls.offline = true;
  assert.deepEqual(Buffer.from(await (await app.request(app.config.fallback)).arrayBuffer()), await read(app.config.fallback));
  assert.equal((await app.request(other)).type, "error");
  assert.equal((await app.message("GALLERY_DOWNLOAD")).type, "error");
  app.controls.offline = false;
  assert.deepEqual(Buffer.from(await (await app.request(other)).arrayBuffer()), await read(other));
  assert.equal((await app.message("GALLERY_STATUS")).done, 2);
  const saved = await app.message("GALLERY_DOWNLOAD");
  assert.equal(saved.done, photos.length);
  assert.equal(saved.total, photos.length);
  const count = app.requests.length;
  app.controls.offline = true;
  assert.equal((await app.message("GALLERY_DOWNLOAD")).done, photos.length);
  assert.equal(app.requests.length, count);
  for (const file of photos) {
    assert.deepEqual(Buffer.from(await (await app.request(file)).arrayBuffer()), await read(file));
  }
});

