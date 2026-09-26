// Estado del buscador general (Ctrl+F) y el índice de etiquetas de todo lo abierto.
import { S } from './store.svelte.js'
import { indexar, sugerencias } from './etiquetas.js'

class Buscador {
  abierto = $state(false)
  q = $state('')
  /** { id } del elemento que el lienzo debe centrar y resaltar al llegar desde el buscador. */
  resaltar = $state(null)
  /** Se recalcula solo cuando cambian los datos (no en cada tecla del buscador). */
  indice = $derived(indexar({ proyectos: S.proyectos, fuentes: S.fuentes, citas: S.citas }))
}
export const B = new Buscador()

/** Sugerencias para el autocompletar: "#" → temas; "@" → personas y apellidos de autores. */
export const sugerir = (prefijo, parcial) =>
  sugerencias(B.indice, prefijo, parcial, prefijo === '@' ? S.fuentes.flatMap(f => f.autores || []) : [])
