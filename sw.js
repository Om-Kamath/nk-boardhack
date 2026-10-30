/* HackBoard service worker — offline support.
 *
 * Cache-first for the core shell (styles, theme, data, app); network-first
 * with cache fallback for everything else, so data-heavy modules (charts,
 * generators, chat) stay fresh when online and keep working offline.
 * Bump CACHE_VERSION to invalidate all cached assets on deploy.
 * Classic worker — no modules, no build step.
 */

const CACHE_VERSION = "hackboard-v1";

/* Same-origin core shell: cache-first. "./" covers navigations to the
 * directory root so the board itself opens offline. */
const CORE_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "custom.css",
  "theme.js",
  "data.js",
  "app.js",
  "script.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(CORE_ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* fonts & cross-origin pass through */

  const file = url.pathname.split("/").pop();
  const isCore = url.pathname.endsWith("/") || CORE_ASSETS.indexOf(file) !== -1;

  if (isCore) {
    /* cache-first: instant shell, refresh the copy in the background */
    event.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, copy); });
          return res;
        });
      })
    );
  } else {
    /* network-first: fresh when online, cached when offline */
    event.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || new Response("Offline — asset not cached yet.", {
            status: 503,
            statusText: "Offline",
            headers: { "Content-Type": "text/plain" }
          });
        });
      })
    );
  }
});
