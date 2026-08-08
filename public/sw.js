// Offline shell + model cache. Deliberately small.
// ponytail: no Workbox. Two caches, three fetch rules, one upgrade path (bump VERSION).

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const MODELS = 'models-v1';   // NOT versioned: 80MB of weights must survive app updates

const PRECACHE = ['./', './read/', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL).then(c => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 1. Voice model weights — cache first, forever. This is the expensive one.
  if (/huggingface\.co|hf\.co|cdn-lfs/.test(url.hostname) || /\.onnx($|\?)/.test(url.pathname)) {
    event.respondWith(
      caches.open(MODELS).then(async cache => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone()).catch(() => {});
        return res;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 2. Build assets are content-hashed — cache first is safe and fast.
  if (url.pathname.includes('/_next/static/')) {
    event.respondWith(
      caches.open(SHELL).then(async cache => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
      })
    );
    return;
  }

  // 3. Pages — network first so a redeploy is picked up, cache as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(async () =>
          (await caches.match(request)) ||
          (await caches.match('./read/')) ||
          (await caches.match('./')) ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        )
    );
  }
});
