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
  const controls = { offline: false, skipWaiting: false, claimed: false, shell: null };
  const network = async input => {
    const url = address(input);
    assert.ok(url.startsWith(scope));
    requests.push(url);
    if (controls.offline) throw new Error("本測試已斷網");
    const file = decodeURIComponent(new URL(url).pathname.slice(new URL(scope).pathname.length));
    if (file === "index.html" && controls.shell) return controls.shell.clone();
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
    caches: cacheStorage, URL, Request, Response, AbortSignal, fetch: network
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

test("重新開啟時讀取最新網頁，斷網或收到錯誤頁時仍保留完整離線版本", async () => {
  const app = await browserHarness();
  await app.dispatch("install");
  const installed = (await read("index.html")).toString();
  app.controls.shell = new Response("<!doctype html><title>新版</title>", { headers: { "Content-Type": "text/html" } });
  assert.match(await (await app.request("./", "navigate")).text(), /新版/);
  app.controls.shell = new Response("更新中", {status: 503});
  assert.equal(await (await app.request("index.html", "navigate")).text(), installed);
  app.controls.offline = true;
  assert.equal(await (await app.request("./", "navigate")).text(), installed);
});

test("切換版本會等到離開目前頁面，讓進行中的練習保留原始輸入", async () => {
  const windowEvents = new Map(), workerEvents = new Map();
  const controller = { postMessage() {} };
  const installed = "assets/index-current.js";
  const worker = {
    controller,
    register: async () => ({}),
    ready: Promise.resolve(),
    addEventListener: (name, handler) => workerEvents.set(name, handler)
  };
  let reloads = 0;
  const shown = [];
  vm.runInNewContext((await read("register-sw.js")).toString(), {
    Date,
    URL,
    navigator: { serviceWorker: worker },
    window: {
      isSecureContext: true,
      addEventListener: (name, handler) => windowEvents.set(name, handler),
      setInterval() {},
      setTimeout() {},
      location: { reload() { reloads++; } }
    },
    document: {
      currentScript: { src: scope + "register-sw.js" },
      querySelector: () => ({ src: scope + installed }),
      addEventListener() {},
      body: { appendChild: node => shown.push(node) },
      getElementById: () => shown[0] ?? null,
      createElement: () => ({ setAttribute() {}, addEventListener() {} })
    },
    performance: { getEntriesByType: () => [] }
  });
  await new Promise(resolve => setImmediate(resolve));
  const announce = script => workerEvents.get("message")({ source: controller, data: {type: "APP_SHELL", script} });
  const navigate = (from, to) => windowEvents.get("hashchange")({oldURL: scope + from, newURL: scope + to});
  announce(installed);
  navigate("#today", "#practice/normal");
  assert.equal(shown.length, 0, "同一版不出現更新按鈕");
  announce("assets/index-next.js");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(shown.length, 1, "新版本好了：出現「點一下更新」");
  announce("assets/index-next.js");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(shown.length, 1, "按鈕只出現一個");
  workerEvents.get("controllerchange")();
  navigate("#practice/normal", "#practice/high");
  assert.equal(reloads, 0);
  navigate("#practice/high", "#today");
  assert.equal(reloads, 1);
  // Inside the practice library: another kind of practice switches; another task of the same kind does not.
  navigate("#library/writing/t1-101", "#library/writing/t1-102");
  assert.equal(reloads, 1, "同一種練習換題不切換");
  navigate("#library/reading", "#library/writing");
  assert.equal(reloads, 2, "換到另一種練習就換新版");
});

test("換新版以後，還開著的舊頁面要讀舊版的教材檔，也讀得到（稽核 R-08）", async () => {
  const app = await browserHarness();
  // The release before: one of its lesson files is no longer published.
  const oldCore = prefix + "core-older";
  const oldFile = scope + "assets/writing-OLD123.js";
  await (await app.caches.open(prefix + "core-oldest")).put(scope + "assets/x.js", new Response("x"));
  await (await app.caches.open(oldCore)).put(oldFile, new Response("old writing"));
  await app.dispatch("install");
  await app.dispatch("activate");
  const names = await app.caches.keys();
  assert.ok(names.includes(oldCore), "剛被換掉的那一版先留著");
  assert.ok(!names.includes(prefix + "core-oldest"), "更早的版本清掉");
  app.controls.offline = true;
  assert.equal(await (await app.request("assets/writing-OLD123.js")).text(), "old writing");
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


test("發音包不跟著安裝下載；開過的那一堂斷網也能播，換版本不清掉", async t => {
  const app = await browserHarness();
  const packs = Object.keys(app.config.sounds);
  if (packs.length === 0) { t.skip("此建置尚未含發音包"); return; }
  assert.ok(packs.every(file => /^pron\/p\d+-[fm]\.pack$/.test(file)));
  assert.ok(!app.config.core.some(file => file.startsWith("pron/")));
  await app.dispatch("install");
  assert.equal(app.requests.filter(url => url.includes("/pron/")).length, 0);
  await app.dispatch("activate");
  const [first, second] = packs;
  assert.deepEqual(Buffer.from(await (await app.request(first)).arrayBuffer()), await read(first));
  const count = app.requests.length;
  assert.deepEqual(Buffer.from(await (await app.request(first)).arrayBuffer()), await read(first));
  assert.equal(app.requests.length, count);
  app.controls.offline = true;
  assert.deepEqual(Buffer.from(await (await app.request(first)).arrayBuffer()), await read(first));
  assert.equal((await app.request(second)).type, "error");
  await app.dispatch("activate");
  assert.ok((await app.caches.keys()).includes(prefix + "sounds"));
  assert.deepEqual(Buffer.from(await (await app.request(first)).arrayBuffer()), await read(first));
});
