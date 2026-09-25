<script>
  // Lector de PDF propio y fluido: PDFium dibuja en un hilo aparte (pdf.worker.js) y aquí solo se
  // muestran imágenes ya listas. Solo existen en pantalla las páginas cercanas a la vista; al
  // desplazarse rápido se ven versiones livianas y, al detenerse, las nítidas. El texto va en una
  // capa SVG invisible encima (seleccionar, copiar, "Nota con la cita") y la búsqueda se resalta.
  import { onDestroy, untrack } from 'svelte'
  import Icono from './Icono.svelte'
  import { V } from '../lib/visor.svelte.js'

  let { blob, onseleccion, onrecorte, marcas = [], destino = null } = $props()

  const HUECO = 12, MARGEN = 12
  let cont = $state()
  let W = $state(0), H = $state(0)
  let tamanos = $state([]) // [{ w, h }] en puntos
  let escala = $state(1) // px de pantalla por punto
  let scrollTop = $state(0)
  let error = $state('')
  let cargando = $state(true)
  let version = $state(0) // cambia cuando llega un bitmap: redibuja los lienzos visibles
  const docId = Math.random()

  // --- Hilo de PDFium ---
  const worker = new Worker(new URL('../lib/pdf.worker.js', import.meta.url), { type: 'module' })
  const bajas = new Map(), altas = new Map() // n → { bitmap, escala }
  let textos = $state.raw({}) // n → segmentos (sin reactividad profunda: son muchos objetos)
  const LIM_ALTAS = 10, LIM_BAJAS = 240
  const guardarEn = (mapa, n, v, lim) => {
    const prev = mapa.get(n)
    if (prev && prev.bitmap !== v.bitmap) prev.bitmap.close()
    mapa.delete(n)
    mapa.set(n, v)
    while (mapa.size > lim) { const [k, x] = mapa.entries().next().value; x.bitmap.close(); mapa.delete(k) }
  }

  worker.onmessage = ({ data: m }) => {
    if (m.doc !== undefined && m.doc !== docId) return m.bitmap?.close()
    if (m.tipo === 'abierto') {
      tamanos = m.paginas
      cargando = false
      // Primero se ajusta al ancho; recién después (listo) se puede ir a un vínculo.
      requestAnimationFrame(() => { ajustarAncho(); requestAnimationFrame(() => requestAnimationFrame(() => (listo = true))) })
    } else if (m.tipo === 'pagina') {
      guardarEn(m.nivel === 'alta' ? altas : bajas, m.n, { bitmap: m.bitmap, escala: m.escala }, m.nivel === 'alta' ? LIM_ALTAS : LIM_BAJAS)
      version++
    } else if (m.tipo === 'texto') {
      textos = { ...textos, [m.n]: m.segs }
    } else if (m.tipo === 'busqueda') {
      resultados = m.res.flatMap(p => p.coincidencias.map(rects => ({ n: p.n, rects })))
      actual = resultados.length ? 0 : -1
      buscando = false
      buscado = m.q
      if (resultados.length) irAResultado(0)
    } else if (m.tipo === 'recorte') {
      const r = new FileReader()
      r.onload = () => onrecorte?.({ imagen: r.result, proporcion: Math.round((m.w / m.h) * 1000) / 1000, texto: m.texto, pagina: m.n + 1, rect: m.rect })
      r.readAsDataURL(m.blob)
    } else if (m.tipo === 'error') {
      if (cargando) { error = m.mensaje; cargando = false }
    }
  }
  untrack(() => blob).arrayBuffer().then(buffer => worker.postMessage({ tipo: 'abrir', doc: docId, buffer }, [buffer]))
  onDestroy(() => {
    worker.terminate()
    for (const m of [bajas, altas]) for (const x of m.values()) x.bitmap.close()
  })

  // --- Disposición: páginas centradas una debajo de otra ---
  const tops = $derived.by(() => {
    let y = MARGEN
    return tamanos.map(t => { const top = y; y += t.h * escala + HUECO; return top })
  })
  const alto = $derived(tamanos.length ? tops.at(-1) + tamanos.at(-1).h * escala + MARGEN : 0)
  const anchoMax = $derived(Math.max(0, ...tamanos.map(t => t.w)) * escala)
  const ancho = $derived(Math.max(W, anchoMax + 2 * MARGEN))

  /** Primera página cuya parte inferior pasa de y (búsqueda binaria). */
  function paginaEn(y) {
    let lo = 0, hi = tamanos.length - 1
    while (lo < hi) { const m = (lo + hi) >> 1; if (tops[m] + tamanos[m].h * escala < y) lo = m + 1; else hi = m }
    return lo
  }
  const rango = $derived.by(() => {
    if (!tamanos.length) return [0, -1]
    return [paginaEn(scrollTop - H), paginaEn(scrollTop + 2 * H)] // una pantalla de margen
  })
  const vista = $derived.by(() => {
    if (!tamanos.length) return [0, -1]
    return [paginaEn(scrollTop), paginaEn(scrollTop + H)]
  })
  const visibles = $derived.by(() => { const l = []; for (let n = rango[0]; n <= rango[1]; n++) l.push(n); return l })
  const actualPag = $derived(tamanos.length ? paginaEn(scrollTop + H / 3) + 1 : 0)

  // --- Pedidos al hilo: livianas al instante, nítidas al detenerse ---
  const dpr = () => Math.min(2, window.devicePixelRatio || 1)
  const ESCALA_BAJA = 0.4
  let tQuieto
  $effect(() => {
    const [a, b] = rango, [va, vb] = vista
    if (b < a) return
    const centro = (va + vb) / 2, pedir = []
    for (let n = a; n <= b; n++) if (!bajas.has(n)) pedir.push({ n, nivel: 'baja', escala: ESCALA_BAJA, prioridad: Math.abs(n - centro) })
    worker.postMessage({ tipo: 'descartar', conservar: visibles })
    if (pedir.length) worker.postMessage({ tipo: 'pedir', doc: docId, paginas: pedir })
    clearTimeout(tQuieto)
    const e = escala
    tQuieto = setTimeout(() => {
      const nitidas = []
      for (let n = va; n <= vb; n++) {
        const alta = altas.get(n), objetivo = e * dpr()
        if (!alta || Math.abs(alta.escala - objetivo) > 0.01) nitidas.push({ n, nivel: 'alta', escala: objetivo, prioridad: -100 + Math.abs(n - centro) })
        if (!textos[n]) worker.postMessage({ tipo: 'texto', doc: docId, n })
      }
      if (nitidas.length) worker.postMessage({ tipo: 'pedir', doc: docId, paginas: nitidas })
    }, 140)
  })

  /** Dibuja en el lienzo de la página la mejor imagen disponible (la nítida si hay). */
  function pintar(canvas, n) {
    const x = altas.get(n) || bajas.get(n)
    if (!x || canvas.dataset.bmp === String(x.bitmap.width) + ':' + x.escala) return
    canvas.width = x.bitmap.width
    canvas.height = x.bitmap.height
    canvas.getContext('2d').drawImage(x.bitmap, 0, 0)
    canvas.dataset.bmp = String(x.bitmap.width) + ':' + x.escala
  }
  function lienzo(canvas, n) {
    $effect(() => { version; pintar(canvas, n) })
  }

  // --- Desplazamiento y zoom ---
  let raf = 0
  function alDesplazar() {
    if (raf) return
    raf = requestAnimationFrame(() => { raf = 0; scrollTop = cont.scrollTop })
  }

  function ajustarAncho() {
    if (!tamanos.length || !cont) return
    fijarEscala((cont.clientWidth - 2 * MARGEN - 8) / Math.max(...tamanos.map(t => t.w)), 0)
  }

  /** Cambia el zoom manteniendo fijo el punto del documento que está en `ancla` (px desde arriba). */
  // Durante el zoom se oculta la capa de texto (recalcular cientos de textos por cuadro es lo caro).
  let enZoom = $state(false), tZoom
  function fijarEscala(nueva, ancla = H / 2) {
    nueva = Math.min(6, Math.max(0.15, nueva))
    enZoom = true
    clearTimeout(tZoom)
    tZoom = setTimeout(() => (enZoom = false), 220)
    const n = paginaEn(cont.scrollTop + ancla)
    const dentro = tamanos.length ? (cont.scrollTop + ancla - tops[n]) / escala : 0
    const x = (cont.scrollLeft + W / 2) / Math.max(1, ancho)
    escala = nueva
    requestAnimationFrame(() => {
      if (!tamanos.length) return
      cont.scrollTop = tops[n] + dentro * nueva - ancla
      cont.scrollLeft = x * ancho - W / 2
      scrollTop = cont.scrollTop
    })
  }
  const zoom = f => fijarEscala(escala * f)

  $effect(() => {
    const rueda = e => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = cont.getBoundingClientRect()
      fijarEscala(escala * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientY - r.top)
    }
    cont.addEventListener('wheel', rueda, { passive: false })
    return () => cont.removeEventListener('wheel', rueda)
  })

  // Pellizco con dos dedos (celular).
  const dedos = new Map()
  let pellizco = null
  function dedoAbajo(e) {
    if (e.pointerType !== 'touch') return
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (dedos.size === 2) { const [a, b] = [...dedos.values()]; pellizco = { d: Math.hypot(a.x - b.x, a.y - b.y), e: escala, y: (a.y + b.y) / 2 - cont.getBoundingClientRect().top } }
  }
  function dedoMueve(e) {
    if (!dedos.has(e.pointerId)) return
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pellizco && dedos.size === 2) {
      const [a, b] = [...dedos.values()]
      fijarEscala(pellizco.e * Math.hypot(a.x - b.x, a.y - b.y) / pellizco.d, pellizco.y)
    }
  }
  function dedoArriba(e) { dedos.delete(e.pointerId); if (dedos.size < 2) pellizco = null }

  function irAPagina(n) {
    n = Math.min(tamanos.length, Math.max(1, n)) - 1
    cont.scrollTop = tops[n] - MARGEN
  }

  // --- Búsqueda ---
  let q = $state('')
  let resultados = $state([])
  let actual = $state(-1)
  let buscando = $state(false)
  let buscado = $state('')
  function buscar(e) {
    e?.preventDefault()
    if (!q.trim()) { resultados = []; actual = -1; return }
    buscando = true
    worker.postMessage({ tipo: 'buscar', doc: docId, q })
  }
  function irAResultado(i) {
    if (!resultados.length) return
    actual = (i + resultados.length) % resultados.length
    const r = resultados[actual], y = r.rects[0]?.y || 0
    cont.scrollTop = tops[r.n] + y * escala - H / 3
  }
  const resaltes = $derived.by(() => {
    const m = {}
    resultados.forEach((r, i) => (m[r.n] ||= []).push(...r.rects.map(x => ({ ...x, actual: i === actual }))))
    return m
  })

  // --- Vínculos: marcas de las citas tomadas de este documento e ir a una de ellas ---
  /** Rectángulos (en puntos, por página) de la selección actual; los de una misma línea se unen. */
  function rectsDeSeleccion(s) {
    const paginas = [...cont.querySelectorAll('.pag-pdf')].map(p => ({ n: +p.dataset.n, b: p.getBoundingClientRect() }))
    const sueltos = []
    for (let i = 0; i < s.rangeCount; i++) for (const r of s.getRangeAt(i).getClientRects()) {
      if (r.width < 1 || r.height < 1) continue
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      const p = paginas.find(({ b }) => cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom)
      if (p) sueltos.push({ n: p.n, x: (r.left - p.b.left) / escala, y: (r.top - p.b.top) / escala, w: r.width / escala, h: r.height / escala })
    }
    const unidos = []
    for (const r of sueltos.sort((a, b) => a.n - b.n || a.y - b.y || a.x - b.x)) {
      const u = unidos.at(-1)
      if (u && u.n === r.n && Math.abs(u.y - r.y) < r.h * 0.5 && r.x <= u.x + u.w + 6) {
        const fin = Math.max(u.x + u.w, r.x + r.w)
        u.y = Math.min(u.y, r.y); u.h = Math.max(u.h, r.h); u.w = fin - u.x
      } else unidos.push({ ...r })
    }
    const r1 = v => Math.round(v * 10) / 10
    return unidos.map(r => ({ n: r.n, x: r1(r.x), y: r1(r.y), w: r1(r.w), h: r1(r.h) }))
  }

  let destelloHasta = $state(0)
  let listo = $state(false)
  const marcasPorPagina = $derived.by(() => {
    const m = {}, activa = destelloHasta > 0 && destino
    const todas = destino && !marcas.some(x => x.id === destino.tarjeta) ? [...marcas, { ...destino, id: 'destino' }] : marcas
    for (const mk of todas) for (const r of mk.rects || [])
      (m[r.n] ||= []).push({ ...r, area: !!mk.area, titulo: mk.titulo || '', activa: !!activa && (mk.id === destino.tarjeta || mk.id === 'destino') })
    return m
  })

  /** Lleva la vista a la cita (su primer rectángulo, o su página) y la hace parpadear. */
  function irADestino(d) {
    const r = d.rects?.[0]
    if (r && tops[r.n] !== undefined) {
      cont.scrollTop = tops[r.n] + r.y * escala - H / 3
      cont.scrollLeft = Math.max(0, (ancho - tamanos[r.n].w * escala) / 2 + r.x * escala - W / 3)
    } else if (d.pagina) irAPagina(+d.pagina)
    scrollTop = cont.scrollTop
    destelloHasta = Date.now() + 3000
    setTimeout(() => { if (Date.now() >= destelloHasta) destelloHasta = 0 }, 3100)
  }
  $effect(() => {
    const d = destino
    if (d && listo) untrack(() => requestAnimationFrame(() => irADestino(d)))
  })

  // --- Selección de texto → nota (con la página donde empieza la selección) ---
  $effect(() => {
    const cambio = () => {
      const s = document.getSelection()
      const dentro = s?.rangeCount && cont?.contains(s.anchorNode)
      const nodo = dentro && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement)
      const pagina = nodo?.closest?.('.pag-pdf')?.dataset.n
      onseleccion?.(dentro ? s.toString().replace(/\s+/g, ' ').trim() : '', pagina ? +pagina + 1 : null, dentro ? rectsDeSeleccion(s) : null)
    }
    document.addEventListener('selectionchange', cambio)
    return () => document.removeEventListener('selectionchange', cambio)
  })

  // --- Recortar un área (gráfico, tabla, página escaneada) → tarjeta de imagen en el lienzo ---
  let marco = $state(null) // { n, x0, y0, x1, y1 } en px dentro de la página
  function recorteAbajo(e, n) {
    if (!V.recortando || e.button === 2) return
    e.preventDefault()
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    marco = { n, r, x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top }
  }
  function recorteMueve(e) {
    if (!marco) return
    marco.x1 = Math.min(marco.r.width, Math.max(0, e.clientX - marco.r.left))
    marco.y1 = Math.min(marco.r.height, Math.max(0, e.clientY - marco.r.top))
  }
  function recorteArriba() {
    if (!marco) return
    const { n, x0, y0, x1, y1 } = marco
    marco = null
    const rect = { x: Math.min(x0, x1) / escala, y: Math.min(y0, y1) / escala, w: Math.abs(x1 - x0) / escala, h: Math.abs(y1 - y0) / escala }
    if (rect.w < 8 || rect.h < 8) return // un clic sin arrastrar no recorta
    V.recortando = false
    worker.postMessage({ tipo: 'recorte', doc: docId, n, rect })
  }
  const cajaMarco = $derived(marco && { x: Math.min(marco.x0, marco.x1), y: Math.min(marco.y0, marco.y1), w: Math.abs(marco.x1 - marco.x0), h: Math.abs(marco.y1 - marco.y0) })

  function teclas(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); document.getElementById('pdf-buscar')?.focus() }
  }
