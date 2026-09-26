// Un proyecto, una carpeta. Cada carpeta registrada guarda los proyectos que tiene asignados (y,
// si es la "biblioteca", las fuentes que no cita ningún proyecto con carpeta) con el mismo formato
// de siempre: proyectos.json, fuentes.json, citas.json, fuentes/<id>/documento.*, fotos/<id>.*,
// CLAUDE.md. La app guarda sola tras cada cambio y recoge lo que la skill cambie en cualquiera de
// ellas (al volver a la ventana y cada pocos segundos). IndexedDB sigue siendo la caché rápida.
import {
  S, COLECCIONES, avisar, alCambiar, leerMeta, ponerMeta, leerDocumento, idsConDocumento, guardarDocumentoImportado,
  rutaDeDocumento, todasLasFotos, eliminarCita, eliminarFuente, eliminarProyecto, nuevoId, registrarIds, quitarFuenteDeProyecto
} from './store.svelte.js'
import { serializarLista, leerArchivos, aplicar, normalizarElemento } from './io.svelte.js'
import { generarClaudeMd } from './paraClaude.js'
import { repartir, docsDe, renumerar } from './reparto.js'
import { almacenDeHandle, almacenDeRegistro, registroDe, nombreSeguro, elegirCarpetaWindows } from './almacen-carpeta.js'
import { esAndroid, esWindows, puente } from './plataforma.js'
import { SvelteSet } from 'svelte/reactivity'

// En la app de Windows, por su puente (sin permisos); en Chrome/Edge/Comet de escritorio, con File System Access.
export const soportaCarpetas = esWindows || (!esAndroid && typeof window !== 'undefined' && 'showDirectoryPicker' in window)

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
/** Carpetas ya leídas desde que se abrió la app: solo en ellas se escribe. */
const leidas = new SvelteSet()
/** Claves de carpetas que se quitaron del registro (el servidor las conservaría si no se le dice). */
const quitadas = new Set()
const listas = () => conectadas().filter(c => leidas.has(c.clave))

function fallo(c, e) {
  if (!c) return
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') c.estado = 'sin-permiso'
  else if (e?.name === 'NotFoundError') { c.estado = 'error'; c.error = 'No se encuentra la carpeta (¿se movió o se borró?)'; return }
  c.error = e?.message || String(e)
}

async function persistir() {
  const lista = CS.lista.map(c => ({ clave: c.clave, nombre: c.nombre, proyectos: [...c.proyectos], biblioteca: c.biblioteca, sincronizar: c.sincronizar !== false, ...registros.get(c.clave) }))
  await ponerMeta('carpetas', lista)
  // En Windows el servidor de sincronización usa el mismo registro (qué carpetas y cuáles sincronizar).
  if (esWindows) {
    const reg = lista.filter(c => c.ruta).map(c => ({ clave: c.clave, nombre: c.nombre, carpeta: c.ruta, proyectos: c.proyectos, biblioteca: c.biblioteca, sincronizar: c.sincronizar }))
    const quitar = [...quitadas].join(',')
    const r = await puente('registro', { metodo: 'PUT', cuerpo: JSON.stringify(reg), params: quitar ? { quitar } : {} }).catch(() => null)
    if (r?.ok) quitadas.clear()
  }
}

/**
 * `leidos`: archivos ya leídos de la carpeta (sus fechas cuentan como vistas: no se reimportan).
 * `leida`: la carpeta ya se leyó (o es nueva y vacía); si no, no se escribe en ella hasta leerla.
 */
async function registrar(almacen, { proyectos, biblioteca }, leidos = [], leida = true) {
  const clave = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  escritos[clave] = Object.fromEntries(leidos.map(f => [f.name, f.lastModified]))
  almacenes.set(clave, almacen)
  registros.set(clave, await registroDe(almacen))
  CS.lista.push({ clave, nombre: almacen.nombre, proyectos, biblioteca, sincronizar: true, estado: 'conectada', error: '', guardado: null })
  if (leida) leidas.add(clave)
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
  if (!listas().length) return
  clearTimeout(temporizador)
  temporizador = setTimeout(guardarAhora, 700)
})

