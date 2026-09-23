// Estado global reactivo + persistencia en IndexedDB (escritura inmediata).
import * as db from './db.js'
import { esMarcador } from './citas.js'
import { limpiarCache } from './texto.js'

export const COLECCIONES = ['proyectos', 'fuentes', 'citas']
const PREFIJO = { proyectos: 'proyecto', fuentes: 'fuente', citas: 'cita' }
const snap = o => $state.snapshot(o)
const ahora = () => new Date().toISOString()

function agrupar(lista, campo) {
  const m = new Map()
  for (const x of lista) {
    const k = x[campo]
    const arr = m.get(k)
    if (arr) arr.push(x)
    else m.set(k, [x])
  }
  return m
}

class Estado {
  proyectos = $state([])
  fuentes = $state([])
  citas = $state([])
  listo = $state(false)
  /** Se incrementa cuando cargan las tipografías: fuerza a remedir el texto del SVG. */
  tipografias = $state(0)
  aviso = $state('')
  /** Service worker con una versión nueva esperando para activarse. */
  actualizacion = $state(null)
  fuentePorId = $derived(new Map(this.fuentes.map(f => [f.id, f])))
  proyectoPorId = $derived(new Map(this.proyectos.map(p => [p.id, p])))
  citaPorId = $derived(new Map(this.citas.map(c => [c.id, c])))
  citasPorProyecto = $derived(agrupar(this.citas, 'proyecto_id'))
  citasPorFuente = $derived(agrupar(this.citas, 'fuente_id'))
}
export const S = new Estado()

// --- Ids correlativos (proyecto_001, fuente_012, cita_034), nunca reutilizados ---
const tope = { proyectos: 0, fuentes: 0, citas: 0 }

export function registrarIds(col, items) {
  const re = new RegExp(`^${PREFIJO[col]}_(\\d+)$`)
  for (const x of items) {
    const m = re.exec(x.id || '')
    if (m) tope[col] = Math.max(tope[col], +m[1])
  }
}

export function nuevoId(col) {
  tope[col]++
  db.poner('meta', { ...tope }, 'tope')
  return `${PREFIJO[col]}_${String(tope[col]).padStart(3, '0')}`
}

export function asegurarProyecto(p) {
  p.tipo ||= 'tesis'
  p.objetivos_especificos ||= []
  p.indicadores ||= []
  const c = (p.canvas ||= {})
  c.modo ||= 'radial'
  c.posiciones ||= {}
  c.notas ||= []
  c.fotos ||= []
  c.conexiones ||= []
  return p
}

export async function cargar() {
  const [p, f, c, t] = await Promise.all([db.todos('proyectos'), db.todos('fuentes'), db.todos('citas'), db.leer('meta', 'tope')])
  if (t) Object.assign(tope, t)
  registrarIds('proyectos', p)
  registrarIds('fuentes', f)
  registrarIds('citas', c)
  S.proyectos = p.map(asegurarProyecto)
  S.fuentes = f
  S.citas = c
  S.listo = true
  document.fonts?.ready.then(() => { limpiarCache(); S.tipografias++ })
  navigator.storage?.persist?.().catch(() => {})
}

// --- Aviso de cambios (lo usa la carpeta de almacenamiento para guardar sola) ---
let oyente = null
export const alCambiar = fn => (oyente = fn)
/** @param {string} [docId] fuente cuyo documento original cambió */
const cambio = docId => oyente?.(docId)

let temporizador
export function avisar(texto) {
  S.aviso = texto
  clearTimeout(temporizador)
  temporizador = setTimeout(() => (S.aviso = ''), 2600)
}

export function copiar(texto) {
  navigator.clipboard?.writeText(texto).then(() => avisar('Copiado'), () => avisar('No se pudo copiar'))
}

function fallo(e) {
  console.error(e)
  avisar('No se pudo guardar: ' + (e?.message || e))
}

// --- Guardado ---
function guardarEn(col, mapa, obj) {
  let item = mapa.get(obj.id)
  if (!item) {
    S[col].push(obj)
    item = S[col].at(-1)
  } else if (item !== obj) Object.assign(item, obj)
  db.poner(col, snap(item)).catch(fallo)
  cambio()
  return item
}

export function guardarProyecto(p) {
  p.id ||= nuevoId('proyectos')
  p.actualizado = ahora()
  return guardarEn('proyectos', S.proyectoPorId, asegurarProyecto(p))
}

function tocarProyecto(pid) {
  const p = S.proyectoPorId.get(pid)
  if (p) guardarProyecto(p)
}

export function guardarFuente(f) {
  f.id ||= nuevoId('fuentes')
  f.documento_original ??= null
  return guardarEn('fuentes', S.fuentePorId, f)
}

