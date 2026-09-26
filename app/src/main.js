import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { S } from './lib/store.svelte.js'
import { esAndroid } from './lib/plataforma.js'

mount(App, { target: document.getElementById('app') })

// En Android los archivos ya vienen dentro del APK: sin service worker.
if ('serviceWorker' in navigator && import.meta.env.PROD && !esAndroid) {
  addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('./sw.js')
    // App de Windows: al abrir, si ya hay una versión nueva lista, se pasa a ella sin preguntar (siempre la última).
    const lista = w => (window.canvasWindows ? w.postMessage('activar') : (S.actualizacion = w))
    // A mitad de sesión solo se avisa (activar recargaría y podría perder lo que se está escribiendo).
    const esperar = w => w.addEventListener('statechange', () => w.state === 'installed' && (S.actualizacion = w))
    if (reg.waiting && navigator.serviceWorker.controller) lista(reg.waiting)
    reg.addEventListener('updatefound', () => navigator.serviceWorker.controller && esperar(reg.installing))
    let recargando = false
    navigator.serviceWorker.addEventListener('controllerchange', () => recargando || ((recargando = true), location.reload()))
  })
}
