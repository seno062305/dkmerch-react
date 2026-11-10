// DKMerch Service Worker — PWA support
const CACHE_NAME = 'dkmerch-v5-splash-pod';

// Only cache essential static assets
const STATIC_ASSETS = [
  '/',
  '/rider',
  '/index.html',
  '/manifest.json',
  '/images/dklogo2-removebg-preview.png',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Silently fail if some assets can't be cached
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
// Always fetch fresh for API/Convex calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Convex, PayMongo, external APIs — always network
  if (
    url.hostname.includes('convex.cloud') ||
    url.hostname.includes('convex.dev') ||
    url.hostname.includes('paymongo.com') ||
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('router.project-osrm.org') ||
    url.hostname.includes('resend.com')
  ) {
    return;
  }

  // Network first strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache valid responses for static assets
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Push notifications → system tray (installed PWA / supported browsers)
self.addEventListener('push', (event) => {
  let data = { title: 'DKMerch', body: 'You have a new update', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      data.body = event.data?.text() || data.body;
    } catch { /* ignore */ }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DKMerch', {
      body: data.body || 'You have a new notification',
      icon: '/images/dklogo2-removebg-preview.png',
      badge: '/images/dklogo2-removebg-preview.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
    })
  );
});

// Notification click — focus existing tab or open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate?.(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});