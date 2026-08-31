// Browser Web Push service worker. Registered by src/lib/push-notifications.ts.
// Scope is the site root so a single subscription covers the whole app.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'New notification', body: event.data.text() };
  }

  const title = payload.title || 'DocumentAI';
  const options = {
    body: payload.body || '',
    icon: payload.icon || undefined,
    tag: payload.tag || 'default',
    data: { url: payload.url || '/dashboard' },
    // Groups repeated notifications of the same tag instead of stacking dozens of separate ones.
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Reuse an already-open tab if one exists, rather than opening a new one every time.
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
