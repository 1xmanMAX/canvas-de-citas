// Un proyecto, una carpeta. Cada carpeta registrada guarda los proyectos que tiene asignados (y,
// si es la "biblioteca", las fuentes que no cita ningún proyecto con carpeta) con el mismo formato
// de siempre: proyectos.json, fuentes.json, citas.json, fuentes/<id>/documento.*, fotos/<id>.*,
// CLAUDE.md. La app guarda sola tras cada cambio y recoge lo que la skill cambie en cualquiera de
// ellas (al volver a la ventana y cada pocos segundos). IndexedDB sigue siendo la caché rápida.
import {
  S, COLECCIONES, avisar, alCambiar, leerMeta, ponerMeta, leerDocumento, idsConDocumento, guardarDocumentoImportado,
  rutaDeDocumento, todasLasFotos, eliminarCita, eliminarFuente, eliminarProyecto, nuevoId
} from './store.svelte.js'
import { serializarLista, leerArchivos, aplicar } from './io.svelte.js'
import { generarClaudeMd } from './paraClaude.js'
import { repartir, docsDe, renumerar } from './reparto.js'
import { almacenDeHandle, almacenDeRegistro, registroDe, nombreSeguro } from './almacen-carpeta.js'
import { esAndroid } from './plataforma.js'

export const soportaCarpetas = !esAndroid && typeof window !== 'undefined' && 'showDirectoryPicker' in window

class EstadoCarpetas {
  /** [{ clave, nombre, proyectos: [ids], biblioteca, estado: 'conectada'|'sin-permiso'|'error', error, guardado }] */
  lista = $state([])
  soportado = soportaCarpetas
  /** Proyectos que no están en ninguna carpeta (creados antes o llegados por sincronización). */
  sinCarpeta = $derived(S.proyectos.filter(p => !this.lista.some(c => c.proyectos.includes(p.id))).map(p => p.id))
  /** Fuentes que no cita ningún proyecto con carpeta y no tienen biblioteca donde guardarse. */
  sueltasSinLugar = $derived.by(() => {
    if (this.lista.some(c => c.biblioteca)) return 0
    const conCarpeta = new Set(this.lista.flatMap(c => c.proyectos))
    const citadas = new Set(S.citas.filter(c => conCarpeta.has(c.proyecto_id)).map(c => c.fuente_id))
    return S.fuentes.filter(f => !citadas.has(f.id)).length
  })
  pendientesDePermiso = $derived(this.lista.filter(c => c.estado === 'sin-permiso').length)
}
export const CS = new EstadoCarpetas()

const almacenes = new Map() // clave → almacén
const registros = new Map() // clave → { handle } | { opfs }
let escritos = {} // clave → { archivo: lastModified } de lo que escribió la app (si cambia, fue otro)
const textos = new Map() // clave → { archivo: texto } último escrito (no se reescribe lo que no cambió)
const docsPendientes = new Set()
const presentes = new Map() // clave → rutas de documentos que ya se sabe que están en esa carpeta
/** Id con que se guarda en este navegador el documento de esa ruta (fuente o foto). */
// (Una foto duplicada comparte el original de su foto de origen: fotos/<id de origen>.<ext>.)
const idDeRuta = ruta => S.fuentes.find(f => f.documento_original === ruta)?.id || ruta.split('/').pop().replace(/\.[^.]+$/, '')
let temporizador
let cola = Promise.resolve()
const enCola = fn => (cola = cola.then(fn, fn))
const entrada = clave => CS.lista.find(c => c.clave === clave)
const conectadas = () => CS.lista.filter(c => c.estado === 'conectada')

function fallo(c, e) {
  if (!c) return
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') c.estado = 'sin-permiso'
  else if (e?.name === 'NotFoundError') { c.estado = 'error'; c.error = 'No se encuentra la carpeta (¿se movió o se borró?)'; return }
  c.error = e?.message || String(e)
}

