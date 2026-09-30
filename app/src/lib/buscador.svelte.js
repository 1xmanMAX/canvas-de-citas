// Estado del buscador general (Ctrl+F) y el índice de etiquetas de todo lo abierto.
import { S } from './store.svelte.js'
import { indexar, sugerencias } from './etiquetas.js'

class Buscador {
  abierto = $state(false)
  q = $state('')
  /** { id } del elemento que el lienzo debe centrar y resaltar al llegar desde el buscador. */
  resaltar = $state(null)
  /** Fuente a seleccionar al abrir la biblioteca desde el buscador. */
  fuente = $state(null)
  /** Se recalcula solo cuando cambian los datos (no en cada tecla del buscador). */
  indice = $derived(indexar({ proyectos: S.proyectos, fuentes: S.fuentes, citas: S.citas }))
}
export const B = new Buscador()

/** Sugerencias para el autocompletar: "#" → temas; "@" → personas y apellidos de autores. */
export const sugerir = (prefijo, parcial) =>
  sugerencias(B.indice, prefijo, parcial, prefijo === '@' ? S.fuentes.flatMap(f => f.autores || []) : [])

/** Lleva al elemento elegido en el buscador: su lienzo (centrado y resaltado), la fuente o la cita. */
export function enfocar(item) {
  B.abierto = false
  const ir = h => { if (location.hash !== h) location.hash = h }
  if (item.tipo === 'fuente') {
    const cita = S.citas.find(c => c.fuente_id === item.id)
    if (cita) return ir(`#/p/${cita.proyecto_id}/f/${item.id}`)
    B.fuente = item.id
    return ir('#/citas')
  }
  if (item.tipo === 'cita') {
    const c = S.citaPorId.get(item.id)
    return c && ir(`#/p/${c.proyecto_id}/f/${c.fuente_id}`)
  }
  // Tarjetas y agrupadores: su lienzo (el del proyecto, el sub-lienzo del objetivo o el lienzo de
  // lectura de la fuente, clave 'l:<fuente>'); objetivos: su sub-lienzo.
  const sub = !item.clave ? '' : item.clave.startsWith('l:') ? `/l/${item.clave.slice(2)}` : `/o/${item.clave}`
  const lienzo = `#/p/${item.pid}` + sub
  if (item.tipo !== 'objetivo') B.resaltar = { id: item.id }
  ir(lienzo)
}