export function guardarCita(c) {
  c.id ||= nuevoId('citas')
  const item = guardarEn('citas', S.citaPorId, c)
  tocarProyecto(c.proyecto_id)
  return item
}

/** Vincula una fuente a un proyecto con una cita "sin revisar" si todavía no tiene ninguna. */
export function vincularFuente(pid, fid) {
  const ya = (S.citasPorFuente.get(fid) || []).some(c => c.proyecto_id === pid)
  if (!ya) guardarCita({ proyecto_id: pid, fuente_id: fid, estado_uso: 'no_revisado', cita_textual_o_parafraseo: 'parafraseo', pagina: null, cita_en_texto: '', contexto: '' })
}

/** Agrega una cita; si la fuente solo tenía el marcador "sin revisar", lo reutiliza. */
export function agregarCita(datos) {
  const previas = (S.citasPorFuente.get(datos.fuente_id) || []).filter(c => c.proyecto_id === datos.proyecto_id)
  if (previas.length === 1 && esMarcador(previas[0])) return guardarCita({ ...snap(previas[0]), ...datos, id: previas[0].id })
  return guardarCita(datos)
}

// --- Eliminación (en cascada) ---
function quitar(col, ids) {
  const set = new Set(ids)
  if (!set.size) return
  S[col] = S[col].filter(x => !set.has(x.id))
  db.borrarVarios(col, [...set]).catch(fallo)
  cambio()
}

function limpiarLienzo(p, fid) {
  const c = p.canvas
  if (!c) return false
  const antes = c.conexiones.length
  const tenia = fid in c.posiciones
  delete c.posiciones[fid]
  c.conexiones = c.conexiones.filter(x => x.desde !== fid && x.hasta !== fid)
  return tenia || antes !== c.conexiones.length
}

export function eliminarCita(id) {
  const c = S.citaPorId.get(id)
  quitar('citas', [id])
  if (c) tocarProyecto(c.proyecto_id)
}

export function quitarFuenteDeProyecto(pid, fid) {
  quitar('citas', (S.citasPorFuente.get(fid) || []).filter(c => c.proyecto_id === pid).map(c => c.id))
  const p = S.proyectoPorId.get(pid)
  if (p) { limpiarLienzo(p, fid); guardarProyecto(p) }
}

export function eliminarFuente(fid) {
  quitar('citas', (S.citasPorFuente.get(fid) || []).map(c => c.id))
  for (const p of S.proyectos) if (limpiarLienzo(p, fid)) guardarProyecto(p)
  quitar('fuentes', [fid])
  db.borrar('documentos', fid).catch(() => {})
}

export function eliminarProyecto(pid) {
  quitar('citas', (S.citasPorProyecto.get(pid) || []).map(c => c.id))
  quitar('proyectos', [pid])
}

// --- Documentos originales (PDF/HTML/MD) ---
export const leerDocumento = fid => db.leer('documentos', fid)
export const idsConDocumento = () => db.claves('documentos')

export async function adjuntarDocumento(f, archivo) {
  const ext = (archivo.name.split('.').pop() || 'pdf').toLowerCase()
  await db.poner('documentos', { nombre: archivo.name, tipo: archivo.type, blob: archivo }, f.id)
  f.documento_original = `fuentes/${f.id}/documento.${ext}`
  guardarFuente(f)
  cambio(f.id)
}

export async function quitarDocumento(f) {
  await db.borrar('documentos', f.id)
  f.documento_original = null
  guardarFuente(f)
}

export const guardarDocumentoImportado = (fid, nombre, blob) =>
  db.poner('documentos', { nombre, tipo: blob.type, blob }, fid)

// --- Importación ---
/** Combina (por id) o reemplaza las colecciones recibidas. Solo toca las colecciones presentes. */
export async function importar(datos, modo) {
  for (const col of COLECCIONES) {
    const entrantes = datos[col]
    if (!entrantes) continue
    registrarIds(col, entrantes)
    let resultado
    if (modo === 'reemplazar') resultado = entrantes
    else {
      // Combinar campo a campo: conserva datos propios de la app (p. ej. el lienzo)
      // aunque la skill reescriba la entrada completa sin ellos.
      const previos = new Map(S[col].map(x => [x.id, snap(x)]))
      for (const x of entrantes) previos.set(x.id, { ...previos.get(x.id), ...x })
      resultado = [...previos.values()]
    }
    if (col === 'proyectos') resultado.forEach(asegurarProyecto)
    if (modo === 'reemplazar') await db.vaciar([col])
    await db.ponerVarios(col, resultado)
    S[col] = resultado
  }
  await db.poner('meta', { ...tope }, 'tope')
  cambio()
}

export const leerMeta = clave => db.leer('meta', clave)
export const ponerMeta = (clave, valor) => db.poner('meta', valor, clave)
