// Fuel offline cache: app files and the food database are cached so search and logging work offline.
// Pages and scripts: network first (updates show right away), cache fallback. Database and scanner: cache first.
const CACHE = 'fuel-v3';
const CORE = ['./', './index.html', './manifest.json', './app/runtime.js', './app/fuel.js', './vendor/preact.min.umd.js', './icons/icon-192.png', './icons/icon-512.png'];
const HEAVY = ['./foods-db.json', './vendor/zxing-reader.js', './vendor/zxing_reader.wasm'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((a) => new Request(a, { cache: 'reload' })))
    .then(() => c.addAll(HEAVY).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) {
    // fonts are cached once fetched; Firebase and Open Food Facts always go to the network
    if (u.hostname.includes('fonts.g')) e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })));
    return;
  }
  const heavy = /foods-db\.json$|zxing/.test(u.pathname);
  if (heavy) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return res; })));
    return;
  }
  e.respondWith(fetch(u.href, { cache: 'no-store', credentials: 'same-origin' }).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))));
});
