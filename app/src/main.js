import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { S } from './lib/store.svelte.js'
import { esAndroid } from './lib/plataforma.js'
import { bloquearZoomDelNavegador } from './lib/gestos.js'

mount(App, { target: document.getElementById('app') })

// Pellizco del trackpad: zoom solo del lienzo, PDF o foto bajo el cursor, nunca de la página entera.
bloquearZoomDelNavegador(window, { teclas: !!window.canvasWindows })

// En Android los archivos ya vienen dentro del APK: sin service worker.
if ('serviceWorker' in navigator && import.meta.env.PROD && !esAndroid) {
  addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('./sw.js')
    // App de Windows: al abrir, si ya hay una versión nueva lista, se pasa a ella sin preguntar (siempre la última).
    const lista = w => (window.canvasWindows ? w.postMessage('activar') : (S.actualizacion = w))
    // A mitad de sesión solo se avisa (activar recargaría y podría perder lo que se está escribiendo).
    // App de Windows: la versión que llega en los primeros segundos también se activa sola (antes
    // hacía falta abrir la app dos veces tras publicar).
    const inicio = performance.now()
    const esperar = w => w.addEventListener('statechange', () => {
      if (w.state !== 'installed') return
      if (window.canvasWindows && performance.now() - inicio < 30000) w.postMessage('activar')
      else S.actualizacion = w
    })
    if (reg.waiting && navigator.serviceWorker.controller) lista(reg.waiting)
    reg.addEventListener('updatefound', () => navigator.serviceWorker.controller && esperar(reg.installing))
    let recargando = false
    navigator.serviceWorker.addEventListener('controllerchange', () => recargando || ((recargando = true), location.reload()))
  })

  // Tras publicar, una versión vieja abierta ya no encuentra sus partes cargadas bajo demanda (p. ej. el
  // visor PDF): se busca la versión nueva y se pasa a ella. Una sola vez por minuto, para no recargar en bucle.
  addEventListener('vite:preloadError', async e => {
    let ultimo = 0
    try { ultimo = +sessionStorage.getItem('recarga-version') || 0 } catch {}
    if (Date.now() - ultimo < 60000) return
    e.preventDefault()
    try { sessionStorage.setItem('recarga-version', Date.now()) } catch {}
    const reg = await navigator.serviceWorker.getRegistration()
    await reg?.update().catch(() => {})
    const w = reg?.waiting || reg?.installing
    if (!w) return location.reload()
    const activar = () => w.postMessage('activar')
    if (w.state === 'installed') activar()
    else w.addEventListener('statechange', () => w.state === 'installed' && activar())
  })
}
