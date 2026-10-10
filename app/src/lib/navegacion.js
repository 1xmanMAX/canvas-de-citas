// Volver atrás dentro de la app sin salirse de ella. Cada entrada del historial guarda en su
// estado (history.state.previo) la ruta de la entrada anterior; "atrás" solo usa history.back()
// si esa entrada es justo a la que se quiere volver. Si no (la ruta se reemplazó o se entró por
// un enlace directo), reemplaza la ruta: así cerrar el lienzo de lectura nunca lleva a Proyectos.

const ruta = url => { const i = (url || '').indexOf('#'); return i < 0 ? '' : url.slice(i) }
let heredar // previo que pasa a la entrada que reemplaza a la actual (ver reemplazar)

/** Marca la entrada actual al arrancar (las entradas nuevas llegan con estado null). */
export function iniciarNavegacion(h = history) {
  if (!h.state || !('previo' in h.state)) h.replaceState({ ...h.state, previo: null }, '')
}

/** Llamar en cada hashchange: anota de dónde se vino si la entrada es nueva. */
export function alCambiarRuta(viejaUrl, h = history) {
  if (heredar !== undefined) { h.replaceState({ ...h.state, previo: heredar }, ''); heredar = undefined }
  else if (!h.state || !('previo' in h.state)) h.replaceState({ ...h.state, previo: ruta(viejaUrl) }, '')
}

/** Como location.replace, pero la entrada nueva conserva a cuál se vuelve. */
export function reemplazar(hash, h = history, loc = location) {
  if (loc.hash === hash) return
  heredar = h.state?.previo ?? null
  loc.replace(hash)
}

/** Vuelve a `alternativa`: con history.back() si es la entrada anterior; si no, reemplazando. */
export function atras(alternativa, h = history, loc = location) {
  if (h.state?.previo === alternativa) h.back()
  else reemplazar(alternativa, h, loc)
}
