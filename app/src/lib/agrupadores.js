// Agrupadores del lienzo: recuadros punteados con nombre que reúnen varios elementos (fuentes,
// notas, listas, audios, fotos, indicadores). Se guardan en `c.agrupadores` del lienzo
// ({ id, titulo, color, x, y, w, h }). Pertenecer a un agrupador es estar dentro: un elemento
// es miembro si su centro cae en el recuadro. Así, soltar algo dentro lo agrega y sacarlo lo quita.
const idLocal = prefijo => `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export const COLORES_GRUPO = {
  azul: '#2E4B5E', verde: '#3E7A5C', rojo: '#B0503B', ocre: '#B8842E', lila: '#7A5C99', gris: '#6B6559'
}
export const PAD = 24 // margen interior
export const CAB = 46 // alto de la cabecera (el nombre va arriba, dentro del recuadro)
export const SEP = 24 // separación entre elementos
export const MIN_W = 240, MIN_H = 140

export const centro = c => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 })

/** ¿El centro de la caja `c` cae dentro del agrupador `g`? */
export function contiene(g, c) {
  if (!c) return false
  const p = centro(c)
  return p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.h
}

/** Elementos (`{ id, caja }`) que están dentro de `g`. */
export const miembrosDe = (g, elementos) => elementos.filter(e => e.id !== g.id && contiene(g, e.caja))

/**
 * Acomoda cajas (`{ id, w, h }`) en filas dentro de un recuadro cuya esquina es (x, y).
 * Devuelve `{ pos: Map(id → {x, y}), w, h }` con el tamaño que necesita el recuadro.
 */
export function acomodar(cajas, x, y, anchoFila = null) {
  const area = cajas.reduce((s, c) => s + (c.w + SEP) * (c.h + SEP), 0)
  const ancho = Math.max(anchoFila ?? Math.sqrt(area) * 1.5, ...cajas.map(c => c.w), MIN_W - 2 * PAD)
  const pos = new Map()
  let cx = 0, cy = 0, filaH = 0, maxW = 0
  for (const c of cajas) {
    if (cx > 0 && cx + c.w > ancho) { cy += filaH + SEP; cx = 0; filaH = 0 }
    pos.set(c.id, { x: Math.round(x + PAD + cx), y: Math.round(y + CAB + cy) })
    cx += c.w + SEP
    filaH = Math.max(filaH, c.h)
    maxW = Math.max(maxW, cx - SEP)
  }
  return { pos, w: Math.round(Math.max(MIN_W, maxW + 2 * PAD)), h: Math.round(Math.max(MIN_H, CAB + cy + filaH + PAD)) }
}

/** Mete `nuevas` cajas en `g` debajo de lo que ya tiene (`actuales`); el recuadro crece si hace falta. */
export function agregarDentro(g, actuales, nuevas) {
  const abajo = actuales.length ? Math.max(...actuales.map(c => c.y + c.h)) + SEP - CAB : g.y
  const r = acomodar(nuevas, g.x, abajo, Math.max(g.w - 2 * PAD, ...nuevas.map(c => c.w)))
  const fondo = nuevas.length ? Math.max(...nuevas.map(c => r.pos.get(c.id).y + c.h)) + PAD : g.y + g.h
  const derecha = nuevas.length ? Math.max(...nuevas.map(c => r.pos.get(c.id).x + c.w)) + PAD : g.x + g.w
  return { pos: r.pos, w: Math.max(g.w, derecha - g.x), h: Math.max(g.h, fondo - g.y) }
}

/** Posiciones fuera de `g` (a su derecha, apiladas) para las cajas que salen del grupo. */
export function sacar(g, cajas) {
  const pos = new Map()
  let y = g.y
  for (const c of cajas) {
    pos.set(c.id, { x: Math.round(g.x + g.w + 48), y: Math.round(y) })
    y += c.h + SEP
  }
  return pos
}

/** Agrupador nuevo que reúne `cajas` (acomodadas dentro) con su esquina en (x, y). */
export function nuevoAgrupador(titulo, color, cajas, x, y) {
  const r = acomodar(cajas, x, y)
  return { agrupador: { id: idLocal('grupo'), titulo: titulo.trim() || 'Grupo', color, x: Math.round(x), y: Math.round(y), w: r.w, h: r.h }, pos: r.pos }
}

/**
 * Acciones sobre los agrupadores de un lienzo. `lienzo()` devuelve el objeto que guarda
 * `agrupadores`; `elementos()` los elementos movibles `{ id, nombre, tipo, caja, poner(x, y) }`;
 * `antes()` se llama antes de mover cosas (p. ej. pasar a modo Libre); `guardar()` al terminar.
 */
export function accionesAgrupadores({ lienzo, elementos, antes = () => {}, guardar = () => {} }) {
  // Se relee tras crearla: con Svelte, el valor de `||=` es el arreglo crudo, no el reactivo.
  const lista = () => { const c = lienzo(); c.agrupadores ||= []; return c.agrupadores }
  const porId = ids => { const s = new Set(ids); return elementos().filter(e => s.has(e.id)) }
  const cajaDe = e => ({ id: e.id, w: e.caja.w, h: e.caja.h, x: e.caja.x, y: e.caja.y })
  const colocar = (els, pos) => { for (const e of els) { const p = pos.get(e.id); if (p) e.poner(p.x, p.y) } }
  /** Miembros de `g` (elementos y agrupadores más pequeños dentro de él). */
  const miembros = g => miembrosDe(g, elementos())
  const anidados = g => lista().filter(o => o !== g && o.w * o.h < g.w * g.h && contiene(g, o))

  return {
    miembros,

    /** Crea un agrupador con los elementos `ids` acomodados dentro. `ubicar(w, h)` → esquina. */
    crear(titulo, color, ids, ubicar) {
      antes()
      const els = porId(ids)
      const { agrupador: g, pos } = nuevoAgrupador(titulo, color, els.map(cajaDe), 0, 0)
      const { x, y } = ubicar(g.w, g.h)
      g.x = Math.round(x); g.y = Math.round(y)
      colocar(els, new Map([...pos].map(([id, p]) => [id, { x: p.x + g.x, y: p.y + g.y }])))
      lista().push(g)
      guardar()
      return g
    },

    /** Cambia nombre y color; mete los `ids` nuevos y saca los que ya no están. */
    editar(g, { titulo, color, ids }) {
      antes()
      g.titulo = titulo.trim() || 'Grupo'
      g.color = color
      const quedan = new Set(ids)
      const actuales = miembros(g)
      const salen = actuales.filter(e => !quedan.has(e.id))
      const siguen = actuales.filter(e => quedan.has(e.id))
      const ya = new Set(actuales.map(e => e.id))
      const entran = porId(ids).filter(e => !ya.has(e.id))
      colocar(salen, sacar(g, salen.map(cajaDe)))
      if (entran.length) {
        const r = agregarDentro(g, siguen.map(cajaDe), entran.map(cajaDe))
        colocar(entran, r.pos)
        g.w = Math.round(r.w); g.h = Math.round(r.h)
      }
      guardar()
    },

    /** Vuelve a acomodar en filas todo lo que tiene dentro y ajusta el recuadro. */
    acomodar(g) {
      antes()
      const els = miembros(g).sort((a, b) => a.caja.y - b.caja.y || a.caja.x - b.caja.x)
      const r = acomodar(els.map(cajaDe), g.x, g.y)
      colocar(els, r.pos)
      g.w = r.w; g.h = r.h
      guardar()
    },

    /** Quita el recuadro (los elementos se quedan donde están). */
    eliminar(g) {
      lienzo().agrupadores = lista().filter(o => o.id !== g.id)
      guardar()
    },

    /** Arrastre del recuadro: se mueven con él sus miembros y los agrupadores que tiene dentro. */
    arrastre(g) {
      let x0, y0, mov = []
      return {
        inicio: () => {
          antes()
          x0 = g.x; y0 = g.y
          mov = [
            ...miembros(g).map(e => ({ x: e.caja.x, y: e.caja.y, poner: e.poner })),
            ...anidados(g).map(o => ({ x: o.x, y: o.y, poner: (x, y) => { o.x = x; o.y = y } }))
          ]
        },
        mover: (dx, dy) => {
          g.x = Math.round(x0 + dx); g.y = Math.round(y0 + dy)
          for (const m of mov) m.poner(Math.round(m.x + dx), Math.round(m.y + dy))
        },
        fin: guardar
      }
    },

    /** Arrastre de la esquina: cambia el tamaño (no mueve nada). */
    redimension(g) {
      let w0, h0
      return {
        inicio: () => { w0 = g.w; h0 = g.h },
        mover: (dx, dy) => { g.w = Math.round(Math.max(MIN_W, w0 + dx)); g.h = Math.round(Math.max(MIN_H, h0 + dy)) },
        fin: guardar
      }
    }
  }
}
