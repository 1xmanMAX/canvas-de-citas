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

// Pellizco universal: en toda la app pellizcar el trackpad (rueda con ctrlKey) o Ctrl + rueda hace zoom
// solo en lo que se puede acercar (lienzo, PDF, fotos: cada uno lo atiende en su propio manejador);
// en el resto no hace nada. Nunca se agranda la página entera (dejaría la interfaz descuadrada).
// `teclas`: también Ctrl + / − / 0 (en la app de Windows, donde WebView2 permite ya el pellizco).
const TECLAS_ZOOM = new Set(['+', '=', '-', '_', '0'])

export function bloquearZoomDelNavegador(win, { teclas = false } = {}) {
  const rueda = e => { if (e.ctrlKey || e.metaKey) e.preventDefault() }
  const gesto = e => e.preventDefault() // Safari: el pellizco llega como gesture*
  const tecla = e => { if ((e.ctrlKey || e.metaKey) && !e.altKey && TECLAS_ZOOM.has(e.key)) e.preventDefault() }
  win.addEventListener('wheel', rueda, { passive: false })
  win.addEventListener('gesturestart', gesto)
  win.addEventListener('gesturechange', gesto)
  if (teclas) win.addEventListener('keydown', tecla)
  return () => {
    win.removeEventListener('wheel', rueda)
    win.removeEventListener('gesturestart', gesto)
    win.removeEventListener('gesturechange', gesto)
    win.removeEventListener('keydown', tecla)
  }
}
