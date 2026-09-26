// app/src/lib/sincro-almacen.js
// El almacén de la app (IndexedDB) visto por el orquestador de sincronización.
import { S, importar, leerMeta, ponerMeta, leerDocumento, guardarDocumentoImportado, idsConDocumento, todasLasFotos } from './store.svelte.js'

const copia = x => JSON.parse(JSON.stringify(x))
const MIME = { pdf: 'application/pdf', html: 'text/html', htm: 'text/html', md: 'text/markdown', txt: 'text/plain' }
const fuenteDe = ruta => S.fuentes.find(f => f.documento_original === ruta)
/** Originales de fotos: fotos/<id>.<ext>, guardados en este navegador con la clave <id>. */
const idFoto = ruta => (ruta.startsWith('fotos/') ? ruta.slice(6).replace(/\.[^.]+$/, '') : null)
const MIME_FOTO = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

export const almacenApp = {
  leerLocal: () => ({ proyectos: copia(S.proyectos), fuentes: copia(S.fuentes), citas: copia(S.citas) }),
  escribirLocal: datos => importar(datos, 'reemplazar'),
  leerBase: () => leerMeta('baseSincro'),
  guardarBase: datos => ponerMeta('baseSincro', datos),
  async docsLocales() {
    const ids = new Set(await idsConDocumento())
    const fotos = todasLasFotos().filter(f => f.original && ids.has(idFoto(f.original))).map(f => ({ ruta: f.original }))
    return [...S.fuentes.filter(f => f.documento_original && ids.has(f.id)).map(f => ({ ruta: f.documento_original })), ...new Map(fotos.map(x => [x.ruta, x])).values()]
  },
  async tieneDoc(ruta) {
    if (idFoto(ruta)) return !!(await leerDocumento(idFoto(ruta)))?.blob
    const f = fuenteDe(ruta)
    return !!(f && (await leerDocumento(f.id))?.blob)
  },
  async leerDoc(ruta) {
    const d = await leerDocumento(idFoto(ruta) || fuenteDe(ruta).id)
    return new Uint8Array(await d.blob.arrayBuffer())
  },
  async guardarDoc(ruta, bytes) {
    if (idFoto(ruta)) {
      const ext = ruta.split('.').pop().toLowerCase()
      return guardarDocumentoImportado(idFoto(ruta), ruta.slice(6), new Blob([bytes], { type: MIME_FOTO[ext] || 'application/octet-stream' }))
    }
    const f = fuenteDe(ruta)
    if (!f) return
    const ext = ruta.split('.').pop().toLowerCase()
    await guardarDocumentoImportado(f.id, f.documento_nombre || ruta.split('/').pop(), new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' }))
  }
}
