// Agrupadores del lienzo: recuadros punteados con nombre que reúnen varios elementos (fuentes,
// notas, listas, audios, fotos, indicadores). Se guardan en `c.agrupadores` del lienzo
// ({ id, titulo, color, miembros: [ids], x, y, w, h }). El recuadro siempre se ajusta a sus
// miembros: si uno se mueve, el recuadro se estira o encoge; si se mueve el recuadro, se mueven
// todos. Soltar algo sobre un recuadro lo agrega; arrastrarlo lejos (sin tocar el recuadro) lo saca.
// x, y, w, h guardan el último ajuste (para un agrupador vacío, su lugar). Los agrupadores sin
// `miembros` (versiones anteriores) adoptan lo que tengan dentro.
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

/** Recuadro ajustado a unas cajas: margen alrededor y la cabecera arriba para el nombre. */
export function ajustar(cajas) {
  const x0 = Math.min(...cajas.map(c => c.x)), y0 = Math.min(...cajas.map(c => c.y))
  const x1 = Math.max(...cajas.map(c => c.x + c.w)), y1 = Math.max(...cajas.map(c => c.y + c.h))
  const x = x0 - PAD, y = y0 - CAB
  return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(MIN_W, x1 + PAD - x)), h: Math.round(Math.max(MIN_H, y1 + PAD - y)) }
}

const solapan = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/**
 * Acciones sobre los agrupadores de un lienzo. `lienzo()` devuelve el objeto que guarda
 * `agrupadores`; `elementos()` los elementos movibles `{ id, nombre, tipo, caja, poner(x, y) }`;
 * `antes()` se llama antes de mover cosas (p. ej. pasar a modo Libre); `guardar()` al terminar.
 * `cajaPorId(id)` (opcional) da la caja de un elemento sin recorrerlos todos: el recuadro se
 * recalcula en cada cuadro mientras se arrastra algo.
 */