async function persistir() {
  const lista = CS.lista.map(c => ({ clave: c.clave, nombre: c.nombre, proyectos: [...c.proyectos], biblioteca: c.biblioteca, ...registros.get(c.clave) }))
  await ponerMeta('carpetas', lista)
}

/** `leidos`: archivos ya leídos de la carpeta (sus fechas cuentan como vistas: no se reimportan). */
async function registrar(almacen, { proyectos, biblioteca }, leidos = []) {
  const clave = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  escritos[clave] = Object.fromEntries(leidos.map(f => [f.name, f.lastModified]))
  almacenes.set(clave, almacen)
  registros.set(clave, await registroDe(almacen))
  CS.lista.push({ clave, nombre: almacen.nombre, proyectos, biblioteca, estado: 'conectada', error: '', guardado: null })
  await persistir()
  escuchar()
  return clave
}

async function yaRegistrada(almacen) {
  for (const [clave, a] of almacenes) if (await a.mismo(almacen).catch(() => false)) return clave
  return null
}

// --- Guardado automático ---
alCambiar(docId => {
  if (docId) docsPendientes.add(docId)
  if (!conectadas().length) return
  clearTimeout(temporizador)
  temporizador = setTimeout(guardarAhora, 700)
})

const datosActuales = () => ({ proyectos: $state.snapshot(S.proyectos), fuentes: $state.snapshot(S.fuentes), citas: $state.snapshot(S.citas) })

async function escribirSiCambio(clave, a, ruta, texto) {
  const previos = textos.get(clave) || textos.set(clave, {}).get(clave)
  if (previos[ruta] === texto) return
  await a.escribir(ruta, texto)
  previos[ruta] = texto
  const f = await a.leer(ruta)
  ;(escritos[clave] ||= {})[ruta] = f?.lastModified
}

export const guardarAhora = () => enCola(async () => {
  const activas = conectadas()
  if (!activas.length) return
  const partes = repartir(datosActuales(), CS.lista.map(c => ({ clave: c.clave, proyectos: c.proyectos, biblioteca: c.biblioteca })))
  const pendientes = [...docsPendientes].map(id => [id, rutaDeDocumento(id)])
  for (const c of activas) {
    const a = almacenes.get(c.clave), parte = partes.get(c.clave)
    try {
      for (const col of COLECCIONES) await escribirSiCambio(c.clave, a, `${col}.json`, serializarLista(col, parte[col]))
      const rutas = new Set(docsDe(parte))
      const hay = presentes.get(c.clave) || presentes.set(c.clave, new Set()).get(c.clave)
      for (const [id, ruta] of pendientes) {
        if (!ruta || !rutas.has(ruta)) continue
        const d = await leerDocumento(id)
        if (d?.blob) { await a.escribir(ruta, d.blob); hay.add(ruta) }
      }
      // Documentos que le tocan a esta carpeta por primera vez (p. ej. una fuente que ahora cita
      // también este proyecto): se copian si aún no están.
      for (const ruta of rutas) {
        if (hay.has(ruta)) continue
        if (!(await a.leer(ruta))) {
          const d = await leerDocumento(idDeRuta(ruta))
          if (!d?.blob) continue // tampoco está en este navegador: se reintenta en otro guardado
          await a.escribir(ruta, d.blob)
        }
        hay.add(ruta)
      }
      await escribirSiCambio(c.clave, a, 'CLAUDE.md', generarClaudeMd(parte))
      c.guardado = new Date().toISOString()
      c.error = ''
    } catch (e) { fallo(c, e) }
  }
  for (const [id] of pendientes) docsPendientes.delete(id)
  await ponerMeta('carpetasEscritos', $state.snapshot(escritos))
})

// --- Traer cambios hechos fuera de la app (la skill) ---
async function aplicarEliminados(a) {
  const f = await a.leer('eliminados.json')
  if (!f) return false
  let d
  try { d = JSON.parse(await f.text()) } catch { return false } // a medio escribir: se reintenta
  let n = 0
  for (const id of d.citas || []) if (S.citaPorId.has(id)) { eliminarCita(id); n++ }
  for (const id of d.fuentes || []) if (S.fuentePorId.has(id)) { eliminarFuente(id); n++ }
  for (const id of d.proyectos || []) if (S.proyectoPorId.has(id)) { eliminarProyecto(id); n++ }
  await a.borrar('eliminados.json')
  return n > 0
}