const datosActuales = () => ({ proyectos: $state.snapshot(S.proyectos), fuentes: $state.snapshot(S.fuentes), citas: $state.snapshot(S.citas) })
const regs = () => CS.lista.map(x => ({ clave: x.clave, proyectos: x.proyectos, biblioteca: x.biblioteca }))
/** Ids de lo que hoy le toca a una carpeta (lo "propio" de esa carpeta). */
function propiosDe(clave) {
  const p = repartir(datosActuales(), regs()).get(clave) || { proyectos: [], fuentes: [], citas: [] }
  return Object.fromEntries(COLECCIONES.map(col => [col, new Set(p[col].map(x => x.id))]))
}

async function escribirSiCambio(clave, a, ruta, texto) {
  const previos = textos.get(clave) || textos.set(clave, {}).get(clave)
  if (previos[ruta] === texto) return
  const modificado = await a.escribir(ruta, texto, { si: escritos[clave]?.[ruta] })
  previos[ruta] = texto
  ;(escritos[clave] ||= {})[ruta] = modificado ?? (await a.leer(ruta))?.lastModified
}

export const guardarAhora = () => enCola(async () => {
  // Solo en carpetas ya leídas: nunca se escribe una carpeta antes de recoger lo que tenga (C1).
  const activas = listas()
  if (!activas.length) return
  const partes = repartir(datosActuales(), regs())
  const pendientes = [...docsPendientes].map(id => [id, rutaDeDocumento(id)])
  let releer = false
  for (const c of activas) {
    const a = almacenes.get(c.clave), parte = partes.get(c.clave)
    try {
      // Si algo (la skill) cambió esta carpeta desde la última vez, primero se lee: escribir ahora
      // pisaría ese cambio sin haberlo visto.
      if (await cambiadaAfuera(c.clave, a)) { releer = true; continue }
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
    } catch (e) {
      if (e?.name === 'CambiadoAfuera') releer = true // alguien lo cambió entre medio: se lee y se reintenta
      else fallo(c, e)
    }
  }
  for (const [id] of pendientes) docsPendientes.delete(id)
  await ponerMeta('carpetasEscritos', $state.snapshot(escritos))
  if (releer) setTimeout(revisar, 0) // lee lo cambiado y, al combinar, se vuelve a guardar
})

/** ¿Algún JSON de la carpeta tiene otra fecha que la que dejó la app? */
async function cambiadaAfuera(clave, a) {
  for (const col of COLECCIONES) {
    const visto = escritos[clave]?.[`${col}.json`]
    if (visto === undefined) continue
    const f = await a.leer(`${col}.json`)
    if (f && f.lastModified !== visto) return true
  }
  return false
}

// --- Traer cambios hechos fuera de la app (la skill) ---
/**
 * eliminados.json de una carpeta solo borra lo de esa carpeta (I3): una fuente que también usan
 * proyectos de otras carpetas se quita solo de los proyectos de esta.
 */
async function aplicarEliminados(c) {
  const a = almacenes.get(c.clave)
  const f = await a.leer('eliminados.json')
  if (!f) return false
  let d
  try { d = JSON.parse(await f.text()) } catch { return false } // a medio escribir: se reintenta
  const propios = propiosDe(c.clave)
  let n = 0
  for (const id of d.citas || []) if (propios.citas.has(id)) { eliminarCita(id); n++ }
  for (const id of d.fuentes || []) {
    if (!propios.fuentes.has(id)) continue
    const deOtras = (S.citasPorFuente.get(id) || []).some(x => !c.proyectos.includes(x.proyecto_id))
    if (deOtras) for (const pid of c.proyectos) quitarFuenteDeProyecto(pid, id)
    else eliminarFuente(id)
    n++
  }
  for (const id of d.proyectos || []) if (c.proyectos.includes(id) && S.proyectoPorId.has(id)) { eliminarProyecto(id); n++ }
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

/**
 * Documentos de fuentes renumeradas: pasan a la ruta de su id nuevo. Primero se leen todos y
 * luego se escriben, así ninguno pisa a otro que todavía no se movió (C3).
 */
async function moverDocs(a, mapa, fuentesLeidas, existentes) {
  const mover = []
  for (const [viejo, nuevo] of Object.entries(mapa.fuentes)) {
    const f = (fuentesLeidas || []).find(x => x.id === viejo)
    if (!f?.documento_original || existentes.has(nuevo)) continue
    const archivo = await a.leer(f.documento_original)
    if (archivo) mover.push([f.documento_original, f.documento_original.replace(`fuentes/${viejo}/`, `fuentes/${nuevo}/`), new Blob([await archivo.arrayBuffer()])])
  }
  for (const [, destino, blob] of mover) await a.escribir(destino, blob)
  const destinos = new Set(mover.map(m => m[1]))
  for (const [origen] of mover) if (!destinos.has(origen)) await a.borrar(origen)
}

// Para comparar un elemento de un JSON con el que escribió la app, con el mismo formato.
const canonico = (col, x) => JSON.stringify(ordenarClaves(normalizarElemento(col, x)))
function ordenarClaves(v) {
  if (Array.isArray(v)) return v.map(ordenarClaves)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, ordenarClaves(v[k])]))
  return v
}

