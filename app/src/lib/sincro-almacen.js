// app/src/lib/sincro-almacen.js
// El almacén de la app (IndexedDB) visto por el orquestador de sincronización.
import { S, importar, leerMeta, ponerMeta, leerDocumento, guardarDocumentoImportado, idsConDocumento } from './store.svelte.js'

const copia = x => JSON.parse(JSON.stringify(x))
const MIME = { pdf: 'application/pdf', html: 'text/html', htm: 'text/html', md: 'text/markdown', txt: 'text/plain' }
const fuenteDe = ruta => S.fuentes.find(f => f.documento_original === ruta)

export const almacenApp = {
  leerLocal: () => ({ proyectos: copia(S.proyectos), fuentes: copia(S.fuentes), citas: copia(S.citas) }),
  escribirLocal: datos => importar(datos, 'reemplazar'),
  leerBase: () => leerMeta('baseSincro'),
  guardarBase: datos => ponerMeta('baseSincro', datos),
  async docsLocales() {
    const ids = new Set(await idsConDocumento())
    return S.fuentes.filter(f => f.documento_original && ids.has(f.id)).map(f => ({ ruta: f.documento_original }))
  },
  async tieneDoc(ruta) {
    const f = fuenteDe(ruta)
    return !!(f && (await leerDocumento(f.id))?.blob)
  },
  async leerDoc(ruta) {
    const d = await leerDocumento(fuenteDe(ruta).id)
    return new Uint8Array(await d.blob.arrayBuffer())
  },
  async guardarDoc(ruta, bytes) {
    const f = fuenteDe(ruta)
    if (!f) return
    const ext = ruta.split('.').pop().toLowerCase()
    await guardarDocumentoImportado(f.id, f.documento_nombre || ruta.split('/').pop(), new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' }))
  }
}
