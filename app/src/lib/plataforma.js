// ¿Corre dentro de la app Android (Capacitor)? La app no importa @capacitor/core: el puente
// nativo inyecta `window.Capacitor` en el WebView antes de cargar la página.
const cap = typeof window !== 'undefined' ? window.Capacitor : undefined

export const esAndroid = !!(cap?.isNativePlatform?.() && cap.getPlatform?.() === 'android')

/** Llama a un plugin nativo (p. ej. nativo('Vinculo', 'escanear')). */
export function nativo(plugin, metodo, opciones = {}) {
  if (!esAndroid || !cap.nativePromise) return Promise.reject(new Error('Solo disponible en la app Android'))
  return cap.nativePromise(plugin, metodo, opciones)
}

// ¿Corre dentro de la app de Windows (Canvas de Citas.exe)? El exe inyecta `window.canvasWindows`
// = { puerto, token } antes de cargar la página: las carpetas se leen y escriben por su puente local.
export const W = typeof window !== 'undefined' ? window.canvasWindows : undefined
export const esWindows = !!W?.token

/** Llama al puente local de la app de Windows (`/local/<ruta>`). */
export function puente(ruta, { metodo = 'GET', cuerpo, params = {} } = {}) {
  const q = new URLSearchParams(params).toString()
  return fetch(`http://127.0.0.1:${W.puerto}/local/${ruta}${q ? '?' + q : ''}`, { method: metodo, body: cuerpo, headers: { 'X-Canvas-Local': W.token } })
}
