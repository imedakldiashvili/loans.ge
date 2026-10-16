// Service worker: shows browser notifications pushed by the API (Web Push) and opens the cabinet on click.
self.addEventListener('push', (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {
    m = { title: event.data ? event.data.text() : 'loans.ge' };
  }
  event.waitUntil(
    self.registration.showNotification(m.title || 'loans.ge', { body: m.body || '', tag: m.tag, icon: '/favicon.png', data: { url: m.url || '/' } }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
