// Lectura y escritura de la carpeta de datos de Canvas de Citas, con el mismo formato que la app
// (app/src/lib/io.svelte.js): { "<coleccion>": [...] } ordenado por id, campos del contrato primero.
import fs from 'node:fs'
import path from 'node:path'

export const CARPETA = process.env.CANVAS_CARPETA || 'F:\\TESIS TAKE LOOK'
export const COLECCIONES = ['proyectos', 'fuentes', 'citas']
const PREFIJO = { proyectos: 'proyecto', fuentes: 'fuente', citas: 'cita' }

const CAMPOS = {
  proyectos: ['id', 'tipo', 'titulo', 'area', 'objetivo_general', 'objetivos_especificos', 'indicadores'],
  fuentes: ['id', 'tipo_fuente', 'autores', 'anio', 'titulo', 'revista_o_editorial', 'doi_o_url', 'idioma', 'entrada_bibliografia', 'estado_verificacion', 'fuente_verificacion', 'notas_correccion', 'documento_original'],
  citas: ['id', 'proyecto_id', 'fuente_id', 'estado_uso', 'cita_textual_o_parafraseo', 'pagina', 'cita_en_texto', 'contexto']
}
const LISTAS_CAMPO = new Set(['objetivos_especificos', 'indicadores', 'autores'])
const porId = (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true })

function ordenar(obj, campos) {
  const o = {}
  for (const k of campos) o[k] = obj[k] ?? (LISTAS_CAMPO.has(k) ? [] : k === 'contexto' || k === 'cita_en_texto' ? '' : null)
  for (const k of Object.keys(obj)) if (!(k in o) && obj[k] !== undefined) o[k] = obj[k]
  return o
}

export const ruta = (...p) => path.join(CARPETA, ...p)

export function comprobarCarpeta() {
  if (!fs.existsSync(CARPETA)) throw new Error(`No existe la carpeta de datos ${CARPETA}. En la app: Configuración → carpeta de almacenamiento.`)
}

function leerJson(nombre, porDefecto) {
  const f = ruta(nombre)
  if (!fs.existsSync(f)) return porDefecto
  const txt = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')
  return txt.trim() ? JSON.parse(txt) : porDefecto
}

/** Escritura atómica: la app nunca ve un JSON a medio escribir. */
function escribirAtomico(nombre, texto) {
  const f = ruta(nombre), tmp = f + '.tmp-claude'
  fs.writeFileSync(tmp, texto, 'utf8')
  fs.renameSync(tmp, f)
}

/** Carga las tres colecciones: { proyectos: [], fuentes: [], citas: [] }. */
export function cargar() {
  comprobarCarpeta()
  const d = {}
  for (const col of COLECCIONES) {
    const j = leerJson(`${col}.json`, { [col]: [] })
    d[col] = Array.isArray(j) ? j : j[col] || []
  }
  for (const p of d.proyectos) asegurarProyecto(p)
  return d
}

/** Guarda solo las colecciones indicadas (por defecto, todas). */
export function guardar(d, cols = COLECCIONES) {
  for (const col of cols) {
    const items = [...d[col]].sort(porId).map(x => ordenar(x, CAMPOS[col]))
    escribirAtomico(`${col}.json`, JSON.stringify({ [col]: items }, null, 2) + '\n')
  }
}

export function asegurarProyecto(p) {
  p.tipo ||= 'tesis'
  p.objetivos_especificos ||= []
  p.indicadores ||= []
  const c = (p.canvas ||= {})
  c.modo ||= 'radial'
  c.posiciones ||= {}
  for (const l of ['notas', 'fotos', 'listas', 'audios', 'conexiones']) c[l] ||= []
  c.objetivos ||= {}
  return p
}

// --- Eliminados (la app los borra por id al leer eliminados.json) ---
export function leerEliminados() {
  return leerJson('eliminados.json', {})
}
export function marcarEliminados(ids) {
  const e = leerEliminados()
  for (const [col, lista] of Object.entries(ids)) if (lista.length) e[col] = [...new Set([...(e[col] || []), ...lista])]
  escribirAtomico('eliminados.json', JSON.stringify(e, null, 2) + '\n')
}

// --- Ids ---
export function nuevoId(d, col) {
  const re = new RegExp(`^${PREFIJO[col]}_(\\d+)$`)
  let tope = 0
  for (const x of [...d[col], ...(leerEliminados()[col] || []).map(id => ({ id }))]) {
    const m = re.exec(x.id || '')
    if (m) tope = Math.max(tope, +m[1])
  }
  return `${PREFIJO[col]}_${String(tope + 1).padStart(3, '0')}`
}
export const idLocal = prefijo => `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
export const ahoraISO = () => new Date().toISOString()

// --- Búsqueda de cualquier elemento por id ---
export const LISTAS_TARJETA = ['notas', 'listas', 'audios', 'fotos']

/** Lienzo donde vive una tarjeta/conexión: p.canvas o p.canvas.objetivos[clave]. */
export function lienzos(p) {
  const l = [{ clave: null, c: p.canvas }]
  for (const [clave, o] of Object.entries(p.canvas.objetivos || {})) l.push({ clave, c: o })
  return l
}

/**
 * Localiza un id en todo el modelo. Devuelve { tipo, obj, col?, proyecto?, lienzo?, lista? }.
 * tipo: 'proyecto' | 'fuente' | 'cita' | 'tarjeta' | 'conexion'
 */
export function localizar(d, id) {
  for (const col of COLECCIONES) {
    const obj = d[col].find(x => x.id === id)
    if (obj) return { tipo: PREFIJO[col], col, obj }
  }
  for (const p of d.proyectos) for (const { clave, c } of lienzos(p)) {
    for (const lista of LISTAS_TARJETA) {
      const obj = (c[lista] || []).find(x => x.id === id)
      if (obj) return { tipo: 'tarjeta', lista, obj, proyecto: p, lienzo: c, clave }
    }
    const con = (c.conexiones || []).find(x => x.id === id)
    if (con) return { tipo: 'conexion', obj: con, proyecto: p, lienzo: c, clave }
  }
  return null
}

export function proyecto(d, id) {
  if (!id) {
    if (d.proyectos.length === 1) return d.proyectos[0]
    throw new Error(`Indica el proyecto con --proyecto (${d.proyectos.map(p => p.id).join(', ')})`)
  }
  const p = d.proyectos.find(x => x.id === id)
  if (!p) throw new Error(`No existe el proyecto ${id}`)
  return p
}

/** Claves de objetivos válidas: og (si hay objetivo general), oe1, oe2… */
export function clavesObjetivo(p) {
  const l = []
  if (p.objetivo_general?.trim()) l.push('og')
  p.objetivos_especificos.forEach((_, i) => l.push(`oe${i + 1}`))
  return l
}

export function subLienzo(p, clave) {
  if (!clave) return p.canvas
  if (!clavesObjetivo(p).includes(clave)) throw new Error(`Objetivo "${clave}" no existe. Válidos: ${clavesObjetivo(p).join(', ') || '(ninguno)'}`)
  const o = (p.canvas.objetivos[clave] ||= {})
  for (const l of ['indicadores', 'fuentes', 'notas', 'listas', 'audios', 'fotos', 'conexiones']) o[l] ||= []
  return o
}
