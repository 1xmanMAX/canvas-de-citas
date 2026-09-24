// Operaciones sobre las tarjetas libres de un lienzo `c` (p.canvas o un sub-lienzo de objetivo).
import { medir, asegurarTablero, idLocal, ahoraISO, TIPO } from './tarjetas.js'

const copia = o => JSON.parse(JSON.stringify(o))

/**
 * Primer hueco libre (esquina superior izquierda) para una caja w×h, buscando en anillos
 * alrededor de (cx, cy) para no tapar lo que ya hay en el lienzo.
 */
export function lugarLibre(ocupadas, w, h, cx, cy, margen = 24) {
  const choca = (x, y) => ocupadas.some(c => x < c.x + c.w + margen && x + w + margen > c.x && y < c.y + c.h + margen && y + h + margen > c.y)
  const x0 = cx - w / 2, y0 = cy - h / 2
  if (!choca(x0, y0)) return { x: Math.round(x0), y: Math.round(y0) }
  for (let r = 60; r < 2400; r += 60) {
    const pasos = Math.max(8, Math.round(r / 30))
    for (let i = 0; i < pasos; i++) {
      const a = (i / pasos) * Math.PI * 2
      const x = x0 + Math.cos(a) * r * 1.4, y = y0 + Math.sin(a) * r
      if (!choca(x, y)) return { x: Math.round(x), y: Math.round(y) }
    }
  }
  return { x: Math.round(x0), y: Math.round(y0) }
}

/** Tarjeta nueva centrada en (x, y), o en el hueco libre más cercano si se pasan las cajas ocupadas. */
export function nuevaTarjeta(lista, x, y, datos = {}, ocupadas = null) {
  const base = {
    notas: { titulo: '', texto: '', estilo: 'adhesiva', letra: 'sans', color: 'amarillo' },
    listas: { titulo: '', items: [] },
    audios: { audio: '', duracion: 0, onda: [], transcripcion: '' },
    fotos: { titulo: '', texto: '', anotacion: '', imagen: '', proporcion: 4 / 3, trazos: [] }
  }[lista]
  const o = { id: idLocal(TIPO[lista]), ...base, ...datos, creado: ahoraISO(), x: 0, y: 0 }
  const d = medir(lista, o)
  Object.assign(o, ocupadas ? lugarLibre(ocupadas, d.w, d.h, x, y) : { x: Math.round(x - d.w / 2), y: Math.round(y - d.h / 2) })
  return o
}

/**
 * Guarda la tarjeta. Si es nueva y se pasan las cajas ocupadas, se vuelve a buscar el hueco con
 * su tamaño final (al escribirle texto crece y podría tapar a sus vecinas).
 */
export function guardarTarjeta(c, lista, o, nueva, ocupadas = null) {
  asegurarTablero(c)
  const datos = copia(o)
  if (nueva && ocupadas) {
    const antes = medir(lista, { ...datos, texto: '', titulo: '', items: [], transcripcion: '', anotacion: '' })
    const d = medir(lista, datos)
    Object.assign(datos, lugarLibre(ocupadas, d.w, d.h, datos.x + antes.w / 2, datos.y + antes.h / 2))
  }
  if (nueva) c[lista].push(datos)
  else Object.assign(c[lista].find(x => x.id === datos.id) || {}, datos)
}

export function eliminarTarjeta(c, lista, id) {
  c[lista] = (c[lista] || []).filter(x => x.id !== id)
  c.conexiones = (c.conexiones || []).filter(k => k.desde !== id && k.hasta !== id)
}

export function duplicarTarjeta(c, lista, o) {
  const d = { ...copia(o), id: idLocal(TIPO[lista]), creado: ahoraISO(), x: o.x + 36, y: o.y + 36 }
  asegurarTablero(c)[lista].push(d)
  return d
}

export function alternarTarea(o, i) {
  const it = o.items?.[i]
  if (it) it.hecho = !it.hecho
}

/** Nombres de lo conectado a `id` (nombreDe(id) resuelve cualquier elemento del lienzo). */
export function vinculosDe(c, id, nombreDe) {
  return (c.conexiones || [])
    .filter(k => k.desde === id || k.hasta === id)
    .map(k => { const otro = k.desde === id ? k.hasta : k.desde; return nombreDe(otro) + (k.etiqueta ? ` — ${k.etiqueta}` : '') })
}

/** Punto donde se ancla una conexión: el centro, o la chincheta en el modo corcho. */
export const ancla = (caja, corcho) => caja && (corcho ? { x: caja.x + caja.w / 2, y: caja.y + 9 } : { x: caja.x + caja.w / 2, y: caja.y + caja.h / 2 })

/** Hilo del tablero de corcho: una curva que cuelga un poco entre dos chinchetas. */
export function rutaHilo(a, b) {
  const cae = Math.min(90, Math.hypot(b.x - a.x, b.y - a.y) * 0.12)
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + cae }
  return { d: `M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}`, x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 }
}
