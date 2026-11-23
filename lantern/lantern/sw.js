// Lantern service worker: makes the app open instantly and work offline.
// It only ever caches this site's own files. Requests to other sites (search APIs, Supabase) are never touched,
// so account tokens and search results are never stored by the worker.

const VERSION = "lantern-v1";
const SHELL = [
  "./",
  "index.html",
  "config.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "css/tokens.css",
  "css/app.css",
  "css/components.css",
  "js/app.js",
  "js/auth.js",
  "js/infer.js",
  "js/score.js",
  "js/search.js",
  "js/sources.js",
  "js/store.js",
  "js/taxonomy.js",
  "js/theme-init.js",
  "js/util.js",
  "js/catalog/index.js",
  "js/catalog/tech.js",
  "js/catalog/general.js",
  "js/ui/account.js",
  "js/ui/components.js",
  "js/ui/detail.js",
  "js/ui/views.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // leave everything else to the network

  // Stale-while-revalidate: instant from cache, quietly refreshed in the background.
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
      const network = fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || (req.mode === "navigate" ? cache.match("index.html") : Response.error()));
      return cached || network;
    }),
  );
});
