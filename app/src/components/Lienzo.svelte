<script>
  // Lienzo SVG con desplazamiento, zoom (rueda / pellizco) y arrastre de nodos. Sin librerías.
  // Rendimiento: el contenido vive en una capa que se mueve con transform de CSS (la GPU la compone
  // sin volver a dibujar el SVG) y todos los movimientos se aplican una sola vez por cuadro.
  import { setContext } from 'svelte'
  import Icono from './Icono.svelte'

  let { limites, children, capa, alTocarFondo, cursor = '', corcho = false, simple = $bindable(false), ventana = $bindable(null), pesado = false } = $props()
  // Nivel de detalle: lejos (texto ilegible) las tarjetas se dibujan simplificadas. Con histéresis
  // para no alternar al cruzar el umbral. Los hijos lo leen del contexto (vista.simple).
  const vista = $state({ simple: false })

  let cont, capaEl
  let W = $state(0), H = $state(0)
  let k = 1, tx = 0, ty = 0
  let porc = $state(100)
  let ajustado = false
  const MIN = 0.08, MAX = 2.5
  const acotar = v => Math.min(MAX, Math.max(MIN, v))

  // --- Aplicar la vista (una vez por cuadro) ---
  let raf = 0, zoomReciente = false, tQuieto
  function aplicar() {
    raf = 0
    if (!capaEl) return
    capaEl.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${k})`
    cont.style.backgroundSize = `${22 * k}px ${22 * k}px`
    cont.style.backgroundPosition = `${tx}px ${ty}px`
    porc = Math.round(k * 100)
    // Solo con muchos elementos a la vista (pesado): con pocos, el texto se dibuja siempre.
    const s = pesado && (vista.simple ? k < 0.65 : k < 0.55)
    if (s !== vista.simple) simple = vista.simple = s
    actualizarVentana()
  }

  // --- Ventana de dibujo: solo se dibuja lo que está cerca de la vista ---
  // Es la vista con un margen amplio, en pasos de 250; cambia solo cuando la vista sale de ella
  // (o al acercarse mucho), así que casi nunca obliga a redibujar mientras se desplaza.
  function actualizarVentana() {
    if (!W || !H) return
    const vis = { x: -tx / k, y: -ty / k, w: W / k, h: H / k }
    const v = ventana
    const cubre = v && vis.x >= v.x && vis.y >= v.y && vis.x + vis.w <= v.x + v.w && vis.y + vis.h <= v.y + v.h
    if (cubre && v.w * v.h < vis.w * vis.h * 12) return
    const m = Math.max(vis.w, vis.h) * 0.8, P = 250
    const x = Math.floor((vis.x - m) / P) * P, y = Math.floor((vis.y - m) / P) * P
    ventana = { x, y, w: Math.ceil((vis.x + vis.w + m) / P) * P - x, h: Math.ceil((vis.y + vis.h + m) / P) * P - y }
  }
  $effect(() => { W; H; pesado; programar() })
  /** Programa la vista; durante el gesto la capa queda en la GPU y al terminar se redibuja nítida. */
  function programar(esZoom = false) {
    if (capaEl && capaEl.style.willChange !== 'transform') capaEl.style.willChange = 'transform'
    zoomReciente ||= esZoom
    clearTimeout(tQuieto)
    tQuieto = setTimeout(() => {
      // Tras un zoom, la capa se vuelve a rasterizar a la escala nueva (texto nítido) y enseguida
      // vuelve a la GPU, para que desplazar y arrastrar sigan sin redibujar todo.
      if (zoomReciente && capaEl) {
        capaEl.style.willChange = 'auto'
        requestAnimationFrame(() => requestAnimationFrame(() => capaEl && (capaEl.style.willChange = 'transform')))
      }
      zoomReciente = false
    }, 220)
    if (!raf) raf = requestAnimationFrame(aplicar)
  }

  // --- Tamaño del SVG: la ventana de dibujo (la vista con margen). Así la capa en la GPU mide
  // siempre unas pocas pantallas, por grande que sea el tablero o el zoom. Antes de conocer la
  // vista, los límites con margen.
  const caja = $derived.by(() => {
    if (ventana) return ventana
    const l = limites || { x: -500, y: -500, w: 1000, h: 1000 }
    const M = 1600, P = 1000
    const x = Math.floor((l.x - M) / P) * P, y = Math.floor((l.y - M) / P) * P
    return { x, y, w: Math.ceil((l.x + l.w + M) / P) * P - x, h: Math.ceil((l.y + l.h + M) / P) * P - y }
  })

  export function encuadrar() {
    if (!limites || !W || !H) return
    const pad = W < 600 ? 16 : 40
    const arriba = 64 // espacio para la barra flotante
    const nk = acotar(Math.min(1, (W - 2 * pad) / limites.w, (H - 2 * pad - arriba) / limites.h))
    k = nk
    tx = W / 2 - (limites.x + limites.w / 2) * nk
    ty = (H + arriba) / 2 - (limites.y + limites.h / 2) * nk
    programar(true)
  }

  /** Punto del mundo que está en el centro de la vista. */
  export const centro = () => ({ x: (W / 2 - tx) / k, y: (H / 2 - ty) / k })

  /** Convierte un punto de la pantalla (clientX/Y) a coordenadas del mundo. */
  export function aMundo(cx, cy) {
    const r = cont.getBoundingClientRect()
    return { x: (cx - r.left - tx) / k, y: (cy - r.top - ty) / k }
  }

  $effect(() => {
    if (!ajustado && W && H && limites) { ajustado = true; encuadrar() }
  })

  function zoomEn(f, cx = W / 2, cy = H / 2) {
    const nk = acotar(k * f)
    tx = cx - ((cx - tx) * nk) / k
    ty = cy - ((cy - ty) * nk) / k
    k = nk
    programar(true)
  }

  // Trackpad: deslizar con dos dedos desplaza; pellizcar hace zoom (el navegador lo envía
  // como rueda con ctrlKey). Con ratón: la rueda desplaza y Ctrl + rueda hace zoom.
  $effect(() => {
    const rueda = e => {
      if (e.target.closest?.('.zoom')) return
      e.preventDefault()
      const r = cont.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        zoomEn(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientX - r.left, e.clientY - r.top)
        return
      }
      const f = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1
      tx -= e.deltaX * f
      ty -= e.deltaY * f
      programar()
    }
    // Safari (macOS) envía el pellizco del trackpad como gesture* en lugar de rueda con ctrlKey.
    let escala0 = 1
    const gestoInicio = e => { e.preventDefault(); escala0 = 1 }
    const gestoCambio = e => {
      e.preventDefault()
      const r = cont.getBoundingClientRect()
      zoomEn(e.scale / escala0, e.clientX - r.left, e.clientY - r.top)
      escala0 = e.scale
    }
    cont.addEventListener('wheel', rueda, { passive: false })
    cont.addEventListener('gesturestart', gestoInicio)
    cont.addEventListener('gesturechange', gestoCambio)
    return () => {
      cont.removeEventListener('wheel', rueda)
      cont.removeEventListener('gesturestart', gestoInicio)
      cont.removeEventListener('gesturechange', gestoCambio)
      cancelAnimationFrame(raf)
      clearTimeout(tQuieto)
    }
  })

  // --- Fondo: desplazar con un dedo / ratón, pellizcar con dos ---
  const punteros = new Map()
  let gesto = null

  function medio() {
    const [a, b] = [...punteros.values()]
    const r = cont.getBoundingClientRect()
    return { cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }
  }

  function abajo(e) {
    if (e.button === 2 || e.target.closest?.('.zoom, button, a, input, textarea')) return
    cont.setPointerCapture(e.pointerId)
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
      programar(true)
    } else if (gesto.tipo === 'mover') {
      const dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0
      if (!gesto.movido && Math.hypot(dx, dy) < 4) return
      gesto.movido = true
      tx = gesto.tx + dx
      ty = gesto.ty + dy
      programar()
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

  // --- Arrastre de nodos (lo usan los hijos vía contexto): un movimiento por cuadro ---
  function arrastrar(e, { inicio, mover: alMover, fin } = {}) {
    if (e.button === 2) return
    e.stopPropagation()
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY
    let movido = false, pendiente = null, cuadro = 0
    const aplicarMov = () => {
      cuadro = 0
      if (pendiente) { alMover?.(pendiente.dx, pendiente.dy); pendiente = null }
    }
    const mv = ev => {
      if (ev.pointerId !== id) return
      if (!movido) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return
        movido = true
        inicio?.()
      }
      pendiente = { dx: (ev.clientX - x0) / k, dy: (ev.clientY - y0) / k }
      if (!cuadro) cuadro = requestAnimationFrame(aplicarMov)
    }
    const up = ev => {
      if (ev.pointerId !== id) return
      removeEventListener('pointermove', mv)
      removeEventListener('pointerup', up)
      removeEventListener('pointercancel', up)
      cancelAnimationFrame(cuadro)
      aplicarMov()
      fin?.(movido, ev.type === 'pointercancel')
    }
    addEventListener('pointermove', mv)
    addEventListener('pointerup', up)
    addEventListener('pointercancel', up)
  }

  setContext('lienzo', { arrastrar, vista })
</script>

<div
  class="lienzo {cursor}"
  class:corcho
  bind:this={cont}
  bind:clientWidth={W}
  bind:clientHeight={H}
  role="application"
  aria-label="Lienzo de fuentes"
  onpointerdown={abajo}
  onpointermove={mover}
  onpointerup={arriba}
  onpointercancel={arriba}
>
  <div class="capa" bind:this={capaEl}>
    <svg style="left:{caja.x}px;top:{caja.y}px;width:{caja.w}px;height:{caja.h}px" viewBox="{caja.x} {caja.y} {caja.w} {caja.h}">
      {@render children()}
    </svg>
  </div>

  {@render capa?.()}

  <div class="zoom">
    <button class="icono-btn chico" aria-label="Alejar" onclick={() => zoomEn(1 / 1.25)}><Icono nombre="menos" tam={14} trazo={2} /></button>
    <button class="porc" aria-label="Encuadrar todo" title="Encuadrar todo" onclick={encuadrar}>{porc}%</button>
    <button class="icono-btn chico" aria-label="Acercar" onclick={() => zoomEn(1.25)}><Icono nombre="mas" tam={14} trazo={2} /></button>
  </div>
</div>

<style>
  .lienzo {
    flex-grow: 1; position: relative; overflow: hidden; min-width: 0;
    background-color: var(--paper);
    background-image: radial-gradient(circle, var(--line) 1px, transparent 1px);
    touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab;
    contain: strict;
  }
  .lienzo:active { cursor: grabbing; }
  .corcho { background-color: #C8A078; background-image: radial-gradient(circle, rgba(92, 58, 26, .38) 1.1px, transparent 1.4px); }
  .conectando { cursor: crosshair; }
  .capa { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  svg { position: absolute; overflow: visible; }
  .zoom {
    position: absolute; bottom: 16px; right: 16px; display: flex; align-items: center; gap: 2px;
    background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 4px;
    box-shadow: 0 2px 8px rgba(33, 31, 26, .08); cursor: default;
  }
  .chico { width: 28px; height: 28px; }
  .porc { font-size: 12px; color: var(--ink-soft); width: 44px; text-align: center; border: none; background: none; padding: 0; }
</style>
