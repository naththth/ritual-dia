/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });

// Lembretes
self.addEventListener('push', (event) => {
  let d: any = {};
  try { d = event.data?.json() ?? {}; } catch { d = { title: 'Ritual', body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(d.title ?? 'Ritual', {
    body: d.body ?? '',
    tag: d.tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: d.url }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? self.registration.scope;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) { await (c as WindowClient).navigate(url).catch(() => undefined); return (c as WindowClient).focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
