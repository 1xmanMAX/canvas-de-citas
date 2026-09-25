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

export async function crearConexion({ url, clave, fetchFn = fetch }) {
  const k = await importarClave(clave)
  async function pedir(metodo, ruta, cuerpo, binario = false) {
    let r
    try {
      r = await fetchFn(url + ruta, {
        method: metodo,
        headers: { 'x-canvas-prueba': await cifrarJson(k, { ruta }), 'content-type': binario ? 'application/octet-stream' : 'text/plain' },
        body: cuerpo
      })
    } catch {
      throw new Error('No se pudo conectar con la PC: ¿están en el mismo Wi-Fi y el receptor está abierto?')
    }
    if (!r.ok) throw errorHttp(r)
    return r
  }
  const doc = ruta => `/sync/doc?ruta=${encodeURIComponent(ruta)}`
  return {
    estado: async () => descifrarJson(k, await (await pedir('GET', '/sync/estado')).text()),
    guardar: async datos => descifrarJson(k, await (await pedir('PUT', '/sync/estado', await cifrarJson(k, datos))).text()),
    bajarDoc: async ruta => descifrarBytes(k, new Uint8Array(await (await pedir('GET', doc(ruta))).arrayBuffer())),
    subirDoc: async (ruta, bytes) => { await pedir('PUT', doc(ruta), await cifrarBytes(k, bytes), true) }
  }
}
