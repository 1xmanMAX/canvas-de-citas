// Exportar / importar los tres JSON con el mismo esquema que la skill citas-tesis
// (references/formato-datos.md). La carpeta de almacenamiento vive en carpeta.svelte.js.
import { S, COLECCIONES, importar, registrarIds, nuevoId, avisar } from './store.svelte.js'
import { guardarArchivo, guardarArchivos } from './archivos.js'
import { aBibtex, extraerDoi, normalizar } from './citas.js'

const CAMPOS = {
  proyectos: ['id', 'tipo', 'titulo', 'area', 'objetivo_general', 'objetivos_especificos', 'indicadores'],
  fuentes: ['id', 'tipo_fuente', 'autores', 'anio', 'titulo', 'revista_o_editorial', 'doi_o_url', 'idioma', 'entrada_bibliografia', 'estado_verificacion', 'fuente_verificacion', 'notas_correccion', 'documento_original'],
  citas: ['id', 'proyecto_id', 'fuente_id', 'estado_uso', 'cita_textual_o_parafraseo', 'pagina', 'cita_en_texto', 'contexto']
}
const LISTAS = new Set(['objetivos_especificos', 'indicadores', 'autores'])
const porId = (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true })

/** Campos del contrato primero (en el orden de la skill), luego los extra de la app. */
function ordenar(obj, campos) {
  const o = {}
  for (const k of campos) o[k] = obj[k] ?? (LISTAS.has(k) ? [] : k === 'contexto' || k === 'cita_en_texto' ? '' : null)
  for (const k of Object.keys(obj)) if (!(k in o) && obj[k] !== undefined) o[k] = obj[k]
  return o
}

export function serializar(col) {
  const items = $state.snapshot(S[col]).sort(porId).map(x => ordenar(x, CAMPOS[col]))
  return JSON.stringify({ [col]: items }, null, 2) + '\n'
}

/** Descarga (PC) o comparte (Android) un archivo de texto. */
export function descargar(nombre, texto, tipo = 'application/json') {
  return guardarArchivo(nombre, new Blob([texto], { type: tipo + ';charset=utf-8' })).catch(e => avisar(e.message || String(e)))
}

export function descargarTodo() {
  const archivos = COLECCIONES.map(col => ({ nombre: `${col}.json`, blob: new Blob([serializar(col)], { type: 'application/json;charset=utf-8' }) }))
  return guardarArchivos(archivos).catch(e => avisar(e.message || String(e)))
}

export function descargarBib(fuentes, nombre = 'bibliografia.bib') {
  descargar(nombre, aBibtex(fuentes), 'application/x-bibtex')
}

// --- Lectura y normalización ---
const texto = v => (v == null ? '' : String(v))
const numOTexto = v => (v === '' || v == null ? null : /^\d+$/.test(String(v).trim()) ? +v : String(v))
const lista = v => (Array.isArray(v) ? v.map(texto).filter(Boolean) : v ? String(v).split(/\s*;\s*/).filter(Boolean) : [])

function normProyecto(p) {
  return { ...p, id: texto(p.id), tipo: p.tipo === 'otro' ? 'otro' : 'tesis', titulo: texto(p.titulo), objetivos_especificos: lista(p.objetivos_especificos), indicadores: lista(p.indicadores) }
}
function normFuente(f) {
  return { ...f, id: texto(f.id), autores: lista(f.autores), anio: numOTexto(f.anio), titulo: texto(f.titulo), documento_original: f.documento_original || null }
}
function normCita(c) {
  return { ...c, id: texto(c.id), pagina: numOTexto(c.pagina), estado_uso: c.estado_uso || 'no_revisado' }
}
const NORM = { proyectos: normProyecto, fuentes: normFuente, citas: normCita }

function detectar(j, nombre) {
  for (const col of COLECCIONES) if (Array.isArray(j?.[col])) return [col, j[col]]
  if (Array.isArray(j)) {
    const col = COLECCIONES.find(c => nombre.toLowerCase().includes(c))
    if (col) return [col, j]
  }
  return [null, null]
}

