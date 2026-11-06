// GridRune service worker: keeps the game itself (page, program files, pictures) on the device, so it starts fast
// and opens without internet. Everything that counts – accounts, saving, rewards, online duels – still goes to the
// server live and is never answered from the cache.
const CACHE = 'gridrune-v1';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gridrune-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only the game's own files; the server engine for the server functions is not needed in the browser.
  if (url.origin !== self.location.origin || url.pathname.includes('/server/')) return;

  // The page: always the newest version when online (a new release shows up at the next start), the saved one offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Program files and pictures: their names change with every release, so a saved copy is always right.
  event.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      if (res.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/icons/'))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