async function traerCambios(c) {
  const a = almacenes.get(c.clave)
  const cambiados = []
  for (const col of COLECCIONES) {
    const f = await a.leer(`${col}.json`)
    if (f && f.lastModified !== escritos[c.clave]?.[`${col}.json`]) cambiados.push([col, f])
  }
  if (!cambiados.length) return aplicarEliminados(c)
  const previos = textos.get(c.clave) || {}
  const archivos = []
  for (const [col, f] of cambiados) {
    let items
    // Ilegible (a medio escribir, editado a mano): error visible; no se escribe en esta carpeta hasta que se lea bien.
    try { items = JSON.parse(await f.text()) } catch { throw new Error(`${col}.json está ilegible en "${c.nombre}": no se guardará ahí hasta que se corrija`) }
    items = Array.isArray(items) ? items : items?.[col]
    if (!Array.isArray(items)) throw new Error(`${col}.json no tiene el formato esperado en "${c.nombre}"`)
    for (const x of items) if (x?.id) registrarIds(col, [x])
    // Solo lo que de verdad cambió respecto a lo que la app escribió ahí: una copia vieja de una
    // fuente compartida no revierte lo corregido en otra carpeta (I4).
    const antes = previos[`${col}.json`] ? new Map(JSON.parse(previos[`${col}.json`])[col].map(x => [x.id, canonico(col, x)])) : null
    const nuevos = items.filter(x => x?.id && (!antes || antes.get(x.id) !== canonico(col, x)))
    archivos.push(new File([JSON.stringify({ [col]: nuevos })], `${col}.json`))
  }
  const leidos = await leerArchivos(archivos)
  // Ids que la skill escribió en esta carpeta y que ya usa otra carpeta para otra cosa: se
  // renumeran (la skill numera mirando solo esta carpeta) (C2).
  const propios = propiosDe(c.clave)
  const actuales = datosActuales()
  const ajenos = Object.fromEntries(COLECCIONES.map(col => [col, actuales[col].filter(x => !propios[col].has(x.id))]))
  const { datos, mapa } = renumerar({ proyectos: leidos.proyectos || [], fuentes: leidos.fuentes || [], citas: leidos.citas || [] }, ajenos, nuevoId)
  const renumerados = COLECCIONES.some(col => Object.keys(mapa[col]).length)
  if (renumerados) {
    await moverDocs(a, mapa, leidos.fuentes, new Set(actuales.fuentes.map(f => f.id)))
    textos.delete(c.clave) // la carpeta se reescribe con los ids nuevos
  }
  // Un proyecto nuevo que la skill escribió en esta carpeta queda asignado a ella.
  for (const p of datos.proyectos) if (!CS.lista.some(x => x.proyectos.includes(p.id))) { c.proyectos.push(p.id); await persistir() }
  for (const [, f] of cambiados) (escritos[c.clave] ||= {})[f.name] = f.lastModified
  await aplicar({ ...datos, avisos: [] }, 'combinar')
  await traerDocumentos(a)
  await aplicarEliminados(c)
  return true
}

function revisar() {
  if (document.visibilityState !== 'visible') return
  if (esWindows) enCola(recogerRegistro).catch(() => {})
  for (const c of conectadas())
    enCola(async () => {
      const hubo = await traerCambios(c)
      if (!leidas.has(c.clave)) { leidas.add(c.clave); c.error = ''; setTimeout(guardarAhora, 0) }
      return hubo
    }).then(hubo => hubo && avisar(`Cambios de "${c.nombre}" cargados`)).catch(e => fallo(c, e))
}

