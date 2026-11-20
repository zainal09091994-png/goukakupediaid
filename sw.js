/* Service Worker Goukaku Pedia ID — build ce5e03b9
 * - Aset aplikasi: stale-while-revalidate (buka instan, update di latar)
 * - API Apps Script: SELALU jaringan (tidak pernah di-cache)
 * - Font & pustaka CDN: cache-first */
const VER = 'gp-ce5e03b9';
const CORE = ['./', './index.html', './css/style.css?v=ce5e03b9', './js/config.js?v=ce5e03b9', './js/app.js?v=ce5e03b9', './manifest.json', './favicon.png', './logo.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/script\.google(usercontent)?\.com$/.test(url.hostname) || /youtube|ytimg|googlevideo|zoom\.us|lynk\.id|wa\.me/.test(url.hostname)) return;
  const cdn = /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|lh3\.googleusercontent\.com/.test(url.hostname);
  if (cdn) {
    e.respondWith(caches.open(VER).then(async c => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.open(VER).then(async c => {
    const key = req.mode === 'navigate' ? './index.html' : req;
    const hit = await c.match(key);
    const net = fetch(req).then(r => { if (r.ok) c.put(key, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
