// Medición y ajuste de texto para SVG (canvas 2D con caché).
const ctx = document.createElement('canvas').getContext('2d')
const cache = new Map()

export const F = {
  autor: '600 13px Fraunces, Georgia, serif',
  hub: '600 20px Fraunces, Georgia, serif',
  grupo: '600 34px Fraunces, Georgia, serif',
  chico: '400 11px "Work Sans", system-ui, sans-serif',
  mini: '400 10px "Work Sans", system-ui, sans-serif',
  nota: '400 12.5px "Work Sans", system-ui, sans-serif'
}

export function ancho(t, font) {
  const k = font + '\u0000' + t
  let w = cache.get(k)
  if (w === undefined) {
    ctx.font = font
    w = ctx.measureText(t).width
    if (cache.size > 5000) cache.clear()
    cache.set(k, w)
  }
  return w
}

export function recortar(t, font, max) {
  t = String(t ?? '')
  if (ancho(t, font) <= max) return t
  let lo = 0, hi = t.length
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1
    if (ancho(t.slice(0, m) + '…', font) <= max) lo = m
    else hi = m - 1
  }
  return t.slice(0, lo).trimEnd() + '…'
}

export function envolver(t, font, max, maxLineas = 99) {
  const lineas = []
  for (const parrafo of String(t ?? '').split('\n')) {
    let actual = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? actual + ' ' + palabra : palabra
      if (!actual || ancho(prueba, font) <= max) actual = prueba
      else { lineas.push(actual); actual = palabra }
    }
    lineas.push(actual)
  }
  if (lineas.length > maxLineas) {
    const cortadas = lineas.slice(0, maxLineas)
    cortadas[maxLineas - 1] = recortar(cortadas[maxLineas - 1] + ' …', font, max)
    return cortadas
  }
  return lineas.map(l => recortar(l, font, max))
}

export const limpiarCache = () => cache.clear()