/** Lee archivos JSON y devuelve { proyectos?, fuentes?, citas?, avisos[] } listo para importar. */
export async function leerArchivos(archivos) {
  const datos = { avisos: [] }
  for (const archivo of archivos) {
    try {
      const [col, items] = detectar(JSON.parse(await archivo.text()), archivo.name)
      if (!col) { datos.avisos.push(`${archivo.name}: no contiene "proyectos", "fuentes" ni "citas"`); continue }
      datos[col] = [...(datos[col] || []), ...items.filter(x => x && typeof x === 'object')]
    } catch (e) {
      datos.avisos.push(`${archivo.name}: JSON inválido (${e.message})`)
    }
  }
  return prepararDatos(datos)
}

function prepararDatos(datos) {
  for (const col of COLECCIONES) if (datos[col]) {
    const sinId = datos[col].filter(x => !x.id).length
    if (sinId) datos.avisos.push(`${sinId} ${col} sin id se ignoraron`)
    datos[col] = datos[col].filter(x => x.id).map(NORM[col])
  }
  if (datos.citas?.some(c => !c.fuente_id && (c.titulo || c.autores?.length))) convertirFormatoAntiguo(datos)
  const proyectos = new Set([...S.proyectos.map(p => p.id), ...(datos.proyectos || []).map(p => p.id)])
  const fuentes = new Set([...S.fuentes.map(f => f.id), ...(datos.fuentes || []).map(f => f.id)])
  const huerfanas = (datos.citas || []).filter(c => !proyectos.has(c.proyecto_id) || !fuentes.has(c.fuente_id)).length
  if (huerfanas) datos.avisos.push(`${huerfanas} citas apuntan a un proyecto o fuente que no existe`)
  return datos
}

/**
 * Esquema anterior de la skill: un solo citas.json con la metadata de la fuente
 * dentro de cada cita. Se separa en fuentes + citas y se asigna a un proyecto.
 */
function convertirFormatoAntiguo(datos) {
  registrarIds('proyectos', datos.proyectos || [])
  registrarIds('fuentes', datos.fuentes || [])
  const fuentes = [...S.fuentes.map(f => $state.snapshot(f)), ...(datos.fuentes || [])]
  const clave = f => extraerDoi(f.doi_o_url) || normalizar(`${f.titulo}|${f.anio}`)
  const indice = new Map(fuentes.map(f => [clave(f), f]))
  const nuevas = []
  let pid = S.proyectos.length === 1 ? S.proyectos[0].id : null
  if (!pid) {
    const p = { id: nuevoId('proyectos'), tipo: 'tesis', titulo: 'Citas importadas', objetivos_especificos: [], indicadores: [] }
    datos.proyectos = [...(datos.proyectos || []), p]
    pid = p.id
  }
  let n = 0
  datos.citas = datos.citas.map(c => {
    if (c.fuente_id || !(c.titulo || c.autores?.length)) return c
    n++
    let f = indice.get(clave(c))
    if (!f) {
      f = normFuente({
        id: nuevoId('fuentes'), tipo_fuente: c.tipo_fuente || 'otro', autores: c.autores, anio: c.anio, titulo: c.titulo,
        revista_o_editorial: c.revista_o_editorial, doi_o_url: c.doi_o_url, idioma: c.idioma, entrada_bibliografia: c.entrada_bibliografia,
        estado_verificacion: c.estado_verificacion, fuente_verificacion: c.fuente_verificacion, notas_correccion: c.notas_correccion
      })
      indice.set(clave(f), f)
      nuevas.push(f)
    }
    return {
      id: c.id, proyecto_id: c.proyecto_id || pid, fuente_id: f.id, estado_uso: c.estado_uso || 'usando',
      cita_textual_o_parafraseo: c.cita_textual_o_parafraseo || 'parafraseo', pagina: c.pagina ?? null,
      cita_en_texto: c.cita_en_texto || '', contexto: c.contexto || ''
    }
  })
  datos.fuentes = [...(datos.fuentes || []), ...nuevas]
  datos.avisos.push(`${n} citas en formato antiguo convertidas (${nuevas.length} fuentes nuevas)`)
}

export async function aplicar(datos, modo) {
  await importar(datos, modo)
  return COLECCIONES.filter(c => datos[c]).map(c => `${datos[c].length} ${c}`).join(', ')
}
