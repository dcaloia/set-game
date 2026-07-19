/*
 * Stale-while-revalidate service worker.
 *
 * Everything is precached on install, so the app works with no network at all
 * after a single visit. Requests are served from cache immediately, but a
 * fresh copy is fetched in the background and used on the next launch.
 *
 * A plain cache-first worker would be simpler, but it pins clients to whatever
 * they cached first — an updated build then never reaches an installed app
 * unless CACHE is bumped by hand every single release, which is exactly the
 * kind of step that gets forgotten.
 */

const CACHE = 'set-v2';

const ASSETS = [
  '.',
  'index.html',
  'styles.css',
  'game.js',
  'ui.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request);

      const network = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => null);

      // Cached copy wins the race so launches stay instant and work offline;
      // the network copy lands in the cache for next time.
      if (hit) {
        event.waitUntil(network);
        return hit;
      }
      return (await network) || cache.match('index.html');
    })
  );
});
