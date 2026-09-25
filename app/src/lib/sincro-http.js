// app/src/lib/sincro-http.js
// Conexión cifrada con el servidor de sincronización de la PC (receptor/sincro).
import { importarClave, cifrarJson, descifrarJson, cifrarBytes, descifrarBytes } from './cifrado.js'

/** "canvas-sync://192.168.1.5:47481/#<clave>" → { url, clave } */
export function leerCodigo(codigo) {
  const m = /^canvas-sync:\/\/([^/#\s]+)\/?#(\S+)$/.exec(String(codigo || '').trim())
  if (!m) throw new Error('Código de vinculación no válido')
  return { url: `http://${m[1]}`, clave: decodeURIComponent(m[2]) }
}

function errorHttp(r) {
  const e = new Error(r.status === 401 ? 'La PC no reconoce este celular: vuelve a vincularlo' : r.status === 409 ? 'La PC cambió durante la sincronización' : `La PC respondió ${r.status}`)
  e.codigo = r.status
  return e
}

/** Tiempos máximos por petición (ms): los documentos pueden ser PDF grandes por Wi-Fi. */
export const TIEMPOS = { hola: 1500, datos: 60_000, doc: 10 * 60_000 }

/** `tiempos` permite acortarlos (búsqueda de la PC en la red, pruebas). */
export async function crearConexion({ url, clave, fetchFn = fetch, tiempos = TIEMPOS }) {
  const k = await importarClave(clave)
  async function pedir(metodo, ruta, cuerpo, binario = false, tiempo = tiempos.datos) {
    const corte = new AbortController()
    const reloj = setTimeout(() => corte.abort(), tiempo)
    try {
      let r
      try {
        r = await fetchFn(url + ruta, {
          method: metodo,
          headers: { 'x-canvas-prueba': await cifrarJson(k, { ruta }), 'content-type': binario ? 'application/octet-stream' : 'text/plain' },
          body: cuerpo,
          signal: corte.signal
        })
      } catch {
        const e = new Error('No se pudo conectar con la PC: ¿están en el mismo Wi-Fi y el receptor está abierto?')
        e.red = true
        throw e
      }
      if (!r.ok) throw errorHttp(r)
      return r
    } finally {
      clearTimeout(reloj)
    }
  }
  const doc = ruta => `/sync/doc?ruta=${encodeURIComponent(ruta)}`
  return {
    hola: async () => descifrarJson(k, await (await pedir('GET', '/sync/hola', undefined, false, tiempos.hola)).text()),
    estado: async () => descifrarJson(k, await (await pedir('GET', '/sync/estado')).text()),
    guardar: async datos => descifrarJson(k, await (await pedir('PUT', '/sync/estado', await cifrarJson(k, datos))).text()),
    bajarDoc: async ruta => descifrarBytes(k, new Uint8Array(await (await pedir('GET', doc(ruta), undefined, false, tiempos.doc)).arrayBuffer())),
    subirDoc: async (ruta, bytes) => { await pedir('PUT', doc(ruta), await cifrarBytes(k, bytes), true, tiempos.doc) }
  }
}
