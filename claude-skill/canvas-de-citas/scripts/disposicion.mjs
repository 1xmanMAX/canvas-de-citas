// Dónde colocar una tarjeta nueva sin tapar nada. Reproduce (de forma aproximada) las medidas de
// app/src/lib/tarjetas.js y la distribución radial de app/src/lib/grafo.js; la app mide con
// precisión al dibujar, aquí basta con no encimar.
const NODO_W = 150, HUB_W = 420

const lineas = (t, w, px) => String(t || '').split('\n').reduce((n, par) => n + Math.max(1, Math.ceil((par.length * px) / w)), 0)
const ANCHO_LETRA = { sans: 6.4, serif: 6.8, mono: 7.6, mano: 7.2 }
const LH = { sans: 18.75, serif: 19.5, mono: 19.5, mano: 22 }
const PAPEL_W = { adhesiva: 168, rayada: 210, tarjeta: 190 }

/** Tamaño aproximado { w, h } de una tarjeta. */
export function tamano(lista, o) {
  if (lista === 'notas') {
    const w = PAPEL_W[o.estilo] || 168, letra = o.letra || 'sans'
    const n = Math.min(14, lineas(o.texto || 'Nota vacía', w - 32, ANCHO_LETRA[letra]))
    return { w, h: Math.round(26 + (o.titulo ? 28 : 0) + n * LH[letra] + (o.creado ? 14 : 0)) }
  }
  if (lista === 'listas') {
    const items = (o.items || []).slice(0, 30).reduce((s, it) => s + Math.min(3, lineas(it.t, 170, 6.4)) * 17 + 7, 0)
    return { w: 220, h: Math.round(41 + items + 22) }
  }
  if (lista === 'audios') return { w: 240, h: 104 + (Math.min(4, lineas(o.transcripcion || 'x', 208, 6.2)) - 1) * 16 + 34 }
  const ih = Math.min(240, Math.max(90, 184 / (o.proporcion || 4 / 3)))
  return { w: 200, h: Math.round(8 + ih + 8 + (o.titulo ? 30 : 0) + (o.texto ? 42 : 0) + (o.anotacion ? 63 : 0) + 12) }
}

// --- Cajas ocupadas ---
function autorCorto(f) {
  const ap = (f?.autores || []).map(a => String(a).split(',')[0].trim()).filter(Boolean)
  if (!ap.length) return f?.titulo?.split(' ').slice(0, 3).join(' ') || 'Sin autor'
  return ap.length === 1 ? ap[0] : ap.length === 2 ? `${ap[0]} & ${ap[1]}` : `${ap[0]} et al.`
}

function radial(items) {
  const pos = new Map(), paso = 178
  let i = 0, anillo = 0
  const r0 = Math.max(330, (Math.min(items.length, 14) * paso) / (2 * Math.PI))
  while (i < items.length) {
    const r = r0 + anillo * 175
    const cap = Math.max(6, Math.floor((2 * Math.PI * r) / paso))
    const m = Math.min(cap, items.length - i)
    const desfase = anillo % 2 ? Math.PI / m : 0
    for (let j = 0; j < m; j++) {
      const a = -Math.PI / 2 + (2 * Math.PI * j) / m + desfase
      pos.set(items[i + j].id, { x: Math.cos(a) * r - NODO_W / 2, y: Math.sin(a) * r - items[i + j].h / 2 })
    }
    i += m
    anillo++
  }
  return pos
}

function cajasTarjetas(c) {
  const l = []
  for (const lista of ['notas', 'listas', 'audios', 'fotos']) for (const o of c[lista] || []) l.push({ x: o.x, y: o.y, ...tamano(lista, o) })
  return l
}

/** Cajas ocupadas del lienzo principal de un proyecto. */
export function ocupadasProyecto(d, p) {
  const c = p.canvas
  const ids = [...new Set(d.citas.filter(x => x.proyecto_id === p.id).map(x => x.fuente_id))]
  const fuentes = ids.map(id => d.fuentes.find(f => f.id === id)).filter(Boolean)
    .sort((a, b) => autorCorto(a).localeCompare(autorCorto(b), 'es') || String(a.anio).localeCompare(String(b.anio)))
    .map(f => ({ id: f.id, h: 54 + (f.etiquetas?.length ? 23 : 0) }))
  const cajas = [{ x: -HUB_W / 2, y: -110, w: HUB_W, h: 220 }]
  if (c.modo === 'libre') {
    // En Libre, las fuentes sin posición guardada siguen en su lugar radial.
    const base = radial(fuentes)
    for (const f of fuentes) { const q = c.posiciones[f.id] || base.get(f.id); cajas.push({ x: q.x, y: q.y, w: NODO_W, h: f.h }) }
  } else if (c.modo === 'tema') {
    // "Por tema" reparte bloques alrededor del centro: se reserva un área amplia.
    const r = 260 + Math.sqrt(fuentes.length) * 120
    cajas.push({ x: -r, y: -r, w: 2 * r, h: 2 * r })
  } else {
    for (const [, q] of radial(fuentes)) cajas.push({ x: q.x, y: q.y, w: NODO_W, h: 77 })
  }
  return [...cajas, ...cajasTarjetas(c)]
}

/** Cajas ocupadas de un sub-lienzo de objetivo. */
export function ocupadasObjetivo(o) {
  return [
    { x: -190, y: -90, w: 380, h: 180 },
    ...(o.indicadores || []).map(x => ({ x: x.x, y: x.y, w: 210, h: 80 })),
    ...(o.fuentes || []).map(x => ({ x: x.x, y: x.y, w: NODO_W, h: 77 })),
    ...cajasTarjetas(o)
  ]
}

/** Primer hueco libre (esquina superior izquierda) para w×h cerca de (cx, cy). */
export function lugarLibre(ocupadas, w, h, cx = 0, cy = 0, margen = 28) {
  const choca = (x, y) => ocupadas.some(c => x < c.x + c.w + margen && x + w + margen > c.x && y < c.y + c.h + margen && y + h + margen > c.y)
  const x0 = cx - w / 2, y0 = cy - h / 2
  if (!choca(x0, y0)) return { x: Math.round(x0), y: Math.round(y0) }
  for (let r = 60; r < 4000; r += 60) {
    const pasos = Math.max(8, Math.round(r / 30))
    for (let i = 0; i < pasos; i++) {
      const a = (i / pasos) * Math.PI * 2
      const x = x0 + Math.cos(a) * r * 1.4, y = y0 + Math.sin(a) * r
      if (!choca(x, y)) return { x: Math.round(x), y: Math.round(y) }
    }
  }
  return { x: Math.round(x0), y: Math.round(y0) }
}
