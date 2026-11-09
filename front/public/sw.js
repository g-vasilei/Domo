/// <reference lib="webworker" />

const worker = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

worker.addEventListener('push', (event) => {
  const message = event.data?.json();
  if (!message) return;
  event.waitUntil(
    worker.registration.showNotification(message.title, {
      body: message.body,
      tag: message.id,
      data: { url: message.url || '/' },
    }),
  );
});
worker.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL(event.notification.data?.url || '/', worker.location.origin);
      if (url.origin !== worker.location.origin) return;
      const tabs = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const tab of tabs) {
        if (new URL(tab.url).origin === url.origin) {
          await tab.navigate(url.href);
          await tab.focus();
          return;
        }
      }
      await worker.clients.openWindow(url.href);
    })(),
  );
});
