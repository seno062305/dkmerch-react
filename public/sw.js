// DKMerch Service Worker — PWA support
const CACHE_NAME = 'dkmerch-v12-single-splash';

// Only cache essential static assets (never webpack JS bundles)
const STATIC_ASSETS = [
  '/',
  '/rider',
  '/index.html',
  '/manifest.json',
  '/images/dklogo2-removebg-preview.png',
];

function isAppShellAsset(url) {
  const path = url.pathname || '';
  // Dev + prod JS/CSS must always be network — caching bundle.js caused stale module errors
  if (path.startsWith('/static/')) return false;
  if (/\.(?:js|css|map)$/i.test(path)) return false;
  if (path.includes('hot-update')) return false;
  return true;
}

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

  // Never intercept/cache webpack / CRA bundles (fixes stale "Cannot find module" on localhost)
  if (!isAppShellAsset(url)) {
    return;
  }

  // Network first strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache valid responses for static shell assets only
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

/** Normalize notification target to a same-origin path (keeps opens inside the PWA). */
function notifPath(raw) {
  try {
    const u = new URL(String(raw || '/'), self.location.origin);
    if (u.origin !== self.location.origin) {
      return `/${u.pathname.replace(/^\//, '')}${u.search}${u.hash}` || '/';
    }
    return `${u.pathname}${u.search}${u.hash}` || '/';
  } catch {
    return '/';
  }
}

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
  const path = notifPath(data.url || '/');
  let open = '';
  try {
    open = new URL(path, self.location.origin).searchParams.get('open') || '';
  } catch { /* ignore */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DKMerch', {
      body: data.body || 'You have a new notification',
      icon: '/images/dklogo2-removebg-preview.png',
      badge: '/images/dklogo2-removebg-preview.png',
      vibrate: [200, 100, 200],
      tag: open === 'loginAlert' ? 'dkmerch-login-alert' : (data.tag || undefined),
      renotify: open === 'loginAlert',
      data: { url: path, open },
    })
  );
});

// Notification click — focus installed PWA (not a random browser tab) + deep-link
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = notifPath(event.notification.data?.url || '/');
  const open = event.notification.data?.open || '';
  const absolute = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Prefer an already-open app window on this origin
    for (const client of list) {
      if (!client.url.startsWith(self.location.origin)) continue;
      try {
        client.postMessage({
          type: 'DK_NOTIFICATION_OPEN',
          url: absolute,
          open,
        });
      } catch { /* ignore */ }
      if (typeof client.navigate === 'function') {
        try { await client.navigate(path); } catch {
          try { await client.navigate(absolute); } catch { /* ignore */ }
        }
      }
      if ('focus' in client) return client.focus();
    }
    // No open window — openWindow with same-origin URL so Android/iOS reuse the PWA
    if (clients.openWindow) {
      return clients.openWindow(path);
    }
    return undefined;
  })());
});
