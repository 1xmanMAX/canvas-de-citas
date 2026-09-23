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

/** ¿El segmento a→b toca el rectángulo r ({x, y, w, h})? (Liang–Barsky) */
function cruza(a, b, r) {
  const dx = b.x - a.x, dy = b.y - a.y
  let t0 = 0, t1 = 1
  for (const [p, q] of [[-dx, a.x - r.x], [dx, r.x + r.w - a.x], [-dy, a.y - r.y], [dy, r.y + r.h - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue }
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else { if (t < t0) return false; if (t < t1) t1 = t }
  }
  return true
}

const dentro = (p, r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h
const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
  }
}

/**
 * Trazo de una conexión manual que nunca pasa por debajo del obstáculo (la tarjeta del título).
 * Si la recta lo cruza, se curva por el lado opuesto al centro del obstáculo.
 * Devuelve { d: atributo de <path>, x, y: punto medio para la etiqueta }.
 */
export function rutaConexion(a, b, obstaculo, margen = 28) {
  const r = { x: obstaculo.x - margen, y: obstaculo.y - margen, w: obstaculo.w + 2 * margen, h: obstaculo.h + 2 * margen }
  if (!cruza(a, b, r)) return { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }

  const c = { x: obstaculo.x + obstaculo.w / 2, y: obstaculo.y + obstaculo.h / 2 }
  const dx = b.x - a.x, dy = b.y - a.y
  const largo = Math.hypot(dx, dy) || 1
  // Normal hacia el lado donde NO está el centro del obstáculo.
  let n = { x: -dy / largo, y: dx / largo }
  const lado = (c.x - a.x) * n.x + (c.y - a.y) * n.y
  if (lado > 0 || (lado === 0 && n.y < 0)) n = { x: -n.x, y: -n.y }

  const tp = Math.min(0.8, Math.max(0.2, ((c.x - a.x) * dx + (c.y - a.y) * dy) / (largo * largo)))
  const base = { x: a.x + dx * tp, y: a.y + dy * tp }
  const soporte = Math.abs(n.x) * r.w / 2 + Math.abs(n.y) * r.h / 2
  let k = soporte - ((base.x - c.x) * n.x + (base.y - c.y) * n.y)

  const interior = { x: obstaculo.x - 6, y: obstaculo.y - 6, w: obstaculo.w + 12, h: obstaculo.h + 12 }
  let ruta
  for (let intento = 0; intento < 6; intento++) {
    const w = { x: base.x + n.x * k, y: base.y + n.y * k }
    // Catmull-Rom a→w→b convertido a dos cúbicas (tangente en w paralela a a→b).
    const t = { x: dx / 6, y: dy / 6 }
    const s1 = [a, { x: a.x + (w.x - a.x) / 3, y: a.y + (w.y - a.y) / 3 }, { x: w.x - t.x, y: w.y - t.y }, w]
    const s2 = [w, { x: w.x + t.x, y: w.y + t.y }, { x: b.x - (b.x - w.x) / 3, y: b.y - (b.y - w.y) / 3 }, b]
    ruta = { d: `M${a.x} ${a.y}C${s1[1].x} ${s1[1].y} ${s1[2].x} ${s1[2].y} ${w.x} ${w.y}C${s2[1].x} ${s2[1].y} ${s2[2].x} ${s2[2].y} ${b.x} ${b.y}`, x: w.x, y: w.y }
    let choca = false
    for (let i = 1; i < 16 && !choca; i++) choca = dentro(bezier(...s1, i / 16), interior) || dentro(bezier(...s2, i / 16), interior)
    if (!choca) break
    k *= 1.3
  }
  return ruta
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
