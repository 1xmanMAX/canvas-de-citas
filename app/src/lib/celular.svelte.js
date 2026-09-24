// Pasar archivos con el celular (y con PixPin) por la misma wifi.
// La PWA no puede abrir puertos: lo hace el receptor de Windows (receptor/), que habla el
// protocolo de "Pasar algo a otra persona" de PixPin y expone una API en 127.0.0.1:47480.
import { avisar } from './store.svelte.js'

const BASE = 'http://127.0.0.1:47480'
const USADO = 'celular-usado'

class EstadoCelular {
  /** null = sin comprobar · false = el receptor no responde · true = conectado */
  conectado = $state(null)
  estado = $state(null)
  recibidos = $state([])
}
export const R = new EstadoCelular()

async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: metodo === 'GET' ? {} : { 'X-Canvas': '1' },
    body: cuerpo
  })
  const tipo = r.headers.get('content-type') || ''
  const datos = tipo.includes('json') ? await r.json() : await r.blob()
  if (!r.ok) throw new Error(datos?.error || `Error ${r.status}`)
  return datos
}

let turnoVisto = 0
function aplicarEstado(e) {
  R.conectado = true
  const antes = R.estado?.recibidos ?? 0
  R.estado = e
  const a = e.actividad
  if (a?.turno && a.turno !== turnoVisto) {
    turnoVisto = a.turno
    if (a.fase === 'recibido') avisar(`${a.mensaje} de ${a.de}`)
    else if (a.fase === 'enviado') avisar(`Enviado a ${a.de}`)
  }
  if (e.recibidos !== antes || e.recibidos !== R.recibidos.length) cargarRecibidos()
}

export async function refrescar() {
  try { aplicarEstado(await api('/estado')) }
  catch { R.conectado = false }
}

export async function cargarRecibidos() {
  try { R.recibidos = await api('/recibidos') } catch {}
}

async function accion(ruta, cuerpo) {
  try { aplicarEstado(await api(ruta, { metodo: 'POST', cuerpo })) }
  catch (e) { avisar(e.message); throw e }
}

export const abrirRecepcion = () => accion('/recibir/abrir')
export const cerrarRecepcion = () => accion('/recibir/cerrar').catch(() => {})
export const recibirDe = codigo => accion('/recibir/codigo', codigo)
export const abrirEnvio = () => accion('/enviar/abrir')
export const cerrarEnvio = () => accion('/enviar/cerrar').catch(() => {})
export const enviarA = codigo => accion('/enviar/a', codigo)
export const limpiarEnvio = () => accion('/enviar/limpiar')

/** Pone archivos ({ nombre, blob }) en la cola de envío del receptor. */
export async function ponerEnCola(archivos) {
  for (const { nombre, blob } of archivos)
    aplicarEstado(await api('/enviar/archivo?n=' + encodeURIComponent(nombre), { metodo: 'POST', cuerpo: blob }))
}

export async function leerRecibido(nombre) {
  const blob = await api('/recibidos/archivo?n=' + encodeURIComponent(nombre))
  return new File([blob], nombre, { type: blob.type })
}

export async function descartarRecibido(nombre) {
  R.recibidos = await api('/recibidos/archivo?n=' + encodeURIComponent(nombre), { metodo: 'DELETE' })
  if (R.estado) R.estado.recibidos = R.recibidos.length
}

// --- Vigilancia: rápida con el diálogo abierto, lenta en segundo plano ---
// Solo empieza en segundo plano si alguna vez se usó (el navegador puede pedir permiso
// para la red local la primera vez, y no debe pedirlo a quien no usa esta función).
let mirando = 0
let temporizador
function programar() {
  clearTimeout(temporizador)
  const ms = mirando ? 1000 : R.conectado ? 6000 : 30000
  temporizador = setTimeout(async () => { await refrescar(); programar() }, ms)
}

export function mirar() {
  mirando++
  try { localStorage.setItem(USADO, '1') } catch {}
  refrescar().then(programar)
  return () => { mirando = Math.max(0, mirando - 1); programar() }
}

export function iniciarCelular() {
  let usado = false
  try { usado = localStorage.getItem(USADO) === '1' } catch {}
  if (usado) refrescar().then(programar)
}

/** Qué se puede hacer con un archivo recibido, según su tipo. */
export function claseDe(nombre, mime = '') {
  const ext = (nombre.split('.').pop() || '').toLowerCase()
  if (ext === 'json') return 'json'
  if (mime?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'imagen'
  if (['txt', 'md'].includes(ext)) return 'texto'
  if (['pdf', 'html', 'htm', 'docx', 'doc', 'epub'].includes(ext)) return 'documento'
  return 'otro'
}