/** Documentos y originales de fotos que están en la carpeta pero no en este navegador. */
async function traerDocumentos(a) {
  const locales = new Set(await idsConDocumento())
  for (const f of S.fuentes) {
    if (!f.documento_original || locales.has(f.id)) continue
    const archivo = await a.leer(f.documento_original)
    if (archivo) await guardarDocumentoImportado(f.id, f.documento_nombre || archivo.name, archivo)
  }
  for (const f of todasLasFotos()) {
    if (!f.original || locales.has(f.id) || !f.original.includes(f.id)) continue
    const archivo = await a.leer(f.original)
    if (archivo) await guardarDocumentoImportado(f.id, archivo.name, archivo)
  }
}

async function traerCambios(c) {
  const a = almacenes.get(c.clave)
  const archivos = []
  for (const col of COLECCIONES) {
    const f = await a.leer(`${col}.json`)
    if (f && f.lastModified !== escritos[c.clave]?.[`${col}.json`]) archivos.push(f)
  }
  if (!archivos.length) return aplicarEliminados(a)
  const datos = await leerArchivos(archivos)
  if (!COLECCIONES.some(k => datos[k])) return false // p. ej. JSON a medio escribir: se reintenta luego
  // Un proyecto nuevo que la skill escribió en esta carpeta queda asignado a ella.
  for (const p of datos.proyectos || []) if (!CS.lista.some(x => x.proyectos.includes(p.id))) { c.proyectos.push(p.id); await persistir() }
  for (const f of archivos) (escritos[c.clave] ||= {})[f.name] = f.lastModified
  textos.delete(c.clave) // se reescribe la versión combinada
  await aplicar(datos, 'combinar')
  await traerDocumentos(a)
  await aplicarEliminados(a)
  return true
}

function revisar() {
  if (document.visibilityState !== 'visible') return
  for (const c of conectadas())
    enCola(() => traerCambios(c)).then(hubo => hubo && avisar(`Cambios de "${c.nombre}" cargados`)).catch(e => fallo(c, e))
}

let escuchando = false
function escuchar() {
  if (escuchando) return
  escuchando = true
  addEventListener('focus', revisar)
  document.addEventListener('visibilitychange', revisar)
  setInterval(revisar, 8000)
}

async function conectar(c) {
  c.estado = 'conectada'
  c.error = ''
  const a = almacenes.get(c.clave)
  try {
    await enCola(async () => {
      await traerCambios(c)
      // Lo que tiene este navegador y aún no está en la carpeta (documentos y originales de fotos).
      const parte = repartir(datosActuales(), CS.lista.map(x => ({ clave: x.clave, proyectos: x.proyectos, biblioteca: x.biblioteca }))).get(c.clave)
      const rutas = new Set(docsDe(parte))
      for (const id of await idsConDocumento()) {
        const ruta = rutaDeDocumento(id)
        if (ruta && rutas.has(ruta) && !(await a.leer(ruta))) docsPendientes.add(id)
      }
    })
    await guardarAhora()
  } catch (e) { fallo(c, e) }
}

// --- Al abrir la app ---
export async function iniciarCarpetas() {
  if (!soportaCarpetas) return
  let lista = await leerMeta('carpetas')
  if (!lista) lista = await migrar()
  if (!lista?.length) return
  escritos = (await leerMeta('carpetasEscritos')) || {}
  for (const r of lista) {
    const a = await almacenDeRegistro(r).catch(() => null)
    if (!a) continue
    almacenes.set(r.clave, a)
    registros.set(r.clave, r.opfs ? { opfs: r.opfs } : { handle: r.handle })
    const permiso = await a.permiso().catch(() => 'prompt')
    CS.lista.push({ clave: r.clave, nombre: r.nombre || a.nombre, proyectos: r.proyectos || [], biblioteca: !!r.biblioteca, estado: permiso === 'granted' ? 'conectada' : 'sin-permiso', error: '', guardado: null })
  }
  escuchar()
  for (const c of conectadas()) await conectar(c)
}

