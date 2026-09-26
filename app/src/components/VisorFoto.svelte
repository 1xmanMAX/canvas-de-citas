<script>
  // Visor de fotos a pantalla completa: la imagen ocupa casi todo, con zoom y desplazamiento
  // (rueda del mouse, trackpad, dedos) y un panel a un lado (en celular, hoja inferior) con los
  // datos de la foto y las herramientas para anotar encima. Los trazos se guardan en 0–1000
  // sobre la imagen completa, igual que en la tarjeta del lienzo.
  import { onMount, untrack } from 'svelte'
  import Icono from './Icono.svelte'
  import { TINTAS } from '../lib/tarjetas.js'
  import { leerOriginalFoto } from '../lib/store.svelte.js'
  import { ajustar, zoomEn, aImagen, limitesZoom } from '../lib/vista.js'
  import { crearDetectorRueda } from '../lib/gestos.js'

  /** Mismas props que EditorTarjeta para fotos. `o` es una copia editable. */
  let { o = $bindable(), nueva = false, vinculos = [], onvinculo = null, onguardar, oneliminar, onduplicar, onclose } = $props()
  untrack(() => { o.trazos ||= [] })

  // La imagen se maqueta con 1000 px de ancho lógico; su resolución real solo decide el "100 %".
  const ANCHO = 1000
  const alto = $derived(ANCHO / (o.proporcion || 4 / 3))

  let dialogo, area
  let src = $state(untrack(() => o.imagen))
  let anchoReal = $state(0)
  let AW = $state(0), AH = $state(0)
  let v = $state({ k: 1, tx: 0, ty: 0 })
  let ajustado = false
  let enAjuste = false // la vista muestra la foto entera: si cambia el espacio, se reajusta
  let anchoVentana = $state(typeof innerWidth === 'number' ? innerWidth : 1200)
  const lateral = $derived(anchoVentana >= 900)
  let panel = $state(true)
  let hojaBaja = $state(true) // en celular la hoja empieza recogida: primero se ve la foto
  let modo = $state('mover') // 'mover' | 'dibujar'
  let lapizVisto = false // con lápiz digital, el dedo mueve y el lápiz dibuja
  let color = $state('rojo')
  let grosor = $state(7)
  const porc = $derived(anchoReal ? Math.round(((v.k * ANCHO) / anchoReal) * 100) : Math.round(v.k * 100))

  onMount(() => {
    dialogo.showModal()
    dialogo.focus()
    let url
    leerOriginalFoto(o).then(b => { if (b) src = url = URL.createObjectURL(b) }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url); if (dialogo?.open) dialogo.close() }
  })

  const lim = () => limitesZoom(ajustar(ANCHO, alto, AW, AH))
  function encuadrar() {
    if (!AW || !AH) return
    v = ajustar(ANCHO, alto, AW, AH)
    ajustado = enAjuste = true
  }
  $effect(() => { if (AW && AH && (!ajustado || enAjuste)) encuadrar() })
  // Cualquier zoom o desplazamiento del usuario deja de "seguir" el ajuste.
  const poner = n => { v = n; enAjuste = false }
  function zoom(f, cx = AW / 2, cy = AH / 2) {
    const { kMin, kMax } = lim()
    poner(zoomEn(v, f, cx, cy, kMin, kMax * Math.max(1, (anchoReal || ANCHO) / ANCHO)))
  }
  /** Alterna entre ver la foto entera y verla a tamaño real, centrado en el punto tocado. */
  function alternarTamano(cx, cy) {
    const ajuste = ajustar(ANCHO, alto, AW, AH)
    const real = (anchoReal || ANCHO * 2) / ANCHO
    if (Math.abs(v.k - ajuste.k) < 0.01) zoom(real / v.k, cx, cy)
    else encuadrar()
  }

  // --- Rueda: mouse = zoom al cursor; trackpad = desplazar (pellizco = zoom) ---
  const detector = crearDetectorRueda()
  function rueda(e) {
    e.preventDefault()
    const r = area.getBoundingClientRect()
    const pinza = e.ctrlKey || e.metaKey
    if (pinza || detector(e) === 'mouse') {
      zoom(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : pinza ? 0.01 : 0.0022)), e.clientX - r.left, e.clientY - r.top)
      return
    }
    const f = e.deltaMode === 1 ? 16 : 1
    poner({ ...v, tx: v.tx - e.deltaX * f, ty: v.ty - e.deltaY * f })
  }

  // --- Punteros: mover, pellizcar y dibujar ---
  const punteros = new Map()
  let gesto = null
  let trazo = null
  let ultimoToque = { t: 0, x: 0, y: 0 }
  const local = e => { const r = area.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  function abajo(e) {
    if (e.button === 2 || e.target.closest?.('button')) return
    area.setPointerCapture(e.pointerId)
    if (e.pointerType === 'pen') lapizVisto = true
    const dibuja = e.button === 0 && !punteros.size &&
      (e.pointerType === 'pen' || (modo === 'dibujar' && !(e.pointerType === 'touch' && lapizVisto)))
    const p = local(e)
    if (dibuja) {
      const [x, y] = aImagen(v, p.x, p.y, ANCHO, alto)
      trazo = { id: e.pointerId, x, y }
      o.trazos = [...o.trazos, { c: color, g: color === 'amarillo' ? 28 : grosor, p: [`${x},${y}`] }]
      return
    }
    punteros.set(e.pointerId, p)
    if (punteros.size === 1) gesto = { tipo: 'mover', x0: p.x, y0: p.y, tx: v.tx, ty: v.ty, movido: false }
    else if (punteros.size === 2) {
      const [a, b] = [...punteros.values()]
      gesto = { tipo: 'pellizco', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, v: { ...v }, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
    }
  }

  function mover(e) {
    const p = local(e)
    if (trazo && e.pointerId === trazo.id) {
      const [x, y] = aImagen(v, p.x, p.y, ANCHO, alto)
      if (Math.hypot(x - trazo.x, y - trazo.y) < 3) return
      trazo.x = x; trazo.y = y
      const t = o.trazos.at(-1)
      o.trazos = [...o.trazos.slice(0, -1), { ...t, p: [...t.p, `${x},${y}`] }]
      return
    }
    if (!punteros.has(e.pointerId) || !gesto) return
    punteros.set(e.pointerId, p)
    if (gesto.tipo === 'pellizco' && punteros.size >= 2) {
      const [a, b] = [...punteros.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      const { kMin, kMax } = lim()
      const n = zoomEn(gesto.v, d / gesto.d, gesto.cx, gesto.cy, kMin, kMax * Math.max(1, (anchoReal || ANCHO) / ANCHO))
      poner({ k: n.k, tx: n.tx + cx - gesto.cx, ty: n.ty + cy - gesto.cy })
    } else if (gesto.tipo === 'mover') {
      const dx = p.x - gesto.x0, dy = p.y - gesto.y0
      if (!gesto.movido && Math.hypot(dx, dy) < 4) return
      gesto.movido = true
      poner({ ...v, tx: gesto.tx + dx, ty: gesto.ty + dy })
    }
  }

  function arriba(e) {
    if (trazo && e.pointerId === trazo.id) {
      const t = o.trazos.at(-1)
      // Un toque sin mover deja un punto visible.
      if (t.p.length === 1) o.trazos = [...o.trazos.slice(0, -1), { ...t, p: [t.p[0], t.p[0]] }]
      trazo = null
      return
    }
    if (!punteros.delete(e.pointerId)) return
    if (gesto?.tipo === 'mover' && !gesto.movido && e.type === 'pointerup') {
      const p = local(e), ahora = performance.now()
      if (ahora - ultimoToque.t < 320 && Math.hypot(p.x - ultimoToque.x, p.y - ultimoToque.y) < 30) {
        alternarTamano(p.x, p.y)
        ultimoToque = { t: 0, x: 0, y: 0 }
      } else ultimoToque = { t: ahora, ...p }
    }
    if (punteros.size === 1 && gesto?.tipo === 'pellizco') {
      const [p] = punteros.values()
      gesto = { tipo: 'mover', x0: p.x, y0: p.y, tx: v.tx, ty: v.ty, movido: true }
    } else if (!punteros.size) gesto = null
  }

  // --- Teclado ---
  function tecla(e) {
    if (e.target.closest?.('input, textarea')) return
    const k = e.key.toLowerCase()
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); deshacer() }
    else if (e.ctrlKey || e.metaKey || e.altKey) return
    else if (k === '+' || k === '=') zoom(1.25)
    else if (k === '-') zoom(1 / 1.25)
    else if (k === '0') encuadrar()
    else if (k === 'd') modo = modo === 'dibujar' ? 'mover' : 'dibujar'
  }

  const deshacer = () => (o.trazos = o.trazos.slice(0, -1))
  // Cerrar: una foto ya guardada conserva los cambios; una nueva sin "Guardar" no se crea.
  const cerrar = () => (nueva ? onclose?.() : onguardar?.(o))
</script>

<svelte:window bind:innerWidth={anchoVentana} />

<dialog bind:this={dialogo} class="visor-foto" aria-label="Foto" tabindex="-1"
  oncancel={e => { e.preventDefault(); cerrar() }} onkeydown={tecla}>
  <div class="cuerpo" class:con-panel={lateral && panel} class:apilado={!lateral}>
    <div class="area" class:dibujando={modo === 'dibujar'} bind:this={area} bind:clientWidth={AW} bind:clientHeight={AH}
      role="application" aria-label="Foto: arrastra para mover, rueda o pellizco para hacer zoom"
      onwheel={rueda} onpointerdown={abajo} onpointermove={mover} onpointerup={arriba} onpointercancel={arriba}>
      <div class="capa" style="width:{ANCHO}px;height:{alto}px;transform:translate({v.tx}px, {v.ty}px) scale({v.k})">
        <img {src} alt={o.titulo || ''} draggable="false" onload={e => (anchoReal = e.currentTarget.naturalWidth)} />
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          {#each o.trazos as t}
            <polyline points={t.p.join(' ')} stroke={TINTAS[t.c] || t.c} stroke-width={t.g || 8} opacity={t.c === 'amarillo' ? 0.45 : 1} vector-effect="non-scaling-stroke" />
          {/each}
        </svg>
      </div>

      <div class="arriba-der">
        {#if lateral}
          <button class="flotante" aria-label={panel ? 'Ocultar panel' : 'Mostrar panel'} title={panel ? 'Ocultar panel' : 'Mostrar panel'} onclick={() => (panel = !panel)}>
            <Icono nombre={panel ? 'agrandar' : 'menu'} tam={18} />
          </button>
        {/if}
        <button class="flotante" aria-label="Cerrar" title="Cerrar (Esc)" onclick={cerrar}><Icono nombre="cerrar" tam={18} trazo={2} /></button>
      </div>

      <div class="barra-zoom">
        <button class="modo" aria-pressed={modo === 'dibujar'} title="Mover / Dibujar (D)" onclick={() => (modo = modo === 'dibujar' ? 'mover' : 'dibujar')}>
          <Icono nombre="lapiz" tam={15} />{modo === 'dibujar' ? 'Dibujando' : 'Dibujar'}
        </button>
        <span class="sep"></span>
        <button aria-label="Alejar" onclick={() => zoom(1 / 1.25)}><Icono nombre="menos" tam={15} trazo={2} /></button>
        <button class="porc" aria-label="Ver la foto entera" title="Ver la foto entera (0)" onclick={encuadrar}>{porc}%</button>
        <button aria-label="Acercar" onclick={() => zoom(1.25)}><Icono nombre="mas" tam={15} trazo={2} /></button>
      </div>
    </div>

    {#if panel || !lateral}
      <aside class="ficha" class:hoja={!lateral} class:baja={!lateral && hojaBaja}>
        {#if !lateral}
          <button class="asa" aria-label={hojaBaja ? 'Mostrar detalles' : 'Ocultar detalles'} onclick={() => (hojaBaja = !hojaBaja)}><span></span></button>
        {/if}
        <div class="herramientas">
          {#each Object.entries(TINTAS) as [nombre, valor]}
            <button class="tinta" class:activa={color === nombre} style="--c:{valor}" aria-label={nombre === 'amarillo' ? 'Resaltador' : `Tinta ${nombre}`} title={nombre === 'amarillo' ? 'Resaltador' : nombre}
              onclick={() => { color = nombre; modo = 'dibujar' }}></button>
          {/each}
          <span class="div"></span>
          <button class="btn chico fantasma" aria-pressed={grosor === 4} onclick={() => (grosor = 4)}>Fino</button>
          <button class="btn chico fantasma" aria-pressed={grosor === 10} onclick={() => (grosor = 10)}>Grueso</button>
          <button class="icono-btn" aria-label="Deshacer trazo" title="Deshacer (Ctrl+Z)" disabled={!o.trazos.length} onclick={deshacer}><Icono nombre="deshacer" /></button>
          <button class="btn chico peligro" disabled={!o.trazos.length} onclick={() => (o.trazos = [])}>Borrar trazos</button>
        </div>
        <div class="detalles">
          <label class="campo"><span>Título</span><input type="text" bind:value={o.titulo} placeholder="Ensayo en laboratorio, feb. 2026" /></label>
          <label class="campo"><span>Texto (descripción, análisis, transcripción de la imagen…)</span>
            <textarea rows="5" bind:value={o.texto} placeholder="Todo lo que quieras anotar sobre esta foto"></textarea></label>
          <label class="campo"><span>Anotación a mano (se ve en rojo bajo la foto)</span>
            <input type="text" bind:value={o.anotacion} class="mano" placeholder="¿coincide con Villarreal?" /></label>
          {#if o.origen && onvinculo}
            <button class="btn vinculo-doc" onclick={onvinculo}>
              <Icono nombre="externo" tam={14} />Vínculo: ir a la cita en el documento{o.origen.pagina ? ` (pág. ${o.origen.pagina})` : ''}
            </button>
          {/if}
          {#if vinculos.length}
            <div class="vinculos">
              <span class="rotulo">Vinculado con · {vinculos.length}</span>
              <ul>{#each vinculos as x}<li>{x}</li>{/each}</ul>
            </div>
          {/if}
          <p class="suave pista">Rueda o pellizco: zoom · arrastrar: mover · doble clic: tamaño real · D: dibujar</p>
        </div>
        <div class="pie">
          {#if !nueva}
            <button class="btn peligro chico" onclick={oneliminar}>Eliminar</button>
            <button class="btn fantasma chico" onclick={onduplicar}><Icono nombre="duplicar" tam={14} />Duplicar</button>
          {/if}
          <span class="espacio"></span>
          <button class="btn primario" onclick={() => onguardar(o)}>Guardar</button>
        </div>
      </aside>
    {/if}
  </div>
</dialog>

<style>
  dialog.visor-foto {
    width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0;
    background: #15140F; color: var(--ink); overflow: hidden;
  }
  dialog.visor-foto::backdrop { background: rgba(10, 10, 8, .6); }
  .cuerpo { position: relative; display: grid; grid-template-columns: 1fr; width: 100%; height: 100%; }
  .cuerpo.con-panel { grid-template-columns: 1fr 340px; }
  .cuerpo.apilado { grid-template-rows: minmax(0, 1fr) auto; }
  .area { position: relative; overflow: hidden; touch-action: none; user-select: none; cursor: grab; min-width: 0; }
  .area:active { cursor: grabbing; }
  .area.dibujando { cursor: crosshair; }
  .capa { position: absolute; left: 0; top: 0; transform-origin: 0 0; box-shadow: 0 4px 30px rgba(0, 0, 0, .45); }
  .capa img { display: block; width: 100%; height: 100%; user-select: none; -webkit-user-drag: none; }
  .capa svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .arriba-der { position: absolute; top: max(12px, env(safe-area-inset-top)); right: 12px; display: flex; gap: 8px; }
  .flotante {
    width: 40px; height: 40px; border-radius: 50%; border: none; display: grid; place-items: center;
    background: rgba(255, 253, 248, .92); color: var(--ink); box-shadow: 0 2px 10px rgba(0, 0, 0, .3);
  }
  .barra-zoom {
    position: absolute; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%);
    display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 12px;
    background: rgba(255, 253, 248, .94); box-shadow: 0 2px 12px rgba(0, 0, 0, .35);
  }
  .barra-zoom button { border: none; background: none; min-width: 34px; height: 34px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; color: var(--ink); font-size: 13px; }
  .barra-zoom button:hover { background: var(--paper-dim); }
  .barra-zoom .porc { width: 54px; color: var(--ink-soft); font-size: 12px; }
  .barra-zoom .modo { padding: 0 10px; }
  .barra-zoom .modo[aria-pressed='true'] { background: var(--ink); color: var(--paper); }
  .sep { width: 1px; height: 22px; background: var(--line); margin: 0 4px; }
  .ficha { background: var(--paper); display: flex; flex-direction: column; gap: 12px; padding: 16px; overflow-y: auto; min-height: 0; border-left: 1px solid var(--line); }
  .ficha.hoja {
    max-height: 55dvh; border-left: none; border-radius: 16px 16px 0 0; margin-top: -16px; z-index: 1;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, .35); padding: 6px 14px max(14px, env(safe-area-inset-bottom));
  }
  .ficha.hoja.baja { max-height: none; overflow: hidden; }
  .ficha.hoja.baja .detalles { display: none; }
  .asa { align-self: center; border: none; background: none; padding: 6px 30px; }
  .asa span { display: block; width: 40px; height: 5px; border-radius: 3px; background: var(--line); }
  .herramientas { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .tinta { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--paper); background: var(--c); box-shadow: 0 0 0 1px var(--line); padding: 0; }
  .tinta.activa { box-shadow: 0 0 0 2px var(--ink); }
  .div { width: 1px; height: 20px; background: var(--line); margin: 0 2px; }
  .detalles { display: flex; flex-direction: column; gap: 12px; }
  .mano { font-family: var(--mano); font-size: 20px; color: #C0392B; }
  .vinculo-doc { align-self: flex-start; border-color: var(--accent); color: var(--accent); }
  .vinculos { border-top: 1px solid var(--line); padding-top: 12px; }
  .vinculos ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; }
  .pista { margin: 0; font-size: 12px; }
  .pie { display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--line); }
  .espacio { flex-grow: 1; }
</style>
