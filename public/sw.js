// DKMerch Service Worker — PWA support
const CACHE_NAME = 'dkmerch-v19-notif-splash';

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

  // Never cache API / Convex / non-GET
  if (
    event.request.method !== 'GET'
    || url.pathname.startsWith('/api')
    || url.hostname.includes('convex')
  ) {
    return;
  }

  if (!isAppShellAsset(url)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        if (response.ok && response.type === 'basic') {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

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

/** Prefer installed PWA window; keep loginAlert deep-link + source=pwa */
function openTargetPath(path, open) {
  try {
    const u = new URL(path || '/', self.location.origin);
    if (open === 'loginAlert') {
      u.searchParams.set('open', 'loginAlert');
    }
    if (!u.searchParams.get('source')) {
      u.searchParams.set('source', 'pwa');
    }
    return `${u.pathname}${u.search}${u.hash}` || '/';
  } catch {
    return open === 'loginAlert' ? '/?open=loginAlert&source=pwa' : '/?source=pwa';
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
      icon: '/images/pwa-icon-192.png',
      badge: '/images/pwa-icon-192.png',
      vibrate: [200, 100, 200],
      tag: open === 'loginAlert' ? 'dkmerch-login-alert' : (data.tag || undefined),
      renotify: open === 'loginAlert',
      data: { url: path, open },
    })
  );
});

// Notification click — focus installed PWA + deep-link to the topic (login alert, etc.)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawPath = notifPath(event.notification.data?.url || '/');
  const open = event.notification.data?.open || '';
  const path = openTargetPath(rawPath, open);
  const absolute = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
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
    if (clients.openWindow) {
      return clients.openWindow(path);
    }
    return undefined;
  })());
});
