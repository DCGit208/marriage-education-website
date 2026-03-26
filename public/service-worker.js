// KILL SWITCH — clears all broken caches and self-unregisters.
// Any browser that had the old broken SW will download this,
// wipe its caches, unregister itself, and force a clean page reload.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
      .then(() =>
        self.clients.matchAll({ type: "window", includeUncontrolled: true })
          .then((clients) =>
            Promise.all(clients.map((c) => c.navigate(c.url).catch(() => {})))
          )
      )
  );
});