</script>

<svelte:window onkeydown={teclas} />

<div class="marco">
<div class="barra-pdf">
  <form class="buscar" onsubmit={buscar}>
    <Icono nombre="buscar" tam={14} />
    <input id="pdf-buscar" type="search" bind:value={q} placeholder="Buscar en el PDF" aria-label="Buscar en el PDF" />
    {#if buscando}<span class="suave">…</span>
    {:else if resultados.length}
      <span class="suave cuenta">{actual + 1}/{resultados.length}</span>
      <button type="button" class="icono-btn mini" aria-label="Anterior" onclick={() => irAResultado(actual - 1)}>↑</button>
      <button type="button" class="icono-btn mini" aria-label="Siguiente" onclick={() => irAResultado(actual + 1)}>↓</button>
    {:else if buscado && buscado === q}<span class="suave cuenta">sin resultados</span>{/if}
  </form>
  <span class="pag">
    <input type="number" min="1" max={tamanos.length} value={actualPag} aria-label="Página" onchange={e => irAPagina(+e.currentTarget.value)} />
    / {tamanos.length}
  </span>
  <button class="btn chico" class:activo={V.recortando} aria-pressed={V.recortando} onclick={() => (V.recortando = !V.recortando)}
    title="Recortar un área (gráfico, tabla o texto escaneado) y citarla en el lienzo">
    <Icono nombre="recorte" tam={14} />{V.recortando ? 'Arrastra sobre la página…' : 'Recortar'}
  </button>
  <span class="zoom-pdf">
    <button class="icono-btn mini" aria-label="Alejar" onclick={() => zoom(1 / 1.2)}>−</button>
    <button class="porc" title="Ajustar al ancho" onclick={ajustarAncho}>{Math.round(escala * 100)}%</button>
    <button class="icono-btn mini" aria-label="Acercar" onclick={() => zoom(1.2)}>+</button>
  </span>
</div>

<div class="pdf" class:recortando={V.recortando} bind:this={cont} bind:clientWidth={W} bind:clientHeight={H} onscroll={alDesplazar}
  onpointerdown={dedoAbajo} onpointermove={dedoMueve} onpointerup={dedoArriba} onpointercancel={dedoArriba} role="document">
  {#if cargando}<p class="estado">Abriendo PDF…</p>{/if}
  {#if error}<p class="estado error">{error}</p>{/if}
  <div class="lamina" style="height:{alto}px;width:{ancho}px">
    {#each visibles as n (n)}
      {@const t = tamanos[n]}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="pag-pdf" data-n={n} style="top:{tops[n]}px;left:{(ancho - t.w * escala) / 2}px;width:{t.w * escala}px;height:{t.h * escala}px" aria-label="Página {n + 1}"
        onpointerdown={e => recorteAbajo(e, n)} onpointermove={recorteMueve} onpointerup={recorteArriba} onpointercancel={() => (marco = null)}>
        <canvas use:lienzo={n}></canvas>
        {#if cajaMarco && marco.n === n}<div class="marco-recorte" style="left:{cajaMarco.x}px;top:{cajaMarco.y}px;width:{cajaMarco.w}px;height:{cajaMarco.h}px"></div>{/if}
        {#if marcasPorPagina[n]?.length}
          <svg class="capa-marcas" viewBox="0 0 {t.w} {t.h}" preserveAspectRatio="none" aria-hidden="true">
            {#each marcasPorPagina[n] as r}
              <rect x={r.x - 1} y={r.y - 1} width={r.w + 2} height={r.h + 2} rx="1.5" class:area={r.area} class:texto={!r.area} class:destello={r.activa}><title>{r.titulo}</title></rect>
            {/each}
          </svg>
        {/if}
        {#if (textos[n] || resaltes[n]) && !enZoom}
          <svg class="capa-texto" viewBox="0 0 {t.w} {t.h}" preserveAspectRatio="none">
            {#each resaltes[n] || [] as r}<rect x={r.x} y={r.y} width={r.w} height={r.h} class="resalte" class:actual={r.actual} />{/each}
            {#each textos[n] || [] as s}<text x={s.x} y={s.y + s.h * 0.82} font-size={s.h} textLength={s.w} lengthAdjust="spacingAndGlyphs">{s.t} </text>{/each}
          </svg>
        {/if}
      </div>
    {/each}
  </div>
</div>
</div>

<style>
  .marco { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .barra-pdf { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid var(--line); background: var(--paper); font-size: 12.5px; flex-wrap: wrap; }
  .buscar { display: flex; align-items: center; gap: 4px; flex: 1 1 180px; min-width: 0; color: var(--ink-soft); }
  .buscar input { flex: 1; min-width: 0; padding: 4px 8px; font-size: 12.5px; }
  .cuenta { white-space: nowrap; }
  .mini { width: 26px; height: 26px; font-size: 15px; }
  .pag { display: flex; align-items: center; gap: 4px; white-space: nowrap; color: var(--ink-soft); }
  .pag input { width: 52px; padding: 3px 6px; font-size: 12.5px; text-align: right; }
  .zoom-pdf { display: flex; align-items: center; gap: 2px; }
  .porc { border: none; background: none; font-size: 12px; color: var(--ink-soft); width: 46px; padding: 0; }
  .pdf { position: relative; flex: 1; min-height: 0; overflow: auto; background: #57534b; touch-action: pan-x pan-y; overscroll-behavior: contain; }
  .lamina { position: relative; }
  .pag-pdf { position: absolute; background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, .35); contain: strict; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .capa-texto { position: absolute; inset: 0; width: 100%; height: 100%; }
  .capa-texto text { fill: transparent; font-family: sans-serif; white-space: pre; cursor: text; }
  .recortando .pag-pdf { cursor: crosshair; touch-action: none; }
  .recortando .capa-texto { pointer-events: none; }
  .marco-recorte { position: absolute; border: 2px dashed #C0392B; background: rgba(192, 57, 43, .12); pointer-events: none; }
  .btn.activo { background: var(--accent); color: var(--paper); border-color: var(--accent); }
  .barra-pdf .btn { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .capa-texto text::selection { fill: transparent; background: rgba(46, 75, 94, .35); }
  .resalte { fill: rgba(242, 194, 48, .45); }
  .resalte.actual { fill: rgba(235, 104, 52, .55); }
  /* Citas ya tomadas de este documento: texto resaltado, recortes en cuadro punteado. */
  .capa-marcas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .capa-marcas .texto { fill: rgba(242, 194, 48, .38); }
  .capa-marcas .area { fill: rgba(47, 79, 181, .06); stroke: #2F4FB5; stroke-width: 1.4; stroke-dasharray: 5 3; vector-effect: non-scaling-stroke; }
  .capa-marcas .destello { animation: destello 0.7s ease-in-out 4; }
  .capa-marcas .texto.destello { fill: rgba(235, 104, 52, .5); }
  .capa-marcas .area.destello { stroke: #C0392B; stroke-width: 2.5; }
  @keyframes destello { 50% { opacity: .25; } }
  .estado { color: #fff; margin: 24px; position: absolute; }
  .error { color: #ffd6cf; }
</style>
