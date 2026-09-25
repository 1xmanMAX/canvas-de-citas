const VERSION = 'cc-4096f53b4f'
const ASSETS = ["./","manifest.webmanifest","icon.svg","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","assets/caveat-latin-500-normal-B9SDL8cy.woff2","assets/caveat-latin-700-normal-D8_1Nw6V.woff2","assets/fraunces-latin-600-normal-BFCDtZfi.woff2","assets/index-BldjmIm6.js","assets/style-B1MWaixn.css","assets/work-sans-latin-400-normal-jUejSri3.woff2","assets/work-sans-latin-500-normal-BKGnScDy.woff2","assets/work-sans-latin-600-normal-DB-2V89X.woff2"]

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
