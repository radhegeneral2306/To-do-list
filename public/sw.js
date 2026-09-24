// Service worker: makes the app open instantly (and offline) by keeping its own files on the phone.
// - Built files (/assets/*, with a hash in the name) never change: cache-first.
// - The page itself (index.html): shown from cache at once, refreshed in the background,
//   so a new version is used from the next open.
// - Never touches data calls (Apps Script is another origin, and they are POSTs).
const CACHE = 'taskapp-shell-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon-192.png'])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(pageFromCache(event))
  } else if (url.pathname.includes('/assets/') || /\.(png|webmanifest)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req))
  }
})

// The app is one page (hash routes), so every navigation gets index.html.
async function pageFromCache(event) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match('./')
  const fresh = fetch(event.request).then(async (res) => {
    if (res.ok) {
      await cache.put('./', res.clone())
      await dropOldAssets(cache, await res.clone().text())
    }
    return res
  })
  if (cached) {
    event.waitUntil(fresh.catch(() => {}))
    return cached
  }
  return fresh
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(req)
  if (cached) return cached
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone())
  return res
}

// After a new version: forget JS/CSS the new page no longer uses (fonts are kept, CSS refers to them).
async function dropOldAssets(cache, html) {
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname
    if (/\/assets\/[^/]+\.(js|css)$/.test(path) && !html.includes(path.split('/assets/')[1])) await cache.delete(req)
  }
}
