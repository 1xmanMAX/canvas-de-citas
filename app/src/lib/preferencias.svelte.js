// Preferencias de este aparato (no viajan en la sincronización): IndexedDB `meta.preferencias`.
import { leerMeta, ponerMeta } from './store.svelte.js'

class Preferencias {
  /** 'zoom': la rueda del mouse acerca/aleja (recomendado). 'desplazar': la rueda mueve el lienzo. */
  ruedaMouse = $state('zoom')
}
export const P = new Preferencias()

export async function cargarPreferencias() {
  const g = (await leerMeta('preferencias').catch(() => null)) || {}
  if (g.ruedaMouse === 'desplazar' || g.ruedaMouse === 'zoom') P.ruedaMouse = g.ruedaMouse
}

export function ponerPreferencia(clave, valor) {
  P[clave] = valor
  ponerMeta('preferencias', { ruedaMouse: P.ruedaMouse }).catch(() => {})
}
