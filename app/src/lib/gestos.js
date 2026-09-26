// ¿La rueda viene de un mouse o de un trackpad? Chrome/Edge no lo dicen: se deduce de la forma de
// los eventos. Mouse: líneas (deltaMode 1) o muescas (wheelDeltaY múltiplo de 120, sin componente
// horizontal). Trackpad: deltas pequeños y continuos, a menudo con deltaX. El pellizco del trackpad
// llega con ctrlKey y se trata aparte (zoom).

export function esRuedaDeMouse(e) {
  if (e.ctrlKey) return false
  if (e.deltaMode !== 0) return true
  if (e.deltaX !== 0) return false
  const w = e.wheelDeltaY
  if (typeof w === 'number' && w !== 0) return Math.abs(w) >= 120 && w % 120 === 0
  return Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY)
}

/** Recuerda la decisión mientras llegan eventos seguidos (un mismo gesto): 400 ms de silencio la reinician. */
export function crearDetectorRueda(ahora = () => performance.now()) {
  let ultimo = -Infinity, tipo = null
  return e => {
    const t = ahora()
    if (!tipo || t - ultimo > 400) tipo = esRuedaDeMouse(e) ? 'mouse' : 'trackpad'
    ultimo = t
    return tipo
  }
}
