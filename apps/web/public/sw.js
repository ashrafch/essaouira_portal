// Cleanup service worker used to safely remove stale SW registrations.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      clientsList.forEach((client) => client.navigate(client.url));
    })(),
  );
});

self.addEventListener("fetch", () => {
  // No fetch interception: this worker only exists to unregister itself.
});
