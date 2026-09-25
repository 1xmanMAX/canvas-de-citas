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
  const e = new Error(r.status === 401 ? 'La PC no reconoce este aparato: vuelve a vincularlo' : r.status === 409 ? 'La PC cambió durante la sincronización' : r.status === 422 ? 'La PC no pudo aplicar los cambios' : `La PC respondió ${r.status}`)
  e.codigo = r.status
  return e
}

/** Tiempos máximos por petición (ms): los documentos pueden ser PDF grandes por Wi-Fi. */
export const TIEMPOS = { hola: 1500, datos: 60_000, doc: 10 * 60_000 }

/** `tiempos` permite acortarlos (búsqueda de la PC en la red, pruebas). */
export async function crearConexion({ url, clave, fetchFn = fetch, tiempos = TIEMPOS }) {
  const k = await importarClave(clave)
  const espacio = /^http:\/\/(127\.|localhost|\[::1\])/.test(url) ? 'loopback' : 'local'
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
          signal: corte.signal,
          // La app publicada (https) pidiendo a la PC (http en la red local): Chrome/Comet lo
          // permiten con "acceso a la red local" (pide permiso una vez). Otros navegadores lo ignoran.
          targetAddressSpace: espacio
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
    // v2 (grupo de sincronización): solo lo que cambió. Un servidor antiguo responde 404.
    leer2: async pedido => descifrarJson(k, await (await pedir('POST', '/sync/v2/leer', await cifrarJson(k, pedido))).text()),
    escribir2: async datos => descifrarJson(k, await (await pedir('POST', '/sync/v2/escribir', await cifrarJson(k, datos))).text()),
    estado: async () => descifrarJson(k, await (await pedir('GET', '/sync/estado')).text()),
    guardar: async datos => descifrarJson(k, await (await pedir('PUT', '/sync/estado', await cifrarJson(k, datos))).text()),
    bajarDoc: async ruta => descifrarBytes(k, new Uint8Array(await (await pedir('GET', doc(ruta), undefined, false, tiempos.doc)).arrayBuffer())),
    subirDoc: async (ruta, bytes) => { await pedir('PUT', doc(ruta), await cifrarBytes(k, bytes), true, tiempos.doc) }
  }
}
