self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "InGamePin Admin", {
    body: data.body || "You have a new update.",
    icon: "/admin-icon-192.png",
    badge: "/admin-icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/admin" },
    vibrate: [200, 100, 200],
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/admin"));
});
