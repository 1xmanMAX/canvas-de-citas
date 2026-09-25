// Encontrar la PC si cambió su IP (el router le dio otra): se prueba cada dirección de la misma
// red /24 con /sync/hola. Solo responde bien quien tiene la clave de vinculación.
import { leerCodigo, crearConexion } from './sincro-http.js'

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** "canvas-sync://192.168.1.5:47481/#k" → { ip: '192.168.1.5', puerto: '47481' } */
export function ipDe(codigo) {
  const { url } = leerCodigo(codigo)
  const [ip, puerto = '47481'] = url.replace(/^http:\/\//, '').split(':')
  return { ip, puerto }
}

/** El mismo código con otra IP. */
export function codigoCon(codigo, ip) {
  const { puerto } = ipDe(codigo)
  const { clave } = leerCodigo(codigo)
  return `canvas-sync://${ip}:${puerto}/#${clave}`
}

/** Direcciones a probar: la anterior primero, luego el resto de su /24. */
export function candidatas(ip) {
  const m = IPV4.exec(ip)
  if (!m) return []
  const red = `${m[1]}.${m[2]}.${m[3]}.`
  const todas = Array.from({ length: 254 }, (_, i) => red + (i + 1))
  return [ip, ...todas.filter(x => x !== ip)]
}

/** Devuelve el código con la IP nueva de la PC, o null si no está en esta red. */
export async function buscarPc({ codigo, fetchFn = fetch, tiempo = 1500, paralelo = 32, alProgreso = () => {} }) {
  const { ip, puerto } = ipDe(codigo)
  const { clave } = leerCodigo(codigo)
  const cola = candidatas(ip)
  let hallada = null, probadas = 0
  async function trabajador() {
    while (!hallada && cola.length) {
      const candidata = cola.shift()
      try {
        const c = await crearConexion({ url: `http://${candidata}:${puerto}`, clave, fetchFn, tiempos: { hola: tiempo } })
        const r = await c.hola()
        if (r?.app === 'canvas-sincro') hallada ||= candidata
      } catch {}
      if (++probadas % 32 === 0) alProgreso(`Buscando la PC en la red… (${probadas}/254)`)
    }
  }
  await Promise.all(Array.from({ length: paralelo }, trabajador))
  return hallada ? codigoCon(codigo, hallada) : null
}
