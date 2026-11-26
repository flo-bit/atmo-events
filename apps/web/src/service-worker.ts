/// <reference lib="webworker" />
import { handlePush } from '@atmo-dev/notify/sw';
declare const self: ServiceWorkerGlobalScope;

// Deliberately no fetch handler or offline cache for session-dependent pages.
handlePush(self, { icon: '/icon-192.png', fallbackUrl: '/notifications' });
self.addEventListener('install', () => {
	void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});
