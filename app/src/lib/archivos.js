// Archivos que salen de la app o llegan a ella, igual en PC y en Android:
// - En la PC se descargan; en Android (el WebView no descarga) se abre la hoja "Compartir" para
//   guardarlos en Archivos/Drive o enviarlos (plugin nativo Archivos).
// - En Android, lo que otra app comparte con "Canvas de Citas" llega aquí (en la PC, eso lo hace
//   el receptor de archivos).
import { esAndroid, nativo } from './plataforma.js'
import { b64 } from './cifrado.js'

const base64 = async blob => b64.a(new Uint8Array(await blob.arrayBuffer()))

/** Guarda uno o varios archivos `[{ nombre, blob }]`. */
export async function guardarArchivos(archivos) {
  if (esAndroid) {
    const lista = await Promise.all(archivos.map(async a => ({ nombre: a.nombre, tipo: (a.blob.type || 'application/octet-stream').split(';')[0], datos: await base64(a.blob) })))
    return nativo('Archivos', 'compartir', { archivos: lista })
  }
  for (const [i, a] of archivos.entries()) {
    if (i) await new Promise(r => setTimeout(r, 350)) // algunos navegadores bloquean descargas simultáneas
    const url = URL.createObjectURL(a.blob)
    const enlace = Object.assign(document.createElement('a'), { href: url, download: a.nombre })
    document.body.append(enlace)
    enlace.click()
    enlace.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export const guardarArchivo = (nombre, blob) => guardarArchivos([{ nombre, blob }])

/** Android: lo compartido con la app desde otras apps → `[File | { texto }]`. */
export async function recibidosAndroid() {
  if (!esAndroid) return []
  const { archivos = [] } = await nativo('Archivos', 'recibidos')
  return archivos.map(a => {
    if (a.texto) return { texto: a.texto }
    if (a.error) return { error: a.error }
    return new File([b64.de(a.datos)], a.nombre, { type: a.tipo || '' })
  })
}

/** El lienzo abierto (Hub) se registra aquí para recibir imágenes, audios y textos. */
export const lienzoAbierto = { insertar: null }