/** App de Windows: carpetas que registró el servidor (proyectos nuevos del celular) mientras la app estaba abierta. */
async function recogerRegistro() {
  const srv = await puente('registro').then(r => (r.ok ? r.json() : [])).catch(() => [])
  for (const e of srv) {
    if (CS.lista.some(c => c.clave === e.clave) || quitadas.has(e.clave)) continue
    const a = await almacenDeRegistro({ ruta: e.carpeta, nombre: e.nombre })
    almacenes.set(e.clave, a)
    registros.set(e.clave, { ruta: e.carpeta })
    const c = { clave: e.clave, nombre: e.nombre, proyectos: e.proyectos || [], biblioteca: !!e.biblioteca, sincronizar: e.sincronizar !== false, estado: 'conectada', error: '', guardado: null }
    CS.lista.push(c)
    await ponerMeta('carpetas', CS.lista.map(x => ({ clave: x.clave, nombre: x.nombre, proyectos: [...x.proyectos], biblioteca: x.biblioteca, sincronizar: x.sincronizar !== false, ...registros.get(x.clave) })))
    await traerCambios(entrada(e.clave))
    leidas.add(e.clave)
  }
}

let escuchando = false
function escuchar() {
  if (escuchando) return
  escuchando = true
  addEventListener('focus', revisar)
  document.addEventListener('visibilitychange', revisar)
  setInterval(revisar, 8000)
}

/** Lee la carpeta (queda "leída") y, si se pide, guarda. */
async function conectar(c, guardar = true) {
  c.estado = 'conectada'
  c.error = ''
  const a = almacenes.get(c.clave)
  try {
    await enCola(async () => {
      await traerCambios(c)
      leidas.add(c.clave)
      // Lo que tiene este navegador y aún no está en la carpeta (documentos y originales de fotos).
      const parte = repartir(datosActuales(), regs()).get(c.clave)
      const rutas = new Set(docsDe(parte))
      for (const id of await idsConDocumento()) {
        const ruta = rutaDeDocumento(id)
        if (ruta && rutas.has(ruta) && !(await a.leer(ruta))) docsPendientes.add(id)
      }
    })
    if (guardar) await guardarAhora()
  } catch (e) { fallo(c, e) }
}

/** Fecha del último cambio de sus JSON (para leer primero las más viejas y al final las más nuevas). */
async function ultimaModificacion(c) {
  let t = 0
  for (const col of COLECCIONES) t = Math.max(t, (await almacenes.get(c.clave).leer(`${col}.json`).catch(() => null))?.lastModified || 0)
  return t
}

