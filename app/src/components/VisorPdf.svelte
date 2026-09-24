<script>
  // Lector de PDF con pdf.js para navegadores sin visor de PDF integrado (Android, algunos iOS).
  // pdf.js se descarga solo al abrir el primer PDF; cada página se dibuja al acercarse a la vista.
  import { onDestroy } from 'svelte'

  let { blob } = $props()
  let cont = $state()
  let paginas = $state([]) // [{ n, w, h }] a escala 1
  let escala = $state(1)
  let error = $state('')
  let cargando = $state(true)
  let doc = null
  const dibujadas = new Map() // n → escala con la que se dibujó
  let observador

  async function cargar() {
    try {
      const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
      const l = []
      for (let n = 1; n <= doc.numPages; n++) {
        const v = (await doc.getPage(n)).getViewport({ scale: 1 })
        l.push({ n, w: v.width, h: v.height })
      }
      paginas = l
      escala = Math.min(2, (cont.clientWidth - 24) / Math.max(...l.map(p => p.w)))
    } catch (e) {
      error = 'No se pudo abrir el PDF: ' + (e?.message || e)
    } finally { cargando = false }
  }
  cargar()

  async function dibujar(canvas) {
    const n = +canvas.dataset.n
    if (!doc || dibujadas.get(n) === escala) return
    dibujadas.set(n, escala)
    const pagina = await doc.getPage(n)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const v = pagina.getViewport({ scale: escala * dpr })
    canvas.width = v.width
    canvas.height = v.height
    await pagina.render({ canvas, viewport: v }).promise.catch(() => dibujadas.delete(n))
  }

  function observar(canvas) {
    observador ||= new IntersectionObserver(es => es.forEach(e => e.isIntersecting && dibujar(e.target)), { root: cont, rootMargin: '600px 0px' })
    observador.observe(canvas)
    return { destroy: () => observador?.unobserve(canvas) }
  }

  // Al cambiar el zoom, se redibujan las páginas visibles.
  $effect(() => {
    escala
    if (!observador) return
    for (const c of cont.querySelectorAll('canvas')) { observador.unobserve(c); observador.observe(c) }
  })

  const zoom = f => (escala = Math.min(4, Math.max(0.3, escala * f)))
  onDestroy(() => { observador?.disconnect(); doc?.destroy() })
</script>

<div class="pdf" bind:this={cont}>
  {#if cargando}<p class="suave estado">Abriendo PDF…</p>{/if}
  {#if error}<p class="estado error">{error}</p>{/if}
  {#each paginas as p (p.n)}
    <canvas data-n={p.n} use:observar style="width:{p.w * escala}px;height:{p.h * escala}px" aria-label="Página {p.n}"></canvas>
  {/each}
</div>
{#if paginas.length}
  <div class="zoom-pdf">
    <button class="icono-btn" aria-label="Alejar" onclick={() => zoom(1 / 1.2)}>−</button>
    <span>{Math.round(escala * 100)}% · {paginas.length} pág.</span>
    <button class="icono-btn" aria-label="Acercar" onclick={() => zoom(1.2)}>+</button>
  </div>
{/if}

<style>
  .pdf { position: absolute; inset: 0; overflow: auto; background: #6b6559; padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 12px; -webkit-overflow-scrolling: touch; }
  canvas { background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, .35); flex-shrink: 0; }
  .estado { color: #fff; margin: 24px 0; }
  .error { color: #ffd6cf; }
  .zoom-pdf {
    position: absolute; bottom: calc(14px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 6px; background: var(--paper); border-radius: 999px; padding: 3px 10px;
    box-shadow: 0 3px 12px rgba(0, 0, 0, .3); font-size: 12px; white-space: nowrap;
  }
  .zoom-pdf button { font-size: 18px; width: 30px; height: 30px; }
</style>
