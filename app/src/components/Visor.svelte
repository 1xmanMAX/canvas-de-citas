<script>
  // Panel lateral para leer documentos sin salir de la app: PDF (visor del navegador o pdf.js),
  // HTML (aislado, sin scripts), Markdown y texto. Desde un HTML, lo seleccionado se vuelve nota.
  import Icono from './Icono.svelte'
  import { V, cerrarVisor, adjuntarAbierto, notaDesdeSeleccion, fotoDesdeRecorte, marcasDeFuente } from '../lib/visor.svelte.js'
  import { rangoDeCita, resaltar, ESTILO_RESALTADO } from '../lib/resaltar.js'
  import { S } from '../lib/store.svelte.js'
  import { autorCorto, anio } from '../lib/citas.js'

  // Lector de PDF propio (PDFium en un hilo aparte): se descarga la primera vez que se abre un PDF.
  let VisorPdf = $state(null)
  $effect(() => {
    if (V.archivo?.tipo === 'pdf' && !VisorPdf) import('./VisorPdf.svelte').then(m => (VisorPdf = m.default))
  })

  const a = $derived(V.archivo)
  const fuente = $derived(V.fuenteId ? S.fuentePorId.get(V.fuenteId) : null)
  let texto = $state('')
  let seleccion = $state('')
  let seleccionPag = $state(null)
  let seleccionRects = null
  // Citas ya tomadas de este documento en el proyecto: se marcan al leer (vínculos).
  const marcas = $derived(marcasDeFuente(V.proyectoId, V.fuenteId))
  let destino = $state('')
  const fuentes = $derived([...S.fuentes].sort((x, y) => autorCorto(x).localeCompare(autorCorto(y), 'es')))

  $effect(() => {
    seleccion = ''
    texto = ''
    docHtml = null
    seleccionRects = null
    if (a && (a.tipo === 'html' || a.tipo === 'md' || a.tipo === 'texto')) a.blob.text().then(t => (texto = t))
  })

  // HTML: sin scripts; los enlaces se abren en otra pestaña. allow-same-origin permite leer la
  // selección para crear notas (sin allow-scripts el documento no puede ejecutar nada).
  const srcdoc = $derived(a?.tipo === 'html' && texto
    ? (/<head[^>]*>/i.test(texto)
      ? texto.replace(/<head([^>]*)>/i, `<head$1><base target="_blank"><style>${ESTILO_RESALTADO}</style>`)
      : `<base target="_blank"><style>${ESTILO_RESALTADO}</style>` + texto)
    : '')

  // --- Citas en HTML/Markdown: resaltadas; el destino de un vínculo, en otro color y a la vista ---
  let docHtml = $state(null)
  let lectura = $state()
  function pintarCitas() {
    const esHtml = a?.tipo === 'html'
    const raiz = esHtml ? docHtml?.body : lectura
    if (!raiz) return
    const win = esHtml ? docHtml.defaultView : window
    const rangos = marcas.filter(m => m.cita && m.tipo === a.tipo).map(m => ({ id: m.id, r: rangoDeCita(raiz, m.cita) })).filter(x => x.r)
    resaltar(win, 'cita', rangos.map(x => x.r))
    const d = V.destino
    const activo = d && (rangos.find(x => x.id === d.tarjeta)?.r || rangoDeCita(raiz, d.cita))
    resaltar(win, 'cita-activa', activo ? [activo] : [])
    if (activo) {
      const b = activo.getBoundingClientRect()
      if (esHtml) win.scrollBy({ top: b.top - win.innerHeight / 3, behavior: 'smooth' })
      else lectura.scrollBy({ top: b.top - lectura.getBoundingClientRect().top - lectura.clientHeight / 3, behavior: 'smooth' })
      setTimeout(() => resaltar(win, 'cita-activa', []), 3500)
    }
  }
  $effect(() => {
    V.destino; marcas; docHtml; lectura; texto
    if (a && a.tipo !== 'pdf' && texto) requestAnimationFrame(pintarCitas)
  })

  function alCargarHtml(e) {
    const doc = e.currentTarget.contentDocument
    if (!doc) return
    docHtml = doc
    doc.addEventListener('selectionchange', () => (seleccion = doc.getSelection()?.toString().trim() || ''))
    doc.addEventListener('keydown', teclas)
  }

  // Markdown mínimo (títulos, listas, negrita, cursiva, enlaces, código) sobre texto escapado.
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const enLinea = t => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  function markdown(md) {
    const out = [], lineas = md.replace(/\r/g, '').split('\n')
    let lista = null, parrafo = []
    const cerrarP = () => { if (parrafo.length) out.push(`<p>${parrafo.map(enLinea).join(' ')}</p>`); parrafo = [] }
    const cerrarL = () => { if (lista) out.push(`</${lista}>`); lista = null }
    for (const l of lineas) {
      const h = /^(#{1,4})\s+(.*)$/.exec(l), li = /^\s*([-*]|\d+[.)])\s+(.*)$/.exec(l)
      if (h) { cerrarP(); cerrarL(); out.push(`<h${h[1].length}>${enLinea(h[2])}</h${h[1].length}>`) }
      else if (li) { cerrarP(); const t = /\d/.test(li[1]) ? 'ol' : 'ul'; if (lista !== t) { cerrarL(); out.push(`<${t}>`); lista = t } out.push(`<li>${enLinea(li[2])}</li>`) }
      else if (!l.trim()) { cerrarP(); cerrarL() }
      else parrafo.push(l)
    }
    cerrarP(); cerrarL()
    return out.join('\n')
  }

  function seleccionLocal() { seleccion = document.getSelection()?.toString().trim() || '' }

  function teclas(e) {
    if (e.key !== 'Escape' || !a || document.querySelector('dialog[open]')) return
    if (V.recortando) V.recortando = false // Esc cancela el recorte antes de cerrar el visor
    else cerrarVisor()
  }
</script>

<svelte:window onkeydown={teclas} />

{#if a}
  <section class="visor" class:grande={V.grande} aria-label="Visor de documento">
    <header class="v-cab">
      <Icono nombre="doc" tam={16} />
      <div class="v-titulo">
        <b title={a.nombre}>{a.nombre}</b>
        {#if fuente}<span class="suave">{autorCorto(fuente)} ({anio(fuente)})</span>{/if}
      </div>
      {#if seleccion}
        <button class="btn chico primario" onclick={() => { notaDesdeSeleccion(seleccion, seleccionPag, seleccionRects); seleccion = '' }} title="Crear una nota en el lienzo con el texto seleccionado">
          <Icono nombre="nota" tam={13} />Nota con la cita
        </button>
      {/if}
      <a class="icono-btn" href={a.url} target="_blank" rel="noopener" title="Abrir en otra pestaña" aria-label="Abrir en otra pestaña"><Icono nombre="externo" tam={15} /></a>
      <a class="icono-btn" href={a.url} download={a.nombre} title="Descargar" aria-label="Descargar"><Icono nombre="descargar" tam={15} /></a>
      <button class="icono-btn solo-escritorio" aria-label={V.grande ? 'Media pantalla' : 'Pantalla completa'} title={V.grande ? 'Media pantalla' : 'Pantalla completa'} onclick={() => (V.grande = !V.grande)}>
        <Icono nombre={V.grande ? 'reducir' : 'agrandar'} tam={16} />
      </button>
      <button class="icono-btn" aria-label="Cerrar visor" title="Cerrar (Esc)" onclick={cerrarVisor}><Icono nombre="cerrar" tam={18} trazo={2} /></button>
    </header>

    {#if !fuente && fuentes.length}
      <div class="v-adjuntar">
        <span class="suave">Adjuntar a una fuente:</span>
        <select bind:value={destino} aria-label="Fuente">
          <option value="">Elegir…</option>
          {#each fuentes as f (f.id)}<option value={f.id}>{autorCorto(f)} ({anio(f)}) — {f.titulo?.slice(0, 50)}</option>{/each}
        </select>
        <button class="btn chico" disabled={!destino} onclick={() => adjuntarAbierto(destino)}><Icono nombre="clip" tam={13} />Adjuntar</button>
      </div>
    {/if}

    <div class="v-cuerpo">
      {#if a.tipo === 'pdf'}
        {#if VisorPdf}
          {#key a.url}<VisorPdf blob={a.blob} {marcas} destino={V.destino} onseleccion={(t, pag, rects) => { seleccion = t; seleccionPag = pag; seleccionRects = rects }} onrecorte={fotoDesdeRecorte} />{/key}
        {:else}
          <p class="suave cargando">Cargando lector de PDF…</p>
        {/if}
      {:else if a.tipo === 'html'}
        {#if srcdoc}
          <iframe {srcdoc} title={a.nombre} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" onload={alCargarHtml}></iframe>
        {/if}
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <article class="lectura" bind:this={lectura} class:plano={a.tipo === 'texto'} onmouseup={seleccionLocal} ontouchend={seleccionLocal}>
          {#if a.tipo === 'md'}{@html markdown(texto)}{:else}{texto}{/if}
        </article>
      {/if}
    </div>
  </section>
{/if}

<style>
  .visor {
    position: fixed; top: 64px; right: 0; bottom: 0; width: min(50vw, 900px); min-width: 420px; z-index: 30;
    display: flex; flex-direction: column; background: var(--paper);
    border-left: 1px solid var(--line); box-shadow: -10px 0 30px rgba(33, 31, 26, .16);
  }
  .visor.grande { width: 100vw; min-width: 0; border-left: none; }
  .v-cab { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 14px; border-bottom: 1px solid var(--line); background: var(--paper-dim); }
  .v-titulo { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .v-titulo b { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .v-titulo span { font-size: 12px; }
  .v-cab .btn { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; }
  .v-adjuntar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--line); font-size: 13px; flex-wrap: wrap; }
  .v-adjuntar select { flex: 1 1 180px; width: auto; min-width: 0; padding: 5px 8px; font-size: 13px; }
  .v-adjuntar .btn { flex-shrink: 0; }
  .v-cuerpo { flex-grow: 1; position: relative; min-height: 0; }
  iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; background: #fff; }
  .cargando { padding: 24px; }
  .lectura {
    position: absolute; inset: 0; overflow: auto; padding: 28px max(20px, calc((100% - 720px) / 2)) 60px;
    font: 400 16px/1.7 Georgia, 'Iowan Old Style', serif; color: var(--ink); background: #FDFCF9; user-select: text;
  }
  .lectura.plano { white-space: pre-wrap; font: 400 14px/1.6 var(--mono); }
  .lectura :global(h1), .lectura :global(h2), .lectura :global(h3) { font-family: var(--serif); line-height: 1.3; }
  .lectura :global(code) { font-family: var(--mono); background: var(--paper-dim); padding: 0 4px; border-radius: 4px; }
  @media (max-width: 820px) {
    .visor { top: 0; width: 100vw; min-width: 0; border-left: none; z-index: 40; }
  }
</style>
