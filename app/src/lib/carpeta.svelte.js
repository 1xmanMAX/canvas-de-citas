// Carpeta de almacenamiento (File System Access API, Chrome/Edge de escritorio).
// Con una carpeta elegida, la app guarda sola proyectos.json, fuentes.json, citas.json y los
// documentos (fuentes/<id>/documento.ext) tras cada cambio, y recarga lo que la skill
// citas-tesis modifique en esa carpeta (al volver a la ventana y cada pocos segundos).
import { S, COLECCIONES, avisar, alCambiar, leerMeta, ponerMeta, leerDocumento, idsConDocumento, guardarDocumentoImportado, rutaDeDocumento, todasLasFotos, eliminarCita, eliminarFuente, eliminarProyecto } from './store.svelte.js'
import { serializar, leerArchivos, aplicar } from './io.svelte.js'
import { generarClaudeMd } from './paraClaude.js'

export const soportaCarpeta = typeof window !== 'undefined' && 'showDirectoryPicker' in window

class EstadoCarpeta {
  dir = $state(null)
  /** 'no-soportado' | 'ninguna' | 'conectada' | 'sin-permiso' */
  estado = $state(soportaCarpeta ? 'ninguna' : 'no-soportado')
  guardado = $state(null) // ISO del último guardado
  error = $state('')
}
export const C = new EstadoCarpeta()

// lastModified de cada JSON tal como lo dejó la app: si cambia, lo modificó otro (la skill).
let escritos = {}
const docsPendientes = new Set()
let temporizador
let cola = Promise.resolve()
const enCola = fn => (cola = cola.then(fn, fn))

// --- Acceso a archivos ---
async function escribir(dir, ruta, contenido) {
  const partes = ruta.split('/')
  const nombre = partes.pop()
  for (const p of partes) dir = await dir.getDirectoryHandle(p, { create: true })
  const w = await (await dir.getFileHandle(nombre, { create: true })).createWritable()
  await w.write(contenido)
  await w.close()
}

async function leerRuta(dir, ruta) {
  try {
    const partes = ruta.split('/').filter(Boolean)
    const nombre = partes.pop()
    for (const p of partes) dir = await dir.getDirectoryHandle(p)
    return await (await dir.getFileHandle(nombre)).getFile()
  } catch { return null }
}

function perderPermiso(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') C.estado = 'sin-permiso'
  C.error = e?.message || String(e)
}

// --- Guardado automático ---
alCambiar(docId => {
  if (docId) docsPendientes.add(docId)
  if (C.estado !== 'conectada') return
  clearTimeout(temporizador)
  temporizador = setTimeout(guardarAhora, 700)
})

export const guardarAhora = () => enCola(async () => {
  if (C.estado !== 'conectada') return
  try {
    for (const col of COLECCIONES) {
      await escribir(C.dir, `${col}.json`, serializar(col))
      escritos[col] = (await leerRuta(C.dir, `${col}.json`))?.lastModified
    }
    for (const id of [...docsPendientes]) {
      const ruta = rutaDeDocumento(id) // documento de una fuente u original de una foto
      const d = await leerDocumento(id)
      if (ruta && d?.blob) await escribir(C.dir, ruta, d.blob)
      docsPendientes.delete(id)
    }
    await escribir(C.dir, 'CLAUDE.md', generarClaudeMd())
    await ponerMeta('carpetaEscritos', { ...escritos })
    C.guardado = new Date().toISOString()
    C.error = ''
  } catch (e) { perderPermiso(e) }
})

// --- Traer cambios hechos fuera de la app ---
/**
 * eliminados.json lo escribe Claude Code (skill canvas-de-citas) al borrar proyectos, fuentes o
 * citas: al combinar, la app conservaría lo que falta en los JSON, así que se borra aquí por id.
 */