/**
 * Versión anterior: una sola carpeta para todo. Pasa a ser la carpeta de los proyectos que tiene
 * (o de todos, si no se puede leer todavía) y la biblioteca: así no se pierde ninguna fuente.
 */
async function migrar() {
  const vieja = await leerMeta('carpeta')
  if (!vieja) return null
  const r = vieja.opfs ? { opfs: vieja.opfs } : { handle: vieja }
  const a = await almacenDeRegistro(r).catch(() => null)
  if (!a) return null
  let proyectos = S.proyectos.map(p => p.id)
  if ((await a.permiso().catch(() => 'prompt')) === 'granted') {
    const f = await a.leer('proyectos.json')
    try { if (f) proyectos = [...new Set([...JSON.parse(await f.text()).proyectos.map(p => p.id), ...proyectos])] } catch { /* se queda con los de aquí */ }
  }
  const clave = 'c' + Date.now().toString(36)
  const lista = [{ clave, nombre: a.nombre, proyectos, biblioteca: true, ...r }]
  const antes = await leerMeta('carpetaEscritos')
  if (antes) await ponerMeta('carpetasEscritos', { [clave]: Object.fromEntries(Object.entries(antes).map(([col, t]) => [`${col}.json`, t])) })
  await ponerMeta('carpetas', lista)
  await ponerMeta('carpeta', null)
  return lista
}

// --- Acciones del usuario ---
const elegir = id => window.showDirectoryPicker({ id, mode: 'readwrite' })

/** Nuevo proyecto: se elige dónde crear su carpeta (se crea una subcarpeta con su título). */
export async function crearCarpetaDeProyecto(pid) {
  const p = S.proyectoPorId.get(pid)
  if (!p) return false
  let madre
  try { madre = almacenDeHandle(await elegir('canvas-madre')) } catch { return false } // cancelado
  const a = await madre.subcarpetaNueva(nombreSeguro(p.titulo))
  await registrar(a, { proyectos: [pid], biblioteca: false })
  await guardarAhora()
  avisar(`Proyecto guardado en la carpeta "${a.nombre}"`)
  return true
}

/** Un proyecto sin carpeta: elegir una (se usa tal cual, sin crear subcarpeta). */
export async function elegirCarpetaPara(pid) {
  let a
  try { a = almacenDeHandle(await elegir('canvas-proyecto')) } catch { return false }
  const clave = await yaRegistrada(a)
  if (clave) { const c = entrada(clave); if (!c.proyectos.includes(pid)) c.proyectos.push(pid); await persistir() }
  else await registrar(a, { proyectos: [pid], biblioteca: false })
  await guardarAhora()
  return true
}

/** Carpeta para las fuentes que no cita ningún proyecto (la "biblioteca"). */
export async function elegirBiblioteca() {
  let a
  try { a = almacenDeHandle(await elegir('canvas-biblioteca')) } catch { return false }
  const clave = await yaRegistrada(a)
  for (const c of CS.lista) c.biblioteca = c.clave === clave
  if (!clave) await registrar(a, { proyectos: [], biblioteca: true })
  else await persistir()
  await guardarAhora()
  return true
}

export async function usarComoBiblioteca(clave) {
  for (const c of CS.lista) c.biblioteca = c.clave === clave
  await persistir()
  await guardarAhora()
}

/**
 * Abrir un proyecto desde su carpeta (p. ej. después de reinstalar o traído de otra PC). Lo que
 * choca con ids de aquí se renumera; devuelve el id del primer proyecto que traía (o null).
 */
