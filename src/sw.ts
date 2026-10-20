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
    badge: 'icons/badge-96.png',
    data: { url: d.url },
    // Alarme de acordar: vibra mais e fica na tela até ser tocado.
    ...(d.alarm ? { requireInteraction: true, renotify: true, vibrate: [600, 300, 600, 300, 600, 300, 1200] } : { vibrate: [200, 100, 200] })
  } as NotificationOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Abre sempre na janela do app instalado (marcada com ?app=1), nunca numa aba do Chrome.
  const raw: string = event.notification.data?.url ?? self.registration.scope;
  const hash = raw.includes('#') ? raw.slice(raw.indexOf('#')) : '#/';
  const target = self.registration.scope + '?app=1' + hash;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = all.find((c) => c.url.startsWith(self.registration.scope) && c.url.includes('app=1')) as WindowClient | undefined;
    if (app) { await app.navigate(target).catch(() => undefined); return app.focus(); }
    return self.clients.openWindow(target);
  })());
});
