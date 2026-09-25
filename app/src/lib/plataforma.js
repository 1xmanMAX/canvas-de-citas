// ¿Corre dentro de la app Android (Capacitor)? La app no importa @capacitor/core: el puente
// nativo inyecta `window.Capacitor` en el WebView antes de cargar la página.
const cap = typeof window !== 'undefined' ? window.Capacitor : undefined

export const esAndroid = !!(cap?.isNativePlatform?.() && cap.getPlatform?.() === 'android')

/** Llama a un plugin nativo (p. ej. nativo('Vinculo', 'escanear')). */
export function nativo(plugin, metodo, opciones = {}) {
  if (!esAndroid || !cap.nativePromise) return Promise.reject(new Error('Solo disponible en la app Android'))
  return cap.nativePromise(plugin, metodo, opciones)
}
