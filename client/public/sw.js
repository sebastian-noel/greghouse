/* Web Push receiver for the installed garden app. Kept dependency-free so it
   is served directly from the app root and controls every route. */
self.addEventListener('push', event => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch (e) { message = {}; }
  const title = message.title || 'Desert Rose House';
  event.waitUntil(self.registration.showNotification(title, {
    body: message.body || 'A plant needs your attention.',
    icon: '/garden-icon.svg',
    badge: '/garden-icon.svg',
    tag: message.tag || 'desert-rose-reminder',
    renotify: true,
    data: message.data || { url: '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return clients.openWindow(target);
  })());
});
