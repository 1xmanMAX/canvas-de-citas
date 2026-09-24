const VERSION = '__VERSION__'
const ASSETS = __ASSETS__

// Sin skipWaiting: la versión nueva se activa cuando se cierran las pestañas de la anterior.
// Así nunca se borra la caché de una página que todavía la está usando.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)))
})

// La app puede pedir activar la versión nueva de inmediato (y luego recarga).
self.addEventListener('message', e => {
  if (e.data === 'activar') self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
  )
})

// Cache-first: la app funciona sin conexión y abre al instante.
self.addEventListener('fetch', e => {
  const r = e.request
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return
  if (r.mode === 'navigate') {
    e.respondWith(caches.match('./').then(res => res || fetch(r)))
    return
  }
  // Lo que no se precargó (p. ej. pdf.js) se guarda la primera vez para usarlo sin conexión.
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(res => res || fetch(r).then(resp => {
    if (resp.ok && new URL(r.url).pathname.includes('/assets/')) {
      const copia = resp.clone()
      caches.open(VERSION).then(c => c.put(r, copia))
    }
    return resp
  })))
})
