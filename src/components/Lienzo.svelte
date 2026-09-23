<script>
  // Lienzo SVG con desplazamiento, zoom (rueda / pellizco) y arrastre de nodos. Sin librerías.
  import { setContext } from 'svelte'
  import Icono from './Icono.svelte'

  let { limites, children, capa, alTocarFondo, cursor = '' } = $props()

  let svg
  let W = $state(0), H = $state(0)
  let k = $state(1), tx = $state(0), ty = $state(0)
  let ajustado = false
  const MIN = 0.15, MAX = 2.5
  const acotar = v => Math.min(MAX, Math.max(MIN, v))

  export function encuadrar() {
    if (!limites || !W || !H) return
    const pad = W < 600 ? 16 : 40
    const arriba = 64 // espacio para la barra flotante
    const nk = acotar(Math.min(1, (W - 2 * pad) / limites.w, (H - 2 * pad - arriba) / limites.h))
    k = nk
    tx = W / 2 - (limites.x + limites.w / 2) * nk
    ty = (H + arriba) / 2 - (limites.y + limites.h / 2) * nk
  }

  /** Punto del mundo que está en el centro de la vista. */
  export const centro = () => ({ x: (W / 2 - tx) / k, y: (H / 2 - ty) / k })

  $effect(() => {
    if (!ajustado && W && H && limites) { ajustado = true; encuadrar() }
  })

  function zoomEn(f, cx = W / 2, cy = H / 2) {
    const nk = acotar(k * f)
    tx = cx - ((cx - tx) * nk) / k
    ty = cy - ((cy - ty) * nk) / k
    k = nk
  }

  $effect(() => {
    const rueda = e => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      const escala = e.ctrlKey ? 0.01 : e.deltaMode ? 0.05 : 0.0015
      zoomEn(Math.exp(-e.deltaY * escala), e.clientX - r.left, e.clientY - r.top)
    }
    svg.addEventListener('wheel', rueda, { passive: false })
    return () => svg.removeEventListener('wheel', rueda)
  })

  // --- Fondo: desplazar con un dedo / ratón, pellizcar con dos ---
  const punteros = new Map()
  let gesto = null

  function medio() {
    const [a, b] = [...punteros.values()]
    const r = svg.getBoundingClientRect()
    return { cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }
  }

  function abajo(e) {
    if (e.button === 2) return
    svg.setPointerCapture(e.pointerId)
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (punteros.size === 1) gesto = { tipo: 'mover', x0: e.clientX, y0: e.clientY, tx, ty, movido: false }
    else if (punteros.size === 2) {
      const m = medio()
      gesto = { tipo: 'pellizco', d: m.d, k, wx: (m.cx - tx) / k, wy: (m.cy - ty) / k }
    }
  }

  function mover(e) {
    const p = punteros.get(e.pointerId)
    if (!p || !gesto) return
    p.x = e.clientX
    p.y = e.clientY
    if (gesto.tipo === 'pellizco' && punteros.size >= 2) {
      const m = medio()
      const nk = acotar((gesto.k * m.d) / gesto.d)
      k = nk
      tx = m.cx - gesto.wx * nk
      ty = m.cy - gesto.wy * nk
    } else if (gesto.tipo === 'mover') {
      const dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0
      if (!gesto.movido && Math.hypot(dx, dy) < 4) return
      gesto.movido = true
      tx = gesto.tx + dx
      ty = gesto.ty + dy
    }
  }

  function arriba(e) {
    if (!punteros.delete(e.pointerId)) return
    if (gesto?.tipo === 'mover' && !gesto.movido && e.type === 'pointerup') alTocarFondo?.()
    if (punteros.size === 1 && gesto?.tipo === 'pellizco') {
      const [p] = punteros.values()
      gesto = { tipo: 'mover', x0: p.x, y0: p.y, tx, ty, movido: true }
    } else if (!punteros.size) gesto = null
  }

  // --- Arrastre de nodos (lo usan los hijos vía contexto) ---
  function arrastrar(e, { inicio, mover: alMover, fin } = {}) {
    if (e.button === 2) return
    e.stopPropagation()
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY
    let movido = false
    const mv = ev => {
      if (ev.pointerId !== id) return
      if (!movido) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return
        movido = true
        inicio?.()
      }
      alMover?.((ev.clientX - x0) / k, (ev.clientY - y0) / k)
    }
    const up = ev => {
      if (ev.pointerId !== id) return
      removeEventListener('pointermove', mv)
      removeEventListener('pointerup', up)
      removeEventListener('pointercancel', up)
      fin?.(movido, ev.type === 'pointercancel')
    }
    addEventListener('pointermove', mv)
    addEventListener('pointerup', up)
    addEventListener('pointercancel', up)
  }

  setContext('lienzo', { arrastrar })
</script>

<div
  class="lienzo {cursor}"
  bind:clientWidth={W}
  bind:clientHeight={H}
  style="background-size:{22 * k}px {22 * k}px;background-position:{tx}px {ty}px"
>
  <svg
    bind:this={svg}
    role="application"
    aria-label="Lienzo de fuentes"
    onpointerdown={abajo}
    onpointermove={mover}
    onpointerup={arriba}
    onpointercancel={arriba}
  >
    <g transform="translate({tx} {ty}) scale({k})">{@render children()}</g>
  </svg>

  {@render capa?.()}

  <div class="zoom">
    <button class="icono-btn chico" aria-label="Alejar" onclick={() => zoomEn(1 / 1.25)}><Icono nombre="menos" tam={14} trazo={2} /></button>
    <button class="porc" aria-label="Encuadrar todo" title="Encuadrar todo" onclick={encuadrar}>{Math.round(k * 100)}%</button>
    <button class="icono-btn chico" aria-label="Acercar" onclick={() => zoomEn(1.25)}><Icono nombre="mas" tam={14} trazo={2} /></button>
  </div>
</div>

<style>
  .lienzo {
    flex-grow: 1; position: relative; overflow: hidden; min-width: 0;
    background-color: var(--paper);
    background-image: radial-gradient(circle, var(--line) 1px, transparent 1px);
  }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
  svg:active { cursor: grabbing; }
  .conectando svg { cursor: crosshair; }
  .zoom {
    position: absolute; bottom: calc(16px + env(safe-area-inset-bottom)); right: 16px; display: flex; align-items: center; gap: 2px;
    background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 4px;
    box-shadow: 0 2px 8px rgba(33, 31, 26, .08);
  }
  .chico { width: 28px; height: 28px; }
  .porc { font-size: 12px; color: var(--ink-soft); width: 44px; text-align: center; border: none; background: none; padding: 0; }
</style>
