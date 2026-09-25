// La sincronización con la PC vista desde la app: estado para la UI (Configuración y el botón de
// la cabecera), el código de vinculación, este aparato dentro del grupo de sincronización y la
// sincronización automática (al abrir, cada 5 min, al volver a la app y poco después de un cambio).
import { leerMeta, ponerMeta, avisar, alCambiar } from './store.svelte.js'
import { esAndroid } from './plataforma.js'
import { leerCodigo, crearConexion } from './sincro-http.js'
import { sincronizar } from './sincro-cliente.js'
import { almacenApp } from './sincro-almacen.js'
import { buscarPc } from './sincro-red.js'

class EstadoSincro {
  codigo = $state('')
  ultima = $state(null) // { fecha, conflictos, bajados, subidos, reintentos, recibidos, enviados, bytes }
  aparato = $state(null) // { id, nombre } de este aparato en el grupo
  grupo = $state([]) // [{ id, nombre, visto, sincronizado }] según la PC
  trabajando = $state(false)
  progreso = $state('')
  error = $state('')
}
export const SA = new EstadoSincro()

let cargado
export function cargarSincro() {
  cargado ||= Promise.all([leerMeta('sincroCodigo'), leerMeta('sincroUltima'), leerMeta('sincroAparato'), leerMeta('sincroGrupo')]).then(async ([c, u, a, g]) => {
    SA.codigo = c || ''
    SA.ultima = u || null
    SA.grupo = g || []
    if (!a?.id) {
      a = { id: 'ap_' + crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), ''), nombre: nombrePorDefecto() }
      await ponerMeta('sincroAparato', a)
    }
    SA.aparato = a
  })
  return cargado
}

function nombrePorDefecto() {
  if (esAndroid) return 'Celular'
  const ua = navigator.userAgent
  return /Windows/.test(ua) ? 'PC con Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'PC con Linux' : 'Navegador'
}

export async function renombrarAparato(nombre) {
  await cargarSincro()
  SA.aparato = { ...SA.aparato, nombre: nombre.trim().slice(0, 60) || nombrePorDefecto() }
  await ponerMeta('sincroAparato', $state.snapshot(SA.aparato))
}

export async function guardarCodigo(codigo) {
  leerCodigo(codigo) // valida
  SA.codigo = codigo.trim()
  await ponerMeta('sincroCodigo', SA.codigo)
}

async function sincronizarCon(codigo) {
  const { url, clave } = leerCodigo(codigo)
  const conexion = await crearConexion({ url, clave })
  return sincronizar({ conexion, almacen: almacenApp, alProgreso: t => (SA.progreso = t), aparato: $state.snapshot(SA.aparato) })
}

// En automático (cada 5 min) no se barre la red cada vez: fuera de casa gastaría batería.
let ultimaBusqueda = 0
function puedeBuscar(silencioso) {
  if (!silencioso) return true
  if (Date.now() - ultimaBusqueda < 30 * 60_000) return false
  ultimaBusqueda = Date.now()
  return true
}

/** Sincroniza con la PC. `silencioso`: automática, sin avisos si la PC no está en la red. */
export async function sincronizarAhora({ silencioso = false } = {}) {
  await cargarSincro()
  if (SA.trabajando || !SA.codigo.trim()) return null
  SA.error = ''
  SA.trabajando = true
  try {
    await ponerMeta('sincroCodigo', SA.codigo.trim())
    let r
    try {
      r = await sincronizarCon(SA.codigo)
    } catch (e) {
      // Sin respuesta: quizá la PC cambió de IP → se busca en la red y se reintenta.
      if (!e.red || !puedeBuscar(silencioso)) throw e
      SA.progreso = 'Buscando la PC en la red…'
      const nuevo = await buscarPc({ codigo: SA.codigo, alProgreso: t => (SA.progreso = t) })
      if (!nuevo) throw e
      await guardarCodigo(nuevo)
      r = await sincronizarCon(nuevo)
    }
    const { grupo, ...resumen } = r
    SA.ultima = { fecha: new Date().toISOString(), ...resumen }
    await ponerMeta('sincroUltima', $state.snapshot(SA.ultima))
    if (grupo) { SA.grupo = grupo; await ponerMeta('sincroGrupo', grupo) }
    if (!silencioso || r.bajados || r.subidos || r.conflictos)
      avisar(`Sincronizado${r.conflictos ? ` · ${r.conflictos} cambios en ambos lados (ganó este aparato)` : ''}`)
    return r
  } catch (e) {
    // En automático, que la PC no esté (otra red, apagada) no es un error que mostrar.
    if (!(silencioso && e.red)) SA.error = e.message
    return null
  } finally {
    SA.trabajando = false
    SA.progreso = ''
  }
}

const CADA = 5 * 60 * 1000
let iniciada = false
const TRAS_CAMBIO = 20_000
/** Sincroniza sola (si el aparato ya está vinculado): al abrir, cada 5 minutos, al volver a la
 *  app y ~20 s después de un cambio, para que los demás aparatos lo reciban pronto. */
export async function iniciarSincroAutomatica() {
  if (iniciada) return
  iniciada = true
  await cargarSincro()
  const auto = () => sincronizarAhora({ silencioso: true })
  auto()
  let pendiente
  alCambiar(() => {
    // Los cambios que trae la propia sincronización no cuentan.
    if (SA.trabajando || !SA.codigo.trim()) return
    clearTimeout(pendiente)
    pendiente = setTimeout(auto, TRAS_CAMBIO)
  })
  setInterval(() => document.visibilityState === 'visible' && auto(), CADA)
  let oculta = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') oculta = Date.now()
    else if (oculta && Date.now() - oculta > 30_000) auto()
  })
}
