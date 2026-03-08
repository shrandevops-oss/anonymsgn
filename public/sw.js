// ghost. service worker v4 — force cache clear
const CACHE = "ghost-v4";

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network first — no caching (fixes stale file issues)
self.addEventListener("fetch", e => {
  if (e.request.url.includes("socket.io") || e.request.url.includes("fonts.googleapis")) {
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
