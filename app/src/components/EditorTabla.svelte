<script>
  // Editor de las celdas de una tabla: se escribe directo en cada celda; se eligen varias
  // arrastrando (o con Shift+clic) para combinarlas, pintarlas o borrarlas; y al acercar el mouse
  // a los bordes aparecen "+" para insertar columnas (arriba) y filas (a la izquierda), más las
  // barras para agregar al final (a la derecha y abajo).
  import { tick } from 'svelte'
  import Icono from './Icono.svelte'
  import { avisar } from '../lib/store.svelte.js'
  import { medir, LETRAS } from '../lib/tarjetas.js'
  import {
    tablaDelPortapapeles, tablaATexto, pegarEn, rango, ampliar, mapaFusiones, fusionar, separar, pintar,
    insertarFila, insertarColumna, quitarFila, quitarColumna, aplicarTabla, COLORES_CELDA, MAX_FILAS, MAX_COLUMNAS
  } from '../lib/tablas.js'

  /** `t`: la copia editable de la tarjeta (filas, fusiones, colores, encabezado). */
  let { t = $bindable() } = $props()

  let sel = $state({ f1: 0, c1: 0, f2: 0, c2: 0 })
  let ancla = { f: 0, c: 0 }
  let arrastrando = $state(false)
  let eligiendo = $state(false) // en el celular: el próximo toque extiende la selección
  let marco = $state()

  const nf = $derived(t.filas.length)
  const nc = $derived(t.filas[0]?.length || 0)
  const cubre = $derived(mapaFusiones(t))
  const enSel = (f, c) => f >= sel.f1 && f <= sel.f2 && c >= sel.c1 && c <= sel.c2
  // ¿Más de una celda elegida? (una sola combinada cuenta como una)
  const varias = $derived.by(() => { const u = ampliar(t, rango({ f: sel.f1, c: sel.c1 })); return u.f2 !== sel.f2 || u.c2 !== sel.c2 })
  const combinadaEnSel = $derived((t.fusiones || []).some(u => u.fila <= sel.f2 && u.fila + u.filas - 1 >= sel.f1 && u.col <= sel.c2 && u.col + u.cols - 1 >= sel.c1))
  const colorDe = (f, c) => COLORES_CELDA[t.colores?.[`${f},${c}`]] || null
  // Ancho de cada columna: el mismo reparto que en el lienzo, un poco más holgado (aquí la letra es mayor).
  const anchos = $derived.by(() => {
    const d = medir('tablas', { filas: t.filas, fusiones: t.fusiones, encabezado: t.encabezado, letra: t.letra })
    return d.cols.slice(1).map((x, j) => Math.max(120, Math.round((x - d.cols[j]) * 1.2)))
  })

  // --- Selección ---
  const elegir = (a, b = a) => (sel = ampliar(t, rango(a, b)))
  function bajar(e, f, c) {
    if (e.button === 2 || e.target.closest('button')) return
    if (e.shiftKey || eligiendo) {
      e.preventDefault()
      elegir(ancla, { f, c })
      eligiendo = false
      document.activeElement?.blur?.()
      return
    }
    ancla = { f, c }
    elegir(ancla)
    if (e.pointerType === 'mouse') arrastrando = true
  }
  function entrar(f, c) {
    if (!arrastrando || (f === ancla.f && c === ancla.c)) return
    elegir(ancla, { f, c })
    document.activeElement?.blur?.() // con varias elegidas no se escribe en ninguna
  }
  const soltar = () => (arrastrando = false)
  function enfocar(f, c) {
    if (arrastrando || (varias && enSel(f, c))) return
    ancla = { f, c }
    elegir(ancla)
  }

  async function enfocarCelda(f, c) {
    await tick()
    marco?.querySelector(`td[data-f="${f}"][data-c="${c}"] textarea`)?.focus()
  }

  // --- Operaciones ---
  function hacer(r) {
    aplicarTabla(t, r)
    // La selección siempre dentro de la tabla.
    const f = Math.min(sel.f1, t.filas.length - 1), c = Math.min(sel.c1, t.filas[0].length - 1)
    sel = ampliar(t, { f1: f, c1: c, f2: Math.min(sel.f2, t.filas.length - 1), c2: Math.min(sel.c2, t.filas[0].length - 1) })
  }
  function insFila(i) {
    if (nf >= MAX_FILAS) return avisar(`Máximo ${MAX_FILAS} filas`)
    hacer(insertarFila(t, i))
    enfocarCelda(i, Math.min(sel.c1, nc - 1))
  }
  function insCol(j) {
    if (nc >= MAX_COLUMNAS) return avisar(`Máximo ${MAX_COLUMNAS} columnas`)
    hacer(insertarColumna(t, j))
    enfocarCelda(Math.min(sel.f1, nf - 1), j)
  }
  const quitFila = i => nf > 1 && hacer(quitarFila(t, i))
  const quitCol = j => nc > 1 && hacer(quitarColumna(t, j))
  function quitarSeleccion(eje) {
    const [a, b] = eje === 'fila' ? [sel.f1, sel.f2] : [sel.c1, sel.c2]
    const total = eje === 'fila' ? nf : nc
    if (b - a + 1 >= total) return avisar(eje === 'fila' ? 'La tabla necesita al menos una fila' : 'La tabla necesita al menos una columna')
    for (let i = b; i >= a; i--) hacer(eje === 'fila' ? quitarFila(t, i) : quitarColumna(t, i))
    sel = ampliar(t, rango({ f: Math.min(sel.f1, t.filas.length - 1), c: Math.min(sel.c1, t.filas[0].length - 1) }))
  }
  const combinar = () => varias && hacer(fusionar(t, sel))
  const descombinar = () => hacer(separar(t, sel))
  const pintarSel = color => hacer(pintar(t, sel, color))
  function borrarSeleccion() {
    for (let f = sel.f1; f <= sel.f2; f++) for (let c = sel.c1; c <= sel.c2; c++) t.filas[f][c] = ''
  }

  // --- Teclado ---
  function tecla(e, f, c) {
    const u = cubre(f, c)
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      // Enter baja a la celda de abajo (Shift+Enter es salto de línea dentro de la celda).
      e.preventDefault()
      const abajo = f + (u?.filas || 1)
      if (abajo >= nf) insFila(nf)
      else enfocarCelda(abajo, c)
    } else if (e.key === 'Tab' && !e.shiftKey && f + (u?.filas || 1) >= nf && c + (u?.cols || 1) >= nc) {
      e.preventDefault() // Tab en la última celda: fila nueva
      insFila(nf)
      enfocarCelda(nf, 0)
    }
  }
  function teclaMarco(e) {
    if (!varias || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); borrarSeleccion() }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      const sub = t.filas.slice(sel.f1, sel.f2 + 1).map(r => r.slice(sel.c1, sel.c2 + 1))
      navigator.clipboard?.writeText(tablaATexto(sub)).then(() => avisar('Celdas copiadas'), () => {})
    }
  }

  // --- Portapapeles ---
  /** Pegar varias celdas (de Excel, Word, Markdown…) desde una celda: se reparten y la tabla crece. */
  function pegarCelda(e, f, c) {
    const p = tablaDelPortapapeles(e.clipboardData?.getData('text/html') || '', e.clipboardData?.getData('text/plain') || '')
    if (!p) return
    e.preventDefault()
    t.filas = pegarEn(t.filas, f, c, p.filas)
    sel = ampliar(t, { f1: f, c1: c, f2: f + p.filas.length - 1, c2: c + p.filas[0].length - 1 })
  }
  const tieneDatos = () => t.filas.some(r => r.some(x => x.trim()))
  async function pegarPortapapeles() {
    let html = '', texto = ''
    try {
      for (const it of await navigator.clipboard.read()) {
        if (!html && it.types.includes('text/html')) html = await (await it.getType('text/html')).text()
        if (!texto && it.types.includes('text/plain')) texto = await (await it.getType('text/plain')).text()
      }
    } catch {
      try { texto = await navigator.clipboard.readText() } catch { return avisar('No se pudo leer el portapapeles: pega con Ctrl+V dentro de una celda (o mantenla presionada y elige Pegar)') }
    }
    const p = tablaDelPortapapeles(html, texto)
    if (!p) return avisar('En el portapapeles no hay una tabla (copia celdas de Excel, Word, Google Sheets o una tabla en Markdown)')
    if (tieneDatos() && !confirm('¿Reemplazar el contenido de la tabla por la del portapapeles?')) return
    aplicarTabla(t, { filas: p.filas })
    t.encabezado = p.encabezado || !!t.encabezado
    sel = rango({ f: 0, c: 0 })
  }
  async function copiarTabla() {
    try { await navigator.clipboard.writeText(tablaATexto(t.filas)); avisar('Tabla copiada: pégala en Excel, Word o Sheets') }
    catch { avisar('No se pudo copiar') }
  }
