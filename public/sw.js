const CACHE_NAME = "ghost-chat-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json"
];

// Install — cache assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — serve from cache, fallback to network
self.addEventListener("fetch", (e) => {
  // Don't cache socket.io or API calls
  if (e.request.url.includes("socket.io") || e.request.url.includes("/messages/")) {
    return fetch(e.request);
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
