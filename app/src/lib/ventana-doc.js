// "Abrir en otra ventana": el documento del visor solo, en una ventana aparte (#/doc/<fuente>[/<proyecto>]).
// Esa ventana no guarda nada por su cuenta: las notas y recortes se los pide a la ventana principal
// por un BroadcastChannel, y la principal (la única que escribe) los pone en el lienzo de lectura.
// Así las dos ventanas no se pisan los datos. Si no hay ventana principal abierta, lo hace ella misma.
// En la app de Windows, window.open lo atiende el exe: abre otra ventana suya con el mismo puente.
import { S, avisar, ponerMeta } from './store.svelte.js'

const CANAL = 'canvas-de-citas-ventanas'
export const SUELTO = '~suelto' // un archivo que no es de ninguna fuente (va por la base local)

/** ¿Esta ventana es la de un documento? */
export const enVentanaDoc = () => /^#\/doc\//.test(location.hash)

/** Ruta y datos de la ventana de documento. */
export function rutaDoc(hash = location.hash) {
  const m = hash.replace(/^#\/doc\/?/, '').split('/').map(decodeURIComponent)
  return { fid: m[0] || null, pid: m[1] || null }
}

/** Abre el documento `archivo` (del visor) en otra ventana. */
export async function abrirEnVentana({ archivo, fuenteId, proyectoId }) {
  if (!archivo) return
  let ruta
  if (fuenteId) ruta = `#/doc/${encodeURIComponent(fuenteId)}${proyectoId ? '/' + encodeURIComponent(proyectoId) : ''}`
  else {
    await ponerMeta('docSuelto', { nombre: archivo.nombre, blob: archivo.blob })
    ruta = `#/doc/${SUELTO}`
  }
  const url = location.href.split('#')[0] + ruta
  const w = window.open(url, `doc-${fuenteId || 'suelto'}`, 'popup,width=1100,height=900')
  if (!w && !window.canvasWindows) avisar('El navegador bloqueó la ventana nueva: permite las ventanas emergentes de esta página')
}

let canal = null
const abrirCanal = () => (canal ||= typeof BroadcastChannel === 'function' ? new BroadcastChannel(CANAL) : null)

/**
 * Ventana principal: atiende los pedidos de las ventanas de documento. `hacer(pedido)` crea la
 * tarjeta y devuelve el proyecto ya guardado, que se le manda de vuelta (para marcar la cita).
 */
export function escucharVentanas(hacer) {
  const c = abrirCanal()
  if (!c) return
  c.onmessage = e => {
    const m = e.data
    if (m?.tipo !== 'cita') return
    const p = hacer(m)
    c.postMessage({ tipo: 'hecho', id: m.id, proyecto: p ? JSON.parse(JSON.stringify(p)) : null })
  }
}

/**
 * Ventana de documento: pide a la principal que cree la tarjeta. Devuelve true si la principal la
 * creó (y actualiza aquí el proyecto, para marcar la cita); false si no hay principal que responda.
 */
export function pedirAPrincipal(pedido, espera = 1500) {
  const c = abrirCanal()
  if (!c) return Promise.resolve(false)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return new Promise(res => {
    const listo = ok => { c.removeEventListener('message', oir); clearTimeout(t); res(ok) }
    const oir = e => {
      if (e.data?.tipo !== 'hecho' || e.data.id !== id) return
      const p = e.data.proyecto
      const i = p ? S.proyectos.findIndex(x => x.id === p.id) : -1
      if (i >= 0) S.proyectos[i] = p // solo en memoria: esta ventana no guarda
      listo(true)
    }
    const t = setTimeout(() => listo(false), espera)
    c.addEventListener('message', oir)
    c.postMessage({ ...pedido, tipo: 'cita', id })
  })
}
