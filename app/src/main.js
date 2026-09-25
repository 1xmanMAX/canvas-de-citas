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
    const esperar = w => w.addEventListener('statechange', () => w.state === 'installed' && (S.actualizacion = w))
    if (reg.waiting && navigator.serviceWorker.controller) S.actualizacion = reg.waiting
    reg.addEventListener('updatefound', () => navigator.serviceWorker.controller && esperar(reg.installing))
    let recargando = false
    navigator.serviceWorker.addEventListener('controllerchange', () => recargando || ((recargando = true), location.reload()))
  })
}
