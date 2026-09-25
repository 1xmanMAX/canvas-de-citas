// La sincronización con la PC vista desde la app: estado para la UI (Configuración y el botón de
// la cabecera en Android), el código de vinculación guardado y la sincronización automática.
import { leerMeta, ponerMeta, avisar } from './store.svelte.js'
import { leerCodigo, crearConexion } from './sincro-http.js'
import { sincronizar } from './sincro-cliente.js'
import { almacenApp } from './sincro-almacen.js'
import { buscarPc } from './sincro-red.js'

class EstadoSincro {
  codigo = $state('')
  ultima = $state(null) // { fecha, conflictos, bajados, subidos, reintentos }
  trabajando = $state(false)
  progreso = $state('')
  error = $state('')
}
export const SA = new EstadoSincro()

let cargado
export function cargarSincro() {
  cargado ||= Promise.all([leerMeta('sincroCodigo'), leerMeta('sincroUltima')]).then(([c, u]) => {
    SA.codigo = c || ''
    SA.ultima = u || null
  })
  return cargado
}

export async function guardarCodigo(codigo) {
  leerCodigo(codigo) // valida
  SA.codigo = codigo.trim()
  await ponerMeta('sincroCodigo', SA.codigo)
}

async function sincronizarCon(codigo) {
  const { url, clave } = leerCodigo(codigo)
  const conexion = await crearConexion({ url, clave })
  return sincronizar({ conexion, almacen: almacenApp, alProgreso: t => (SA.progreso = t) })
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
    SA.ultima = { fecha: new Date().toISOString(), ...r }
    await ponerMeta('sincroUltima', $state.snapshot(SA.ultima))
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
/** Android: sincroniza al abrir, cada 5 minutos y al volver a la app (si ya está vinculada). */
export function iniciarSincroAutomatica() {
  if (iniciada) return
  iniciada = true
  const auto = () => sincronizarAhora({ silencioso: true })
  auto()
  setInterval(() => document.visibilityState === 'visible' && auto(), CADA)
  let oculta = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') oculta = Date.now()
    else if (oculta && Date.now() - oculta > 30_000) auto()
  })
}