export async function abrirCarpeta() {
  let a
  try { a = almacenDeHandle(await elegir('canvas-proyecto')) } catch { return null }
  if (await yaRegistrada(a)) { avisar(`"${a.nombre}" ya está abierta`); return null }
  const archivos = (await Promise.all(COLECCIONES.map(col => a.leer(`${col}.json`)))).filter(Boolean)
  const leidos = archivos.length ? await leerArchivos(archivos) : {}
  const actuales = datosActuales()
  const { datos, mapa } = renumerar({ proyectos: leidos.proyectos || [], fuentes: leidos.fuentes || [], citas: leidos.citas || [] }, actuales, nuevoId)
  // Documentos de fuentes renumeradas: se mueven a la ruta de su id nuevo.
  for (const [viejo, nuevo] of Object.entries(mapa.fuentes)) {
    const f = (leidos.fuentes || []).find(x => x.id === viejo)
    if (!f?.documento_original || actuales.fuentes.some(x => x.id === nuevo)) continue
    const archivo = await a.leer(f.documento_original)
    if (!archivo) continue
    const ruta = f.documento_original.replace(`fuentes/${viejo}/`, `fuentes/${nuevo}/`)
    await a.escribir(ruta, archivo)
    await a.borrar(f.documento_original)
  }
  await aplicar({ ...datos, avisos: [] }, 'combinar')
  await registrar(a, { proyectos: datos.proyectos.map(p => p.id), biblioteca: !datos.proyectos.length }, archivos)
  await traerDocumentos(a)
  await guardarAhora()
  const cambiados = Object.keys(mapa.proyectos).length + Object.keys(mapa.fuentes).length + Object.keys(mapa.citas).length
  avisar(`"${a.nombre}" abierta${cambiados ? ` (${cambiados} ids renumerados para no chocar con los de aquí)` : ''}`)
  return datos.proyectos[0]?.id || null
}

/**
 * Cerrar un proyecto: se guarda y se quita de la app (con sus citas y las fuentes que ya nadie usa).
 * Su carpeta no se toca: se puede volver a abrir. Solo si la carpeta es solo de ese proyecto.
 */
export async function cerrarProyecto(pid) {
  const c = CS.lista.find(x => x.proyectos.includes(pid))
  if (c && (c.proyectos.length > 1 || c.biblioteca)) {
    avisar('Este proyecto comparte carpeta con otros datos: no se puede cerrar por separado')
    return false
  }
  if (c?.estado === 'conectada') await guardarAhora()
  if (c) {
    CS.lista = CS.lista.filter(x => x !== c)
    almacenes.delete(c.clave); registros.delete(c.clave); textos.delete(c.clave); delete escritos[c.clave]
    await persistir()
  }
  const fuentes = new Set((S.citasPorProyecto.get(pid) || []).map(x => x.fuente_id))
  eliminarProyecto(pid)
  for (const fid of fuentes) if (!(S.citasPorFuente.get(fid) || []).length) eliminarFuente(fid)
  // La base de sincronización tampoco lo recuerda: así cerrarlo no borra el proyecto en la PC o el celular.
  const base = await leerMeta('baseSincro')
  if (base) {
    await ponerMeta('baseSincro', {
      proyectos: base.proyectos.filter(p => p.id !== pid),
      citas: base.citas.filter(x => x.proyecto_id !== pid),
      fuentes: base.fuentes.filter(f => S.fuentePorId.has(f.id))
    })
  }
  return true
}

/** Pide permiso a todas las carpetas que lo necesitan (en el mismo clic). */
export async function darPermiso() {
  for (const c of CS.lista.filter(x => x.estado === 'sin-permiso')) {
    const ok = await almacenes.get(c.clave).pedirPermiso().catch(() => false)
    if (ok) await conectar(c)
  }
}

/** Quitar una carpeta de la lista (sus archivos no se borran). */
export async function quitarCarpeta(clave) {
  CS.lista = CS.lista.filter(c => c.clave !== clave)
  almacenes.delete(clave); registros.delete(clave); textos.delete(clave); delete escritos[clave]
  await persistir()
}