// --- Al abrir la app ---
export async function iniciarCarpetas() {
  if (!soportaCarpetas) return
  let lista = await leerMeta('carpetas')
  if (esWindows) {
    // El registro del servidor manda (ahí también aparecen los proyectos que crea el celular).
    const srv = await puente('registro').then(r => (r.ok ? r.json() : [])).catch(() => [])
    if (srv.length) lista = srv.map(e => ({ clave: e.clave, nombre: e.nombre, proyectos: e.proyectos || [], biblioteca: !!e.biblioteca, sincronizar: e.sincronizar !== false, ruta: e.carpeta }))
  }
  if (!lista) lista = await migrar()
  if (!lista?.length) return
  escritos = (await leerMeta('carpetasEscritos')) || {}
  for (const r of lista) {
    const a = await almacenDeRegistro(r).catch(() => null)
    if (!a) continue
    almacenes.set(r.clave, a)
    registros.set(r.clave, r.ruta ? { ruta: r.ruta } : r.opfs ? { opfs: r.opfs } : { handle: r.handle })
    const permiso = await a.permiso().catch(() => 'prompt')
    CS.lista.push({ clave: r.clave, nombre: r.nombre || a.nombre, proyectos: r.proyectos || [], biblioteca: !!r.biblioteca, sincronizar: r.sincronizar !== false, estado: permiso === 'granted' ? 'conectada' : 'sin-permiso', error: '', guardado: null })
  }
  escuchar()
  // Primero se leen todas (la más reciente al final: su copia de una fuente compartida es la que
  // queda) y recién entonces se guarda una vez (C1).
  const orden = await Promise.all(conectadas().map(async c => [await ultimaModificacion(c), c]))
  for (const [, c] of orden.sort((x, y) => x[0] - y[0])) await conectar(c, false)
  await guardarAhora()
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
/** Elegir una carpeta: diálogo nativo en la app de Windows; si no, el del navegador. Cancelar lanza AbortError. */
async function elegirAlmacen(id, titulo) {
  if (esWindows) {
    const a = await elegirCarpetaWindows(titulo)
    if (!a) throw new DOMException('Cancelado', 'AbortError')
    return a
  }
  return almacenDeHandle(await window.showDirectoryPicker({ id, mode: 'readwrite' }))
}

/** Nuevo proyecto: se elige dónde crear su carpeta (se crea una subcarpeta con su título). */
export async function crearCarpetaDeProyecto(pid) {
  const p = S.proyectoPorId.get(pid)
  if (!p) return false
  let madre
  try { madre = await elegirAlmacen('canvas-madre', 'Dónde crear la carpeta del proyecto') } catch { return false } // cancelado
  const a = await madre.subcarpetaNueva(nombreSeguro(p.titulo))
  await registrar(a, { proyectos: [pid], biblioteca: false })
  await guardarAhora()
  avisar(`Proyecto guardado en la carpeta "${a.nombre}"`)
  return true
}

/** ¿La carpeta ya tiene datos de Canvas de Citas? (entonces se abre, no se adopta en blanco) */
async function tieneDatos(a) {
  for (const col of COLECCIONES) if (await a.leer(`${col}.json`)) return true
  return false
}
const YA_TIENE_DATOS = 'Esa carpeta ya tiene datos de Canvas de Citas: para usarlos, en Proyectos → Abrir proyecto'

/** Un proyecto sin carpeta: elegir una (se usa tal cual, sin crear subcarpeta). */
export async function elegirCarpetaPara(pid) {
  let a
  try { a = await elegirAlmacen('canvas-proyecto', 'Carpeta del proyecto') } catch { return false }
  const clave = await yaRegistrada(a)
  if (!clave && (await tieneDatos(a))) { avisar(YA_TIENE_DATOS); return false }
  if (clave) { const c = entrada(clave); if (!c.proyectos.includes(pid)) c.proyectos.push(pid); await persistir() }
  else await registrar(a, { proyectos: [pid], biblioteca: false })
  await guardarAhora()
  return true
}

/** Carpeta para las fuentes que no cita ningún proyecto (la "biblioteca"). */
export async function elegirBiblioteca() {
  let a
  try { a = await elegirAlmacen('canvas-biblioteca', 'Carpeta de la biblioteca') } catch { return false }
  const clave = await yaRegistrada(a)
  if (!clave && (await tieneDatos(a))) { avisar(YA_TIENE_DATOS); return false }
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
 * choca con ids de aquí se renumera; lo que ya está aquí se queda como está aquí (una copia vieja
 * no revierte ediciones). Devuelve el id del primer proyecto que traía (o null).
 */
export async function abrirCarpeta() {
  let a
  try { a = await elegirAlmacen('canvas-proyecto', 'Abrir la carpeta de un proyecto') } catch { return null }
  if (await yaRegistrada(a)) { avisar(`"${a.nombre}" ya está abierta`); return null }
  const archivos = (await Promise.all(COLECCIONES.map(col => a.leer(`${col}.json`)))).filter(Boolean)
  const leidos = archivos.length ? await leerArchivos(archivos) : { avisos: [] }
  // Un JSON ilegible (a medio escribir o editado a mano) no se toca: no se abre la carpeta (I6).
  const invalido = leidos.avisos.find(x => x.includes('JSON inválido'))
  if (invalido) { avisar(`No se abrió "${a.nombre}": ${invalido}`); return null }
  for (const col of COLECCIONES) registrarIds(col, leidos[col] || [])
  const actuales = datosActuales()
  const { datos, mapa } = renumerar({ proyectos: leidos.proyectos || [], fuentes: leidos.fuentes || [], citas: leidos.citas || [] }, actuales, nuevoId)
  await moverDocs(a, mapa, leidos.fuentes, new Set(actuales.fuentes.map(f => f.id)))
  const nuevos = {
    proyectos: datos.proyectos.filter(x => !S.proyectoPorId.has(x.id)),
    fuentes: datos.fuentes.filter(x => !S.fuentePorId.has(x.id)),
    citas: datos.citas.filter(x => !S.citaPorId.has(x.id))
  }
  // Proyectos que ya tienen su carpeta abierta (p. ej. una copia de la misma carpeta) no se duplican.
  const suyos = datos.proyectos.map(p => p.id).filter(id => !CS.lista.some(x => x.proyectos.includes(id)))
  // Fuentes que ninguno de sus proyectos cita: la carpeta también es biblioteca, para no borrarlas del disco (C5).
  const sueltas = datos.fuentes.some(f => !datos.citas.some(c => c.fuente_id === f.id))
  await aplicar({ ...nuevos, avisos: [] }, 'combinar')
  await registrar(a, { proyectos: suyos, biblioteca: !suyos.length || sueltas }, archivos)
  await traerDocumentos(a)
  await guardarAhora()
  const cambiados = Object.keys(mapa.proyectos).length + Object.keys(mapa.fuentes).length + Object.keys(mapa.citas).length
  avisar(`"${a.nombre}" abierta${cambiados ? ` (${cambiados} ids renumerados para no chocar con los de aquí)` : ''}`)
  return datos.proyectos[0]?.id || null
}

/** Se puede cerrar un proyecto solo si su carpeta es solo suya, está conectada y ya se leyó. */
export function sePuedeCerrar(pid) {
  const c = CS.lista.find(x => x.proyectos.includes(pid))
  return !!c && c.proyectos.length === 1 && !c.biblioteca && c.estado === 'conectada' && leidas.has(c.clave)
}

/**
 * Cerrar un proyecto: se guarda y se quita de la app (con sus citas y las fuentes que ya nadie usa).
 * Su carpeta no se toca: se puede volver a abrir. Si no se pudo guardar, no se quita nada (C4).
 */
export async function cerrarProyecto(pid) {
  if (!sePuedeCerrar(pid)) {
    avisar('Solo se puede cerrar un proyecto que está guardado en su propia carpeta')
    return false
  }
  const c = CS.lista.find(x => x.proyectos.includes(pid))
  await guardarAhora()
  if (c.estado !== 'conectada' || c.error) { avisar(`No se cerró: no se pudo guardar en "${c.nombre}"`); return false }
  CS.lista = CS.lista.filter(x => x !== c)
  almacenes.delete(c.clave); registros.delete(c.clave); textos.delete(c.clave); leidas.delete(c.clave); delete escritos[c.clave]
  quitadas.add(c.clave)
  await persistir()
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

/**
 * Pide permiso a todas las carpetas que lo necesitan en el mismo clic (sin leer ni escribir entre
 * medio, que haría vencer el clic) y luego las lee todas y guarda una vez (I2).
 */
export async function darPermiso() {
  const concedidas = []
  for (const c of CS.lista.filter(x => x.estado === 'sin-permiso'))
    if (await almacenes.get(c.clave).pedirPermiso().catch(() => false)) concedidas.push(c)
  for (const c of concedidas) await conectar(c, false)
  await guardarAhora()
}

/** Quitar una carpeta de la lista (sus archivos no se borran). */
export async function quitarCarpeta(clave) {
  CS.lista = CS.lista.filter(c => c.clave !== clave)
  almacenes.delete(clave); registros.delete(clave); textos.delete(clave); leidas.delete(clave); delete escritos[clave]
  quitadas.add(clave)
  await persistir()
}

/** App de Windows: sincronizar (o no) con el celular el proyecto y su carpeta. */
export async function ponerSincronizar(pid, valor) {
  const c = CS.lista.find(x => x.proyectos.includes(pid))
  if (!c) return
  c.sincronizar = valor
  await persistir()
}

/** App de Windows: abrir la carpeta del proyecto en el Explorador. */
export function mostrarCarpeta(pid) {
  const r = registros.get(CS.lista.find(x => x.proyectos.includes(pid))?.clave)
  if (esWindows && r?.ruta) puente('mostrar', { metodo: 'POST', params: { carpeta: r.ruta } })
}
