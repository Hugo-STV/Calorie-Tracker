// v4 — force cache bust
const CACHE = 'caltrack-v4';
const ASSETS = [
  '/Calorie-Tracker/',
  '/Calorie-Tracker/index.html',
  '/Calorie-Tracker/manifest.json',
  '/Calorie-Tracker/icon-192.png',
  '/Calorie-Tracker/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('openfoodfacts') ||
      url.hostname.includes('nal.usda') ||
      url.hostname.includes('upcitemdb') ||
      url.hostname.includes('cdnjs') ||
      url.hostname.includes('jsdelivr')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', {status: 503})));
    return;
  }
  // Network first for the app shell so updates always come through
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
