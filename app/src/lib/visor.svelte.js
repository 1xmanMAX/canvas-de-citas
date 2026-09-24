// Visor de documentos dentro de la app (panel lateral): PDF, HTML, Markdown y texto.
// Se abre con el documento de una fuente o con cualquier archivo del equipo.
import { S, leerDocumento, avisar, adjuntarDocumento, guardarProyecto } from './store.svelte.js'
import { nuevaTarjeta, guardarTarjeta } from './tablero.js'
import { asegurarTablero, idLocal, cajas } from './tarjetas.js'
import { autorCorto, anio } from './citas.js'

export const ACEPTADOS = /\.(pdf|html?|md|markdown|txt)$/i

class EstadoVisor {
  /** { nombre, tipo, blob, url } del archivo abierto, o null. */
  archivo = $state(null)
  fuenteId = $state(null)
  proyectoId = $state(null)
  grande = $state(false)
  recortando = $state(false) // herramienta de recorte activa en el lector de PDF
}
export const V = new EstadoVisor()

export function tipoDe(nombre, mime = '') {
  const n = String(nombre).toLowerCase()
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (mime === 'text/html' || /\.html?$/.test(n)) return 'html'
  if (/\.(md|markdown)$/.test(n)) return 'md'
  return 'texto'
}

function abrir(nombre, blob, fuenteId = null, proyectoId = null) {
  cerrarVisor()
  const tipo = tipoDe(nombre, blob.type)
  // El tipo explícito hace que el visor de PDF del navegador lo reconozca.
  const b = tipo === 'pdf' && blob.type !== 'application/pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob
  V.archivo = { nombre, tipo, blob: b, url: URL.createObjectURL(b) }
  V.fuenteId = fuenteId
  V.proyectoId = proyectoId
}

/** Abre el documento adjunto de una fuente. */
export async function abrirDocumentoFuente(fuente, proyectoId = null) {
  const d = await leerDocumento(fuente.id)
  if (!d?.blob) return avisar('El documento no está en este dispositivo (conecta la carpeta en Configuración)')
  abrir(fuente.documento_nombre || d.nombre || 'documento', d.blob, fuente.id, proyectoId)
}

/** Abre un archivo del equipo (elegido o soltado). */
export function abrirArchivo(archivo, proyectoId = null) {
  if (!ACEPTADOS.test(archivo.name)) return avisar('El visor abre PDF, HTML, Markdown o TXT')
  abrir(archivo.name, archivo, null, proyectoId)
}

export function cerrarVisor() {
  if (V.archivo?.url) URL.revokeObjectURL(V.archivo.url)
  V.archivo = null
  V.fuenteId = null
  V.recortando = false
}

/** Adjunta el archivo abierto a una fuente (queda en su ficha y en la carpeta). */
export async function adjuntarAbierto(fid) {
  const f = S.fuentePorId.get(fid)
  if (!f || !V.archivo) return
  const archivo = new File([V.archivo.blob], V.archivo.nombre, { type: V.archivo.blob.type })
  await adjuntarDocumento(f, archivo)
  V.fuenteId = fid
  avisar(`Adjuntado a ${autorCorto(f)} (${anio(f)})`)
}

/** "Autor (año), pág. N" (o el nombre del archivo si no está adjunto a una fuente). */
function referencia(pagina) {
  const f = V.fuenteId ? S.fuentePorId.get(V.fuenteId) : null
  const base = f ? `${autorCorto(f)} (${anio(f)})` : V.archivo?.nombre || ''
  return pagina ? `${base}, pág. ${pagina}` : base
}

/**
 * Agrega una tarjeta de cita al lienzo del proyecto, junto a la fuente (en un hueco libre) y
 * conectada a ella con un hilo "cita".
 */
function tarjetaCita(lista, datos, aviso) {
  const p = S.proyectoPorId.get(V.proyectoId)
  if (!p) return avisar('Abre el documento desde un proyecto para citar en el lienzo')
  const c = asegurarTablero(p.canvas)
  const f = V.fuenteId ? S.fuentePorId.get(V.fuenteId) : null
  const pos = (f && c.posiciones?.[f.id]) || { x: 420, y: -120 }
  const ocupadas = [...cajas(c).values()].map(({ x, y, w, h }) => ({ x, y, w, h }))
  if (f) ocupadas.push({ x: pos.x, y: pos.y, w: 150, h: 80 })
  const t = nuevaTarjeta(lista, pos.x + 330, pos.y + 40, datos, ocupadas)
  guardarTarjeta(c, lista, t, true)
  if (f) c.conexiones.push({ id: idLocal('con'), desde: f.id, hasta: t.id, etiqueta: 'cita' })
  guardarProyecto(p)
  avisar(aviso)
}

/** Nota con el texto seleccionado (y su página, si se conoce). */
export function notaDesdeSeleccion(texto, pagina = null) {
  const cita = texto.replace(/\s+/g, ' ').trim().slice(0, 1200)
  tarjetaCita('notas', { titulo: referencia(pagina), texto: `“${cita}”`, estilo: 'rayada', letra: 'serif' }, 'Nota creada en el lienzo')
}

/** Tarjeta de imagen con el área recortada de un PDF (gráfico, tabla, escaneo…). */
export function fotoDesdeRecorte({ imagen, proporcion, texto, pagina }) {
  tarjetaCita('fotos', {
    titulo: referencia(pagina), imagen, proporcion, trazos: [],
    texto: texto ? `“${texto.slice(0, 1500)}”` : ''
  }, 'Recorte citado en el lienzo')
}