export function accionesAgrupadores({ lienzo, elementos, cajaPorId = null, antes = () => {}, guardar = () => {} }) {
  // Se relee tras crearla: con Svelte, el valor de `||=` es el arreglo crudo, no el reactivo.
  const lista = () => { const c = lienzo(); c.agrupadores ||= []; return c.agrupadores }
  const porId = ids => { const s = new Set(ids); return elementos().filter(e => s.has(e.id)) }
  const cajaDe = e => ({ id: e.id, w: e.caja.w, h: e.caja.h, x: e.caja.x, y: e.caja.y })
  const colocar = (els, pos) => { for (const e of els) { const p = pos.get(e.id); if (p) e.poner(p.x, p.y) } }

  /** Miembros de `g` que siguen en el lienzo (los antiguos, sin lista, adoptan lo que tienen dentro). */
  function miembros(g, els = elementos()) {
    if (!Array.isArray(g.miembros)) return miembrosDe(g, els)
    const s = new Set(g.miembros)
    return els.filter(e => s.has(e.id))
  }
  /** Recuadro que se ve: ajustado a sus miembros, o el guardado si está vacío. */
  function caja(g, els) {
    const cajas = Array.isArray(g.miembros) && cajaPorId && !els
      ? g.miembros.map(cajaPorId).filter(Boolean)
      : miembros(g, els || elementos()).map(e => e.caja).filter(Boolean)
    return cajas.length ? ajustar(cajas) : { x: g.x, y: g.y, w: g.w, h: g.h }
  }
  /** Guarda en cada agrupador su recuadro ajustado (y la lista de miembros si no la tenía). */
  function fijar() {
    const els = elementos()
    for (const g of lista()) {
      if (!Array.isArray(g.miembros)) g.miembros = miembrosDe(g, els).map(e => e.id)
      else { const hay = new Set(els.map(e => e.id)); g.miembros = g.miembros.filter(id => hay.has(id)) }
      Object.assign(g, caja(g, els))
    }
  }
  const terminar = () => { fijar(); guardar() }
  /** Quita `ids` de todos los agrupadores salvo `g` (un elemento está en un solo agrupador). */
  const quitarDeOtros = (ids, g) => { for (const o of lista()) if (o !== g && Array.isArray(o.miembros)) o.miembros = o.miembros.filter(id => !ids.includes(id)) }

  return {
    miembros,
    caja,

    /** Crea un agrupador con los elementos `ids` acomodados dentro. `ubicar(w, h)` → esquina. */
    crear(titulo, color, ids, ubicar) {
      antes()
      fijar()
      const els = porId(ids)
      const { agrupador: g, pos } = nuevoAgrupador(titulo, color, els.map(cajaDe), 0, 0)
      const { x, y } = ubicar(g.w, g.h)
      g.x = Math.round(x); g.y = Math.round(y)
      g.miembros = els.map(e => e.id)
      colocar(els, new Map([...pos].map(([id, p]) => [id, { x: p.x + g.x, y: p.y + g.y }])))
      quitarDeOtros(g.miembros, g)
      lista().push(g)
      terminar()
      return g
    },

    /** Cambia nombre y color; mete los `ids` nuevos y saca los que ya no están. */
    editar(g, { titulo, color, ids }) {
      antes()
      fijar()
      g.titulo = titulo.trim() || 'Grupo'
      g.color = color
      const quedan = new Set(ids)
      const actuales = miembros(g)
      const salen = actuales.filter(e => !quedan.has(e.id))
      const siguen = actuales.filter(e => quedan.has(e.id))
      const ya = new Set(actuales.map(e => e.id))
      const entran = porId(ids).filter(e => !ya.has(e.id))
      const antesDe = { x: g.x, y: g.y, w: g.w, h: g.h }
      colocar(salen, sacar(antesDe, salen.map(cajaDe)))
      if (entran.length) {
        const marco = siguen.length ? ajustar(siguen.map(e => e.caja)) : antesDe
        colocar(entran, agregarDentro(marco, siguen.map(cajaDe), entran.map(cajaDe)).pos)
      }
      g.miembros = [...siguen, ...entran].map(e => e.id)
      quitarDeOtros(g.miembros, g)
      terminar()
    },

    /** Vuelve a acomodar en filas todo lo que tiene dentro (el recuadro se ajusta solo). */
    acomodar(g) {
      antes()
      fijar()
      const els = miembros(g).sort((a, b) => a.caja.y - b.caja.y || a.caja.x - b.caja.x)
      colocar(els, acomodar(els.map(cajaDe), g.x, g.y).pos)
      terminar()
    },

    /** Quita el recuadro (los elementos se quedan donde están). */
    eliminar(g) {
      lienzo().agrupadores = lista().filter(o => o.id !== g.id)
      guardar()
    },

    /** Arrastre del recuadro: se mueven con él todos sus miembros. */
    arrastre(g) {
      let x0, y0, mov = []
      return {
        inicio: () => {
          antes()
          fijar()
          x0 = g.x; y0 = g.y
          mov = miembros(g).map(e => ({ x: e.caja.x, y: e.caja.y, poner: e.poner }))
        },
        mover: (dx, dy) => {
          g.x = Math.round(x0 + dx); g.y = Math.round(y0 + dy)
          for (const m of mov) m.poner(Math.round(m.x + dx), Math.round(m.y + dy))
        },
        fin: terminar
      }
    },

    /**
     * Tras soltar el elemento `id` (arrastrado por el lienzo): si se alejó de su agrupador (ya no
     * toca el recuadro de antes), sale; si cayó sobre otro recuadro, entra en él. Luego se ajustan
     * todos los recuadros y se guarda.
     */
    soltado(id) {
      const els = elementos()
      const e = els.find(x => x.id === id)
      if (!e) return terminar()
      const suyo = lista().find(g => Array.isArray(g.miembros) && g.miembros.includes(id))
      // g.x… aún guarda el recuadro de antes del arrastre (se fija al terminar).
      if (suyo && !solapan(e.caja, { x: suyo.x, y: suyo.y, w: suyo.w, h: suyo.h })) suyo.miembros = suyo.miembros.filter(x => x !== id)
      const sigue = suyo && suyo.miembros.includes(id)
      if (!sigue) {
        // El recuadro más pequeño que contiene su centro (el más específico).
        const destino = lista().filter(g => contiene(caja(g, els), e.caja)).sort((a, b) => a.w * a.h - b.w * b.h)[0]
        if (destino) {
          if (!Array.isArray(destino.miembros)) destino.miembros = miembrosDe(destino, els).map(x => x.id)
          if (!destino.miembros.includes(id)) destino.miembros.push(id)
        }
      }
      terminar()
    },

    fijar
  }
}
