// Visor de documentos dentro de la app (panel lateral): PDF, HTML, Markdown y texto.
// Se abre con el documento de una fuente o con cualquier archivo del equipo.
import { S, leerDocumento, avisar, adjuntarDocumento, guardarProyecto } from './store.svelte.js'
import { nuevaTarjeta, guardarTarjeta } from './tablero.js'
import { asegurarTablero, idLocal, cajas } from './tarjetas.js'
import { asegurarLectura } from './lecturas.js'
import { autorCorto, anio } from './citas.js'
import { enVentanaDoc, pedirAPrincipal } from './ventana-doc.js'

export const ACEPTADOS = /\.(pdf|html?|md|markdown|txt)$/i

class EstadoVisor {
  /** { nombre, tipo, blob, url } del archivo abierto, o null. */
  archivo = $state(null)
  fuenteId = $state(null)
  proyectoId = $state(null)
  grande = $state(false)
  recortando = $state(false) // herramienta de recorte activa en el lector de PDF
  /** Punto del documento al que ir y señalar: { tipo, pagina, rects, cita, area, t }. */
  destino = $state(null)
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

/** Abre un archivo sin fuente (en la ventana de documento, el que se pasó por la base local). */
export function abrirSuelto(nombre, blob, proyectoId = null) {
  abrir(nombre, blob, null, proyectoId)
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
  V.destino = null
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

/** Ruta del lienzo de lectura de la fuente abierta en el visor (o null si no es de un proyecto). */
export const rutaLectura = (pid = V.proyectoId, fid = V.fuenteId) => (pid && fid ? `#/p/${pid}/l/${fid}` : null)

/** Abre el lienzo de lectura de la fuente del visor (a la izquierda del documento). */
export function abrirLecturaDelVisor(pid = V.proyectoId, fid = V.fuenteId) {
  if (enVentanaDoc()) return
  const r = rutaLectura(pid, fid)
  if (!r || location.hash === r) return
  if (location.hash.startsWith(`#/p/${pid}`)) location.replace(r)
  else location.hash = r
}

/**
 * Agrega una tarjeta de cita. Si el documento es de una fuente, va a su lienzo de lectura
 * (p.canvas.lecturas[fuente], lib/lecturas.js), junto a la fuente del centro y conectada a ella con
 * un hilo "cita"; desde allí se puede clavar en el lienzo general. Un archivo suelto va al general.
 */
async function tarjetaCita(lista, datos, aviso) {
  const pedido = { lista, datos, aviso, proyectoId: V.proyectoId, fuenteId: V.fuenteId }
  // En una ventana de documento, la tarjeta la crea la ventana principal (ver lib/ventana-doc.js).
  if (enVentanaDoc() && pedido.proyectoId && await pedirAPrincipal(pedido)) return avisar(`${aviso} (en la ventana principal)`)
  crearTarjetaCita(pedido)
}

/** Crea la tarjeta de una cita en su proyecto; devuelve el proyecto (o null). */
export function crearTarjetaCita({ lista, datos, aviso, proyectoId, fuenteId }) {
  const p = S.proyectoPorId.get(proyectoId)
  if (!p) { avisar('Abre el documento desde un proyecto para citar en el lienzo'); return null }
  const f = fuenteId ? S.fuentePorId.get(fuenteId) : null
  if (f) {
    const c = asegurarLectura(p.canvas, f.id)
    const ocupadas = [{ x: -180, y: -90, w: 360, h: 180 }, ...[...cajas(c).values()].map(({ x, y, w, h }) => ({ x, y, w, h }))]
    const t = nuevaTarjeta(lista, 300, -60, datos, ocupadas)
    guardarTarjeta(c, lista, t, true)
    c.conexiones.push({ id: idLocal('con'), desde: f.id, hasta: t.id, etiqueta: 'cita' })
    guardarProyecto(p)
    abrirLecturaDelVisor(p.id, f.id)
    avisar(`${aviso} de ${autorCorto(f)} (${anio(f)})`)
    return p
  }
  const c = asegurarTablero(p.canvas)
  const ocupadas = [...cajas(c).values()].map(({ x, y, w, h }) => ({ x, y, w, h }))
  guardarTarjeta(c, lista, nuevaTarjeta(lista, 750, -80, datos, ocupadas), true)
  guardarProyecto(p)
  avisar(aviso)
  return p
}

/**
 * Origen de una cita para volver a ella: fuente, tipo de documento y ubicación. En PDF, los
 * rectángulos (en puntos de la página); en HTML/Markdown, el texto citado.
 */
function origen(extra) {
  if (!V.fuenteId) return null // un archivo suelto no se puede volver a abrir más tarde
  return { fuente: V.fuenteId, tipo: V.archivo?.tipo, ...extra }
}

/** Nota con el texto seleccionado (y su página y ubicación, si se conocen). */
export function notaDesdeSeleccion(texto, pagina = null, rects = null) {
  const cita = texto.replace(/\s+/g, ' ').trim().slice(0, 1200)
  const o = origen({ pagina, rects: rects?.slice(0, 80) || null, cita: cita.slice(0, 400) })
  tarjetaCita('notas', { titulo: referencia(pagina), texto: `“${cita}”`, estilo: 'rayada', letra: 'serif', ...(o ? { origen: o } : {}) }, 'Nota creada en el lienzo de lectura')
}

/** Tarjeta de imagen con el área recortada de un PDF (gráfico, tabla, escaneo…). */
export function fotoDesdeRecorte({ imagen, proporcion, texto, pagina, rect }) {
  const o = origen({ pagina, area: true, rects: rect ? [{ n: pagina - 1, ...rect }] : null })
  tarjetaCita('fotos', {
    titulo: referencia(pagina), imagen, proporcion, trazos: [],
    texto: texto ? `“${texto.slice(0, 1500)}”` : '', ...(o ? { origen: o } : {})
  }, 'Recorte citado en el lienzo de lectura')
}

/** Vínculo: abre el documento de la cita y la señala. */
export async function abrirOrigen(o, proyectoId, tarjetaId = null) {
  const f = o?.fuente && S.fuentePorId.get(o.fuente)
  if (!f) return avisar('La fuente de esta cita ya no existe')
  if (V.fuenteId !== f.id || !V.archivo) await abrirDocumentoFuente(f, proyectoId)
  if (V.archivo) V.destino = { ...o, tarjeta: tarjetaId, t: Date.now() }
}

/** Citas (notas y recortes) de un proyecto que vienen de la fuente abierta: se marcan en el documento. */
export function marcasDeFuente(proyectoId, fuenteId) {
  const p = S.proyectoPorId.get(proyectoId)
  if (!p || !fuenteId) return []
  const lienzos = [p.canvas, ...Object.values(p.canvas.objetivos || {}), ...Object.values(p.canvas.lecturas || {})]
  return lienzos.flatMap(c => [...(c.notas || []), ...(c.fotos || [])])
    .filter(t => t.origen?.fuente === fuenteId)
    .map(t => ({ id: t.id, titulo: t.titulo, ...t.origen }))
}