</script>

<svelte:window onpointerup={soltar} onpointercancel={soltar} />

<div class="herramientas" role="toolbar" aria-label="Herramientas de la tabla">
  <div class="grupo">
    <button class="btn chico" disabled={!varias} onclick={combinar} title="Combinar las celdas elegidas en una (arrastra sobre varias celdas o usa Shift+clic)"><Icono nombre="combinar" tam={14} />Combinar</button>
    <button class="btn chico fantasma" disabled={!combinadaEnSel} onclick={descombinar} title="Separar la celda combinada">Separar</button>
    <button class="btn chico fantasma solo-tactil" aria-pressed={eligiendo} onclick={() => (eligiendo = !eligiendo)} title="Toca otra celda para elegir varias">Elegir varias</button>
  </div>
  <div class="grupo colores" role="group" aria-label="Color de las celdas">
    <button class="muestra sin" aria-label="Sin color" title="Sin color" onclick={() => pintarSel(null)}></button>
    {#each Object.entries(COLORES_CELDA) as [k, v]}
      <button class="muestra" style="--c:{v}" aria-label="Pintar de {k}" title={k} onclick={() => pintarSel(k)}></button>
    {/each}
  </div>
  <div class="grupo">
    <button class="btn chico fantasma" onclick={() => insFila(sel.f1)} title="Insertar fila arriba">Fila ↑</button>
    <button class="btn chico fantasma" onclick={() => insFila(sel.f2 + 1)} title="Insertar fila abajo">Fila ↓</button>
    <button class="btn chico fantasma" onclick={() => insCol(sel.c1)} title="Insertar columna a la izquierda">Col ←</button>
    <button class="btn chico fantasma" onclick={() => insCol(sel.c2 + 1)} title="Insertar columna a la derecha">Col →</button>
    <button class="btn chico fantasma peligro" onclick={() => quitarSeleccion('fila')} title="Quitar las filas elegidas">Quitar fila</button>
    <button class="btn chico fantasma peligro" onclick={() => quitarSeleccion('col')} title="Quitar las columnas elegidas">Quitar col.</button>
  </div>
</div>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="tabla-ed" class:arrastrando bind:this={marco} style={t.letra ? `--letra:${LETRAS[t.letra].css};--peso:${LETRAS[t.letra].normal}` : null} onkeydown={teclaMarco} role="grid" tabindex="-1" aria-label="Celdas de la tabla">
  <div class="zona">
    <table style:width="{22 + anchos.reduce((s, w) => s + w, 0)}px">
      <colgroup>
        <col style:width="22px" />
        {#each anchos as w}<col style:width="{w}px" />{/each}
      </colgroup>
      <thead>
        <tr>
          <th class="esquina"></th>
          {#each { length: nc } as _, c}
            <th class="mango-col" class:activo={c >= sel.c1 && c <= sel.c2}>
              <button class="ins izq" aria-label="Insertar columna antes de la {c + 1}" title="Insertar columna aquí" onclick={() => insCol(c)}>+</button>
              {#if c === nc - 1}<button class="ins der" aria-label="Agregar columna al final" title="Agregar columna" onclick={() => insCol(nc)}>+</button>{/if}
              <button class="quitar" aria-label="Quitar columna {c + 1}" title="Quitar columna" disabled={nc === 1} onclick={() => quitCol(c)}><Icono nombre="cerrar" tam={11} /></button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each t.filas as fila, f}
          <tr>
            <td class="mango-fila" class:activo={f >= sel.f1 && f <= sel.f2}>
              <button class="ins arr" aria-label="Insertar fila antes de la {f + 1}" title="Insertar fila aquí" onclick={() => insFila(f)}>+</button>
              {#if f === nf - 1}<button class="ins aba" aria-label="Agregar fila al final" title="Agregar fila" onclick={() => insFila(nf)}>+</button>{/if}
              <button class="quitar" aria-label="Quitar fila {f + 1}" title="Quitar fila" disabled={nf === 1} onclick={() => quitFila(f)}><Icono nombre="cerrar" tam={11} /></button>
            </td>
            {#each fila as _, c}
              {@const u = cubre(f, c)}
              {#if !u || (u.fila === f && u.col === c)}
                <td data-f={f} data-c={c} rowspan={u?.filas || 1} colspan={u?.cols || 1} class:sel={enSel(f, c)} class:unica={!varias && enSel(f, c)}
                  class:cab={t.encabezado && f === 0} style:background={colorDe(f, c)}
                  onpointerdown={e => bajar(e, f, c)} onpointerenter={() => entrar(f, c)}>
                  <textarea rows="1" bind:value={t.filas[f][c]} aria-label="Fila {f + 1}, columna {c + 1}{u ? ' (combinada)' : ''}"
                    onfocus={() => enfocar(f, c)} onpaste={e => pegarCelda(e, f, c)} onkeydown={e => tecla(e, f, c)}></textarea>
                </td>
              {/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    <button class="barra-mas col" aria-label="Agregar columna a la derecha" title="Agregar columna" onclick={() => insCol(nc)}>+</button>
    <button class="barra-mas fila" aria-label="Agregar fila abajo" title="Agregar fila" onclick={() => insFila(nf)}>+</button>
  </div>
</div>

<div class="fila envolver pie">
  <label class="encabezado"><input type="checkbox" bind:checked={t.encabezado} /> Primera fila como encabezado</label>
  <span class="espacio"></span>
  <button class="btn chico" onclick={pegarPortapapeles} title="Trae la tabla que copiaste en Excel, Word, Google Sheets o en Markdown">Pegar tabla</button>
  <button class="btn chico fantasma" onclick={copiarTabla} title="Para pegarla en Excel, Word o Sheets">Copiar</button>
</div>
<p class="suave pista">Arrastra sobre varias celdas (o Shift+clic) para combinarlas o pintarlas. Enter baja a la celda de abajo y Shift+Enter hace un salto de línea; Tab en la última celda agrega una fila. Pega varias celdas dentro de una y se reparten solas.</p>

<style>
  .herramientas { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
  .grupo { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .btn.peligro { color: var(--unreviewed); }
  .colores { gap: 5px; }
  .muestra { width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--line); background: var(--c); padding: 0; }
  .muestra:hover { box-shadow: 0 0 0 2px var(--ink-soft); }
  .muestra.sin { background: linear-gradient(135deg, #fff 45%, #C0392B 46%, #C0392B 54%, #fff 55%); }
  .solo-tactil { display: none; }
  @media (hover: none) { .solo-tactil { display: inline-flex; } }

  .tabla-ed { overflow: auto; max-height: 52dvh; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); outline: none; }
  .tabla-ed.arrastrando { user-select: none; -webkit-user-select: none; }
  .zona { position: relative; display: inline-block; padding: 0 30px 30px 0; }
  table { border-collapse: collapse; table-layout: fixed; }
  td { padding: 0; border: 1px solid var(--line); vertical-align: top; position: relative; background: #FFFDF8; }
  td.cab { background: #EFEADF; }
  td.cab textarea { font-weight: 600; }
  td.sel { box-shadow: inset 0 0 0 2px var(--accent); }
  td.sel::after { content: ''; position: absolute; inset: 0; background: rgba(47, 79, 181, .08); pointer-events: none; }
  td.unica::after { display: none; }
  textarea { display: block; width: 100%; height: 100%; min-height: 34px; field-sizing: content; max-height: 180px; resize: none; border: none; border-radius: 0; padding: 7px 8px; font: var(--peso, 400) 13px var(--letra, var(--sans)); background: transparent; }
  textarea:focus { outline: none; background: rgba(255, 255, 255, .6); }

  /* Mangos: la franja de arriba (columnas) y la de la izquierda (filas). */
  th, .mango-fila { position: relative; background: var(--paper-dim); border: none; padding: 0; }
  .esquina { width: 22px; }
  .mango-col { height: 20px; }
  .mango-fila { width: 22px; }
  .mango-col.activo, .mango-fila.activo { background: var(--accent-soft); }
  .ins, .quitar, .barra-mas { opacity: 0; transition: opacity .12s; }
  .ins { position: absolute; z-index: 3; width: 18px; height: 18px; border-radius: 50%; border: none; padding: 0; background: var(--accent); color: #fff; font: 600 14px/18px var(--sans); }
  .ins.izq { left: -9px; top: 1px; }
  .ins.der { right: -9px; top: 1px; }
  .ins.arr { top: -9px; left: 2px; }
  .ins.aba { bottom: -9px; left: 2px; }
  .quitar { border: none; background: none; padding: 2px; color: var(--ink-soft); display: inline-flex; }
  .mango-col .quitar { position: absolute; left: 50%; top: 1px; transform: translateX(-50%); }
  .mango-fila .quitar { position: absolute; left: 3px; top: 50%; transform: translateY(-50%); }
  .quitar:hover { color: var(--unreviewed); }
  .mango-col:hover .ins, .mango-col:hover .quitar, .mango-fila:hover .ins, .mango-fila:hover .quitar,
  .ins:focus-visible, .quitar:focus-visible { opacity: 1; }
  .ins:hover { transform: scale(1.15); }
  /* Barras para agregar al final: aparecen al acercarse al borde derecho o al de abajo. */
  .barra-mas { position: absolute; border: 1px dashed var(--accent); background: var(--accent-soft); color: var(--accent); border-radius: 8px; padding: 0; font: 600 16px var(--sans); }
  .barra-mas.col { top: 20px; right: 6px; bottom: 30px; width: 20px; }
  .barra-mas.fila { left: 22px; right: 30px; bottom: 6px; height: 20px; }
  .zona:hover .barra-mas { opacity: .55; }
  .barra-mas:hover, .barra-mas:focus-visible { opacity: 1 !important; background: var(--accent); color: #fff; }
  @media (hover: none) { .ins, .quitar, .barra-mas { opacity: .7; } }

  .pie { margin-top: -4px; }
  .encabezado { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
  .pista { font-size: 12px; margin: -8px 0 0; }
</style>