async function aplicarEliminados() {
  const a = await leerRuta(C.dir, 'eliminados.json')
  if (!a) return false
  let d
  try { d = JSON.parse(await a.text()) } catch { return false } // a medio escribir: se reintenta
  let n = 0
  for (const id of d.citas || []) if (S.citaPorId.has(id)) { eliminarCita(id); n++ }
  for (const id of d.fuentes || []) if (S.fuentePorId.has(id)) { eliminarFuente(id); n++ }
  for (const id of d.proyectos || []) if (S.proyectoPorId.has(id)) { eliminarProyecto(id); n++ }
  await C.dir.removeEntry('eliminados.json').catch(() => {})
  return n > 0
}

async function traerCambios() {
  const archivos = []
  for (const col of COLECCIONES) {
    const a = await leerRuta(C.dir, `${col}.json`)
    if (a && a.lastModified !== escritos[col]) archivos.push(a)
  }
  if (!archivos.length) return aplicarEliminados()
  const datos = await leerArchivos(archivos)
  if (!COLECCIONES.some(c => datos[c])) return false // p. ej. JSON a medio escribir: se reintenta luego
  await aplicar(datos, 'combinar') // dispara el guardado automático, que vuelve a escribir la versión combinada
  const locales = new Set(await idsConDocumento())
  for (const f of S.fuentes) {
    if (!f.documento_original || locales.has(f.id)) continue
    const a = await leerRuta(C.dir, f.documento_original)
    if (a) await guardarDocumentoImportado(f.id, f.documento_nombre || a.name, a)
  }
  // Originales de fotos (fotos/<id>.<ext>) que aún no están en este navegador.
  for (const f of todasLasFotos()) {
    if (!f.original || locales.has(f.id) || !f.original.includes(f.id)) continue
    const a = await leerRuta(C.dir, f.original)
    if (a) await guardarDocumentoImportado(f.id, a.name, a)
  }
  await aplicarEliminados()
  return true
}

function revisar() {
  if (C.estado !== 'conectada' || document.visibilityState !== 'visible') return
  enCola(traerCambios)
    .then(hubo => hubo && avisar('Cambios de la carpeta cargados'))
    .catch(perderPermiso)
}

let escuchando = false
function escuchar() {
  if (escuchando) return
  escuchando = true
  addEventListener('focus', revisar)
  document.addEventListener('visibilitychange', revisar)
  setInterval(revisar, 8000)
}

// --- Conexión ---
async function conectar(dir) {
  C.dir = dir
  C.estado = 'conectada'
  C.error = ''
  escuchar()
  try {
    await enCola(async () => {
      await traerCambios()
      // Documentos locales que aún no están en la carpeta.
      for (const id of await idsConDocumento()) {
        const ruta = rutaDeDocumento(id)
        if (ruta && !(await leerRuta(dir, ruta))) docsPendientes.add(id)
      }
    })
    await guardarAhora()
  } catch (e) { perderPermiso(e) }
}

/** Al abrir la app: reconecta la carpeta guardada si el navegador conserva el permiso. */
export async function iniciarCarpeta() {
  if (!soportaCarpeta) return
  const dir = await leerMeta('carpeta')
  if (!dir) return
  escritos = (await leerMeta('carpetaEscritos')) || {}
  C.dir = dir
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') await conectar(dir)
  else C.estado = 'sin-permiso'
}

/** Elegir (o cambiar) la carpeta. Si ya tiene los JSON, se combinan con lo local. */
export async function establecerCarpeta() {
  const dir = await window.showDirectoryPicker({ id: 'canvas-de-citas', mode: 'readwrite' })
  escritos = {}
  await ponerMeta('carpeta', dir)
  await ponerMeta('carpetaEscritos', {})
  await conectar(dir)
  avisar(`Guardando en "${dir.name}"`)
}

/** Volver a dar permiso (necesita un clic del usuario). */
export async function reconectar() {
  if (!C.dir) return
  if ((await C.dir.requestPermission({ mode: 'readwrite' })) === 'granted') await conectar(C.dir)
}

export async function dejarDeUsarCarpeta() {
  clearTimeout(temporizador)
  await ponerMeta('carpeta', null)
  C.dir = null
  C.estado = 'ninguna'
  C.guardado = null
}
