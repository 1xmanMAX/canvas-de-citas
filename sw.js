const VERSION = 'cc-fa7d042012'
const ASSETS = ["./","manifest.webmanifest","icon.svg","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","assets/caveat-latin-500-normal-B9SDL8cy.woff2","assets/caveat-latin-700-normal-D8_1Nw6V.woff2","assets/fraunces-latin-600-normal-BFCDtZfi.woff2","assets/index-B6KE4uwN.js","assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2","assets/jetbrains-mono-latin-700-normal-BYuf6tUa.woff2","assets/kalam-latin-400-normal-BthBl_aR.woff2","assets/kalam-latin-700-normal-D2H-9ISU.woff2","assets/lora-latin-400-normal-DnxXpLNu.woff2","assets/lora-latin-600-normal-B-3RcLOQ.woff2","assets/montserrat-latin-400-normal-BLhwKU8k.woff2","assets/montserrat-latin-600-normal-UVxSCcoG.woff2","assets/nunito-latin-400-normal-r8SDr6Up.woff2","assets/nunito-latin-700-normal-Dort48En.woff2","assets/patrick-hand-latin-400-normal-B7HHA2Vw.woff2","assets/permanent-marker-latin-400-normal-BF23djCy.woff2","assets/playfair-display-latin-400-normal-CFtfchNt.woff2","assets/playfair-display-latin-700-normal-CuDiGg7c.woff2","assets/special-elite-latin-400-normal-YjDd9tmf.woff2","assets/style-CFKA8Ug1.css","assets/work-sans-latin-400-normal-jUejSri3.woff2","assets/work-sans-latin-500-normal-BKGnScDy.woff2","assets/work-sans-latin-600-normal-DB-2V89X.woff2"]

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
