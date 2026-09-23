// Distribuciones del grafo (coordenadas del mundo; el nodo central está en 0,0).
import { F, ancho } from './texto.js'

export const NODO_W = 150

/** Alto de una tarjeta de fuente según lo que muestra. */
export const alturaNodo = (linea2, chips) => 54 + (linea2 ? 16 : 0) + (chips ? 23 : 0)

export function anchoChip(t) {
  return Math.ceil(ancho(t, F.mini)) + 16
}

/** Anillos concéntricos alrededor del nodo central (como el mockup). */
export function radial(items) {
  const pos = new Map()
  const paso = 178
  let i = 0, anillo = 0
  const r0 = Math.max(330, (Math.min(items.length, 14) * paso) / (2 * Math.PI))
  while (i < items.length) {
    const r = r0 + anillo * 175
    const cap = Math.max(6, Math.floor((2 * Math.PI * r) / paso))
    const m = Math.min(cap, items.length - i)
    const desfase = anillo % 2 ? Math.PI / m : 0
    for (let j = 0; j < m; j++) {
      const a = -Math.PI / 2 + (2 * Math.PI * j) / m + desfase
      const it = items[i + j]
      pos.set(it.id, { x: Math.cos(a) * r - NODO_W / 2, y: Math.sin(a) * r - it.h / 2 })
    }
    i += m
    anillo++
  }
  return pos
}

/** Agrupa items en bloques (rejilla interna) — base de "Por tema" y de la vista general. */
function bloques(items, claveGrupo) {
  const grupos = new Map()
  for (const it of items) {
    const g = claveGrupo(it) || 'Sin tema'
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g).push(it)
  }
  return [...grupos.entries()].map(([nombre, lista]) => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(lista.length * 1.4)))
    const filaH = Math.max(...lista.map(it => it.h)) + 22
    const filas = Math.ceil(lista.length / cols)
    return { nombre, lista, cols, filaH, w: cols * (NODO_W + 22) - 22, h: filas * filaH - 22 }
  })
}

function colocar(b, x, y, pos) {
  b.lista.forEach((it, i) => pos.set(it.id, { x: x + (i % b.cols) * (NODO_W + 22), y: y + Math.floor(i / b.cols) * b.filaH }))
  return { nombre: b.nombre, x, y: y - 16, w: b.w, h: b.h + 16, n: b.lista.length }
}

/** Bloques por tema dispuestos en círculo alrededor del nodo central. */
export function porTema(items, claveGrupo, hubW, hubH) {
  const pos = new Map()
  const bs = bloques(items, claveGrupo)
  if (!bs.length) return { pos, grupos: [] }
  const maxDiag = Math.max(...bs.map(b => Math.hypot(Math.max(b.w, ancho(b.nombre.toUpperCase(), '600 26px Fraunces, Georgia, serif')), b.h + 40)))
  const r = Math.max(Math.hypot(hubW, hubH) / 2 + maxDiag / 2 + 50, (bs.length * (maxDiag + 40)) / (2 * Math.PI))
  const grupos = bs.map((b, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / bs.length
    const cx = Math.cos(a) * r * 1.15, cy = Math.sin(a) * r
    return colocar(b, cx - b.w / 2, cy - b.h / 2 + 20, pos)
  })
  return { pos, grupos }
}

/** Bloques en filas (vista general, sin nodo central). */
export function enFilas(items, claveGrupo, anchoMax = 1500) {
  const pos = new Map()
  const grupos = []
  let x = 0, y = 0, altoFila = 0
  for (const b of bloques(items, claveGrupo)) {
    const w = Math.max(b.w, ancho(b.nombre.toUpperCase(), F.grupo) * 1.04)
    if (x > 0 && x + w > anchoMax) { x = 0; y += altoFila + 110; altoFila = 0 }
    grupos.push(colocar(b, x, y + 56, pos))
    x += w + 70
    altoFila = Math.max(altoFila, b.h + 56)
  }
  return { pos, grupos }
}

export function limitesDe(cajas, margen = 30) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const c of cajas) {
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y)
    x1 = Math.max(x1, c.x + c.w); y1 = Math.max(y1, c.y + c.h)
  }
  if (x0 === Infinity) return { x: -200, y: -150, w: 400, h: 300 }
  return { x: x0 - margen, y: y0 - margen, w: x1 - x0 + 2 * margen, h: y1 - y0 + 2 * margen }
}
