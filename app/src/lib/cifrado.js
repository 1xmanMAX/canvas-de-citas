// app/src/lib/cifrado.js
// Cifrado de la sincronización: AES-256-GCM (WebCrypto). Sobre = IV (12 bytes) + texto cifrado
// con etiqueta. El contenido lleva delante la hora (8 bytes, ms, big-endian): se rechaza lo que
// tenga más de EDAD_MAX de diferencia (contra repeticiones). Mismo formato que receptor/sincro.
const AAD = new TextEncoder().encode('canvas-sincro-v1')
export const EDAD_MAX = 5 * 60 * 1000

export const b64 = {
  a(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) },
  de(s) { return Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0)) }
}

export const claveNueva = () => b64.a(crypto.getRandomValues(new Uint8Array(32)))

export async function importarClave(claveB64) {
  const raw = b64.de(claveB64)
  if (raw.length !== 32) throw new Error('La clave debe tener 32 bytes')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function cifrarBytes(clave, bytes, iv = crypto.getRandomValues(new Uint8Array(12)), ahora = Date.now()) {
  const plano = new Uint8Array(8 + bytes.length)
  new DataView(plano.buffer).setBigUint64(0, BigInt(ahora))
  plano.set(bytes, 8)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, clave, plano))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return out
}

export async function descifrarBytes(clave, sobre, ahora = Date.now()) {
  if (sobre.length < 12 + 8 + 16) throw new Error('Clave incorrecta o mensaje alterado')
  let plano
  try {
    plano = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sobre.subarray(0, 12), additionalData: AAD }, clave, sobre.subarray(12)))
  } catch { throw new Error('Clave incorrecta o mensaje alterado') }
  const t = Number(new DataView(plano.buffer, plano.byteOffset).getBigUint64(0))
  if (Math.abs(ahora - t) > EDAD_MAX) throw new Error('Mensaje vencido (revisa la hora del celular y de la PC)')
  return plano.subarray(8)
}

export const cifrarJson = async (clave, obj, iv, ahora) => b64.a(await cifrarBytes(clave, new TextEncoder().encode(JSON.stringify(obj)), iv, ahora))
export const descifrarJson = async (clave, texto, ahora) => JSON.parse(new TextDecoder().decode(await descifrarBytes(clave, b64.de(texto), ahora)))
