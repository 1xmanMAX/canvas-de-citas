<script>
  // Lienzo de lectura de una fuente (p.canvas.lecturas[fid]): todas las citas, recortes y notas de un
  // paper en su propio tablero, con la fuente al centro. La chincheta de cada tarjeta la clava también
  // en el lienzo general del proyecto (lib/lecturas.js). Ocupa el lienzo del proyecto y deja a la
  // derecha el visor del documento, para leer y anotar lado a lado.
  import Lienzo from './Lienzo.svelte'
  import Arrastrable from './Arrastrable.svelte'
  import Icono from './Icono.svelte'
  import Modal from './Modal.svelte'
  import Tarjeta from './Tarjeta.svelte'
  import Chinchetas from './Chinchetas.svelte'
  import { tablaDelPortapapeles } from '../lib/tablas.js'
  import EditorTarjeta from './EditorTarjeta.svelte'
  import VisorFoto from './VisorFoto.svelte'
  import Agrupador from './Agrupador.svelte'
  import EditorAgrupador from './EditorAgrupador.svelte'
  import { S, guardarProyecto, avisar, guardarOriginalFoto } from '../lib/store.svelte.js'
  import { autorCorto, anio } from '../lib/citas.js'
  import { F, envolver, ancho } from '../lib/texto.js'
  import { limitesDe, rutaConexion } from '../lib/grafo.js'
  import { accionesAgrupadores } from '../lib/agrupadores.js'
  import { LISTAS, TIPO, cajas, medir, nombreTarjeta, coincideTarjeta, idLocal } from '../lib/tarjetas.js'
  import { redimensionarFoto, lugarLibre, nuevaTarjeta, guardarTarjeta, eliminarTarjeta, duplicarTarjeta, alternarTarea, vinculosDe, ancla, rutaHilo } from '../lib/tablero.js'
  import { vacia, asegurarLectura, alternarClavada, cuentaLectura } from '../lib/lecturas.js'
  import { analizar, aDataURL } from '../lib/audio.svelte.js'
  import { prepararFoto } from '../lib/imagen.js'
  import { V, abrirOrigen, abrirDocumentoFuente } from '../lib/visor.svelte.js'
  import { B } from '../lib/buscador.svelte.js'
  import { untrack } from 'svelte'

  let { p, fid, abrirFicha, cerrar, lugarEnGeneral } = $props()

  const cv = $derived(p.canvas)
  const f = $derived(S.fuentePorId.get(fid))
  const VACIA = vacia()
  const o = $derived(cv.lecturas?.[fid] || VACIA)
  /** Crea el lienzo de lectura la primera vez que se le agrega algo (y lo devuelve reactivo). */
  const asegurar = () => asegurarLectura(cv, fid)
  const guardar = () => { if (cv.lecturas?.[fid]) grupos.fijar(); guardarProyecto(p) }
  const copia = x => $state.snapshot(x)

  let lienzo
  let modal = $state(null) // { lista, o, nueva } | { conexion } | { grupo }
  let entradaFoto
  let conectando = $state(null)
  let lejos = $state(false)
  let q = $state('')

  // --- Llegar desde el buscador general: centrar y resaltar el elemento pedido ---
  let destacado = $state(null)
  $effect(() => {
    const r = B.resaltar
    if (!r || !lienzo) return
    const c = tarj.get(r.id) || cajasGrupos.get(r.id)
    if (!c) return
    untrack(() => (B.resaltar = null))
    setTimeout(() => {
      lienzo?.centrarEn(c)
      destacado = r.id
      setTimeout(() => (destacado = null), 2500)
    }, 250)
  })

  // --- La fuente al centro ---
  const FW = 360
  const rotulo = $derived(f ? `${autorCorto(f)} (${anio(f)})` : 'Fuente')
  const lineas = $derived((S.tipografias, envolver(f?.titulo || '', F.hub, FW - 48, 5)))
  const fh = $derived(22 + 20 + 16 + Math.max(1, lineas.length) * 27 + 18 + 26)
  const cuenta = $derived(cuentaLectura(cv, fid))
  const tieneDoc = $derived(!!f?.documento_original || !!f?.documento_nombre)

  const tarj = $derived(cajas(o))
  const corcho = $derived(!!cv.corcho)
  const hayTarjetas = $derived(cuenta.total > 0)
  const caja = $derived({ x: -FW / 2, y: -fh / 2, w: FW, h: fh })

  let ventana = $state(null)
  const cruza = c => !ventana || (c && c.x < ventana.x + ventana.w && c.x + c.w > ventana.x && c.y < ventana.y + ventana.h && c.y + c.h > ventana.y)
  const pesado = $derived(cuenta.total > 150)
  const tarjVista = $derived(Object.fromEntries(LISTAS.map(l => [l, (o[l] || []).filter(t => cruza(tarj.get(t.id)))])))
  const chinchetas = $derived(corcho ? [caja, ...tarj.values()].filter(cruza).map((c, i) => ({ id: c.obj?.id || fid, x: c.x, y: c.y, w: c.w })) : [])

  const centroDe = id => (id === fid ? { x: 0, y: 0 } : ancla(tarj.get(id), false))
  const puntoDe = id => (id === fid ? (corcho ? ancla(caja, true) : { x: 0, y: 0 }) : ancla(tarj.get(id), corcho))
  function nombreDe(id) {
    if (id === fid) return rotulo
    const t = tarj.get(id)
    return t ? nombreTarjeta(t.lista, t.obj) : id
  }

  const ocupadas = $derived([caja, ...[...tarj.values()].map(({ x, y, w, h }) => ({ x, y, w, h })), ...[...cajasGrupos.values()]])
  const limites = $derived(limitesDe(ocupadas, 40))

  // --- Agrupadores ---
  function elementos() {
    const out = []
    for (const [id, t] of tarj) out.push({ id, get nombre() { return nombreDe(id) }, tipo: TIPO[t.lista], caja: t, poner: (a, b) => { t.obj.x = a; t.obj.y = b } })
    return out
  }
  const grupos = accionesAgrupadores({ lienzo: asegurar, elementos, cajaPorId: id => tarj.get(id) || null, guardar: () => guardarProyecto(p) })
  const cajasGrupos = $derived(new Map((o.agrupadores || []).map(g => [g.id, grupos.caja(g)])))
  const agrupadoresVista = $derived((o.agrupadores || []).filter(g => cruza(cajasGrupos.get(g.id))))
  const cuantos = $derived(new Map((o.agrupadores || []).map(g => [g.id, Array.isArray(g.miembros) ? g.miembros.length : grupos.miembros(g).length])))
  const editarAgrupador = g => (modal = { grupo: true, agrupador: g, dentro: g ? grupos.miembros(g).map(e => e.id) : [] })
  function guardarAgrupador({ titulo, color, letra, ids }) {
    const g = modal.agrupador
    if (g) grupos.editar(g, { titulo, color, letra, ids })
    else {
      const els = elementos().filter(e => ids.includes(e.id))
      const c = els.length ? { x: els.reduce((s, e) => s + e.caja.x + e.caja.w / 2, 0) / els.length, y: els.reduce((s, e) => s + e.caja.y + e.caja.h / 2, 0) / els.length } : lienzo.centro()
      const libres = ocupadas.filter(x => !els.some(e => e.caja.x === x.x && e.caja.y === x.y && e.caja.w === x.w))
      grupos.crear(titulo, color, ids, (w, h) => lugarLibre(libres, w, h, c.x, c.y, 40), letra)
      avisar('Agrupador creado')
    }
    modal = null
  }

  // --- Clavar en el lienzo general ---
  function clavar(lista, t) {
    const puesta = alternarClavada(lista, t, (w, h) => lugarEnGeneral(fid, w, h), medir)
    guardar()
    avisar(puesta ? 'Clavada en el lienzo general' : 'Quitada del lienzo general')
  }

  // --- Arrastre, tarjetas y conexiones ---
  function arrastre(obj) {
    let x0, y0
    return {
      inicio: () => { grupos.fijar(); x0 = obj.x; y0 = obj.y },
      mover: (dx, dy) => { obj.x = Math.round(x0 + dx); obj.y = Math.round(y0 + dy) },
      fin: () => { grupos.soltado(obj.id); guardarProyecto(p) }
    }
  }

  function tocar(id, abrir) {
    if (!conectando) return abrir()
    if (!conectando.desde) conectando = { desde: id }
    else if (conectando.desde !== id) {
      modal = { conexion: { desde: conectando.desde, hasta: id, etiqueta: '' }, nueva: true }
      conectando = null
    }
  }

  function crear(lista, datos) {
    const c = lienzo.centro()
    modal = { lista, o: nuevaTarjeta(lista, c.x, c.y, datos, ocupadas), nueva: true }
  }

  async function nuevaFoto(e) {
    const input = e.currentTarget
    const archivo = input.files?.[0]
    input.value = ''
    if (!archivo) return
    try {
      const { original, extension, ...datos } = await prepararFoto(archivo)
      crear('fotos', datos)
      modal.original = { blob: original, extension }
    } catch { avisar('No se pudo leer la imagen') }
  }

  async function guardarModal() {
    if (modal.nueva && modal.original) await guardarOriginalFoto(modal.o, modal.original.blob, modal.original.extension)
    guardarTarjeta(asegurar(), modal.lista, modal.o, modal.nueva, ocupadas)
    guardar()
    modal = null
  }
  function transcripcionTardia(id, texto) {
    const t = asegurar().audios?.find(x => x.id === id)
    if (!t || t.transcripcion?.trim()) return
    t.transcripcion = texto
    guardar()
  }
  function eliminarModal() {
    eliminarTarjeta(asegurar(), modal.lista, modal.o.id)
    guardar()
    modal = null
  }
  function duplicarModal() {
    const s = asegurar()
    guardarTarjeta(s, modal.lista, modal.o, false)
    const d = duplicarTarjeta(s, modal.lista, modal.o)
    delete d.en_general // la copia se queda solo en la lectura hasta que se clave
    guardar()
    modal = { lista: modal.lista, o: copia(d) }
    avisar('Tarjeta duplicada')
  }

  function guardarConexion(c, nueva) {
    const s = asegurar(), datos = copia(c)
    if (nueva) s.conexiones.push({ ...datos, id: idLocal('con') })
    else Object.assign(s.conexiones.find(x => x.id === datos.id), datos)
    guardar()
    modal = null
  }
  function eliminarConexion(id) {
    const s = asegurar()
    s.conexiones = s.conexiones.filter(c => c.id !== id)
    guardar()
    modal = null
  }

  // --- Pegar (Ctrl+V) o soltar texto / imágenes / audios ---
  async function insertar(archivos, texto, x, y, html = '') {
    const s = asegurar()
    let n = 0
    for (const archivo of archivos) {
      try {
        const titulo = /^(image|audio|recording)\.\w+$/i.test(archivo.name) ? '' : archivo.name.replace(/\.[^.]+$/, '')
        if (archivo.type.startsWith('audio/')) {
          s.audios.push(nuevaTarjeta('audios', x, y, { ...(await analizar(archivo)), audio: await aDataURL(archivo), transcripcion: titulo }, ocupadas))
        } else {
          const { original, extension, ...datos } = await prepararFoto(archivo)
          s.fotos.push(nuevaTarjeta('fotos', x, y, { ...datos, titulo }, ocupadas))
          await guardarOriginalFoto(s.fotos.at(-1), original, extension)
        }
        n++
      } catch { avisar(`No se pudo leer ${archivo.name}`) }
    }
    const tabla = !archivos.length && tablaDelPortapapeles(html, texto)
    if (tabla) {
      (s.tablas ||= []).push(nuevaTarjeta('tablas', x, y, tabla, ocupadas))
      n++
    } else if (!archivos.length && texto.trim()) {
      s.notas.push(nuevaTarjeta('notas', x, y, { texto: texto.trim().slice(0, 4000) }, ocupadas))
      n++
    }
    guardar()
    if (n) avisar(n === 1 ? 'Tarjeta agregada' : `${n} tarjetas agregadas`)
  }

  function pegar(e) {
    if (modal || document.querySelector('dialog[open]')) return
    if (e.target.closest?.('input, textarea, [contenteditable], .visor')) return
    const dt = e.clipboardData
    if (!dt) return
    const imagenes = [...dt.files].filter(x => /^(image|audio)\//.test(x.type))
    const texto = imagenes.length ? '' : dt.getData('text/plain')
    if (!imagenes.length && !texto.trim()) return
    e.preventDefault()
    const c = lienzo.centro()
    insertar(imagenes, texto, c.x, c.y, imagenes.length ? '' : dt.getData('text/html'))
  }

  function soltar(e) {
    const archivos = [...(e.dataTransfer?.files || [])]
    if (archivos.some(x => /\.json$/i.test(x.name))) return
    const imagenes = archivos.filter(x => /^(image|audio)\//.test(x.type))
    const texto = imagenes.length ? '' : e.dataTransfer?.getData('text/plain') || ''
    if (!imagenes.length && !texto.trim()) return
    e.preventDefault()
    e.stopPropagation()
    const pt = lienzo.aMundo(e.clientX, e.clientY)
    insertar(imagenes, texto, pt.x, pt.y)
  }

  function teclas(e) {
    if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return
    if (V.archivo) return // Esc cierra primero el visor
    if (conectando) conectando = null
    else cerrar()
  }

  async function leer() {
    if (!f) return
    await abrirDocumentoFuente(f, p.id)
  }

  // Con el visor abierto a la derecha, el lienzo de lectura ocupa el resto (en el celular, todo).
  const conVisor = $derived(!!V.archivo && !V.grande)

  // Si la fuente deja de existir, se cierra solo.
  $effect(() => { if (!f) cerrar() })
</script>

{#snippet conexionesSvg()}
  {#each o.conexiones as con (con.id)}
    {@const a = puntoDe(con.desde)}
    {@const b = puntoDe(con.hasta)}
    {#if a && b}
      {@const ruta = corcho ? rutaHilo(a, b) : con.desde === fid || con.hasta === fid
        ? { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        : rutaConexion(a, b, caja)}
      {#if corcho}<path d={ruta.d} class="hilo-sombra" />{/if}
      <path d={ruta.d} class="conexion" class:hilo={corcho} />
      {#if con.etiqueta && !lejos}
        {@const w = (S.tipografias, ancho(con.etiqueta, F.mini)) + 16}
        <g class="etq" transform="translate({ruta.x - w / 2} {ruta.y - 9})" role="button" tabindex="0" aria-label="Conexión: {con.etiqueta}"
          onpointerdown={e => e.stopPropagation()} onclick={() => (modal = { conexion: copia(con) })} onkeydown={e => e.key === 'Enter' && (modal = { conexion: copia(con) })}>
          <rect width={w} height="18" rx="9" />
          <text x={w / 2} y="12.5" text-anchor="middle">{con.etiqueta}</text>
        </g>
      {:else}
        <circle cx={ruta.x} cy={ruta.y} r={corcho ? 4.5 : 6} class="etq-punto" class:nudo={corcho} role="button" tabindex="0" aria-label="Editar conexión"
          onpointerdown={e => e.stopPropagation()} onclick={() => (modal = { conexion: copia(con) })} onkeydown={e => e.key === 'Enter' && (modal = { conexion: copia(con) })} />
      {/if}
    {/if}
  {/each}
{/snippet}

<svelte:window onkeydown={teclas} onpaste={pegar} />

{#if f}
<section class="lectura-panel" class:con-visor={conVisor} aria-label="Lienzo de lectura de {rotulo}" ondragover={e => e.preventDefault()} ondrop={soltar}>
  <header class="sub-cab">
    <span class="chip"><Icono nombre="doc" tam={12} trazo={2} />Lectura</span>
    <span class="sub-titulo" title={f.titulo}>{rotulo}<span class="suave">&nbsp;· {f.titulo}</span></span>
    <label for="buscar-lectura" class="sr-only">Buscar en la lectura</label>
    <input id="buscar-lectura" class="buscar solo-escritorio" type="search" placeholder="Buscar en esta lectura…" bind:value={q} />
    {#if tieneDoc && !V.archivo}
      <button class="btn chico" onclick={leer} title="Abrir el documento al lado para leer y citar"><Icono nombre="libro" tam={13} /><span class="solo-escritorio">Abrir documento</span></button>
    {/if}
    <button class="icono-btn" aria-label="Cerrar lienzo de lectura" title="Volver al lienzo general (Esc)" onclick={cerrar}><Icono nombre="cerrar" tam={18} trazo={2} /></button>
  </header>

  <div class="sub-cuerpo">
    <Lienzo bind:this={lienzo} bind:simple={lejos} bind:ventana {pesado} {limites} {corcho} cursor={conectando ? 'conectando' : ''} alTocarFondo={() => { if (conectando) conectando = null }}>
      {#each agrupadoresVista as g (g.id)}
        <Agrupador {g} caja={cajasGrupos.get(g.id)} resaltado={destacado === g.id} alTocar={() => editarAgrupador(g)} arrastre={grupos.arrastre(g)} />
      {/each}

      {#if !corcho}{@render conexionesSvg()}{/if}

      <!-- La fuente al centro -->
      <Arrastrable transform="translate({-FW / 2} {-fh / 2})" clase="fuente-centro {conectando?.desde === fid ? 'origen' : ''}"
        etiqueta="Fuente: {rotulo}" alTocar={() => tocar(fid, abrirFicha)}>
        <rect x="0" y="6" width={FW} height={fh} rx="16" fill="rgba(46,75,94,.10)" />
        <rect width={FW} height={fh} rx="16" class="fc-caja" />
        <text x="24" y="36" class="fc-rotulo">{rotulo.toUpperCase()}</text>
        {#each lineas as l, i}<text x="24" y={66 + i * 27} class="fc-titulo">{l}</text>{/each}
        <text x="24" y={fh - 18} class="fc-sub">{cuenta.total} {cuenta.total === 1 ? 'tarjeta' : 'tarjetas'} · {cuenta.clavadas} en el lienzo general</text>
      </Arrastrable>

      {#each LISTAS as l (l)}
        {#each tarjVista[l] as t (t.id)}
          {@const coin = !!q && coincideTarjeta(t, q)}
          <Tarjeta lista={l} o={t} origen={conectando?.desde === t.id} resaltado={coin || destacado === t.id} atenuado={!!q && !coin}
            alVinculo={() => abrirOrigen(t.origen, p.id, t.id)} clavar={() => clavar(l, t)}
            alTocar={() => tocar(t.id, () => (modal = { lista: l, o: copia(t) }))}
            alternar={i => { alternarTarea(t, i); guardar() }} {...arrastre(t)} redimensionar={l === 'fotos' ? redimensionarFoto(t, guardar) : null} />
        {/each}
      {/each}

      {#each agrupadoresVista as g (g.id)}
        <Agrupador {g} caja={cajasGrupos.get(g.id)} capa="frente" n={cuantos.get(g.id)} {lejos} alTocar={() => editarAgrupador(g)} arrastre={grupos.arrastre(g)} />
      {/each}

      {#if corcho}
        {@render conexionesSvg()}
        <Chinchetas cajas={chinchetas} />
      {/if}
    </Lienzo>

    <div class="barra" role="toolbar" aria-label="Herramientas del lienzo de lectura">
      <button class="icono-btn" aria-label="Añadir nota" title="Nota" onclick={() => crear('notas')}><Icono nombre="nota" /></button>
      <button class="icono-btn" aria-label="Añadir lista de tareas" title="Lista de tareas" onclick={() => crear('listas')}><Icono nombre="tareas" /></button>
      <button class="icono-btn" aria-label="Añadir tabla" title="Tabla (también puedes pegar una de Excel, Word o Markdown con Ctrl+V)" onclick={() => crear('tablas')}><Icono nombre="tabla" /></button>
      <button class="icono-btn" aria-label="Grabar nota de voz" title="Nota de voz" onclick={() => crear('audios')}><Icono nombre="mic" /></button>
      <button class="icono-btn" aria-label="Añadir foto" title="Foto" onclick={() => entradaFoto.click()}><Icono nombre="foto" /></button>
      <input bind:this={entradaFoto} type="file" accept="image/*" hidden onchange={nuevaFoto} />
      <button class="icono-btn" aria-label="Conectar elementos" title="Conectar elementos" aria-pressed={!!conectando}
        onclick={() => (conectando = conectando ? null : { desde: null })}><Icono nombre="enlace" /></button>
      <button class="icono-btn" aria-label="Agrupar elementos" title="Agrupador: un recuadro con nombre que reúne varios elementos" onclick={() => editarAgrupador(null)}><Icono nombre="agrupar" /></button>
    </div>

    {#if conectando}
      <div class="pista-conexion">
        {conectando.desde ? 'Ahora toca el segundo elemento' : 'Toca el primer elemento a conectar'}
        <button class="btn chico fantasma" onclick={() => (conectando = null)}>Cancelar</button>
      </div>
    {/if}

    {#if !hayTarjetas}
      <div class="vacio">
        <p class="serif">Tu espacio para este paper</p>
        <p class="suave">Las notas con citas y los recortes que hagas en el documento llegan aquí. Toca la <b>chincheta</b> de una tarjeta para clavarla también en el lienzo general del proyecto.</p>
        <div class="fila">
          {#if tieneDoc}<button class="btn primario chico" onclick={leer}>Abrir documento</button>{/if}
          <button class="btn chico" onclick={() => crear('notas')}>Nueva nota</button>
        </div>
      </div>
    {/if}
  </div>
</section>
{/if}

{#if modal?.lista}
  {#key modal.o.id}
    {#if modal.lista === 'fotos'}
      <VisorFoto bind:o={modal.o} nueva={modal.nueva} vinculos={modal.nueva ? [] : vinculosDe(o, modal.o.id, nombreDe)} onvinculo={() => { const t = modal.o; modal = null; abrirOrigen(t.origen, p.id, t.id) }}
        onguardar={guardarModal} oneliminar={eliminarModal} onduplicar={duplicarModal} onclose={() => (modal = null)} />
    {:else}
      <EditorTarjeta lista={modal.lista} bind:o={modal.o} nueva={modal.nueva} vinculos={modal.nueva ? [] : vinculosDe(o, modal.o.id, nombreDe)} onvinculo={() => { const t = modal.o; modal = null; abrirOrigen(t.origen, p.id, t.id) }}
        onguardar={guardarModal} oneliminar={eliminarModal} onduplicar={duplicarModal} ontranscripcion={transcripcionTardia} onclose={() => (modal = null)} />
    {/if}
  {/key}
{:else if modal?.grupo}
  <EditorAgrupador nuevo={!modal.agrupador} titulo={modal.agrupador?.titulo || ''} color={modal.agrupador?.color || 'azul'} letra={modal.agrupador?.letra}
    elementos={elementos().map(({ id, nombre, tipo }) => ({ id, nombre, tipo }))} dentro={modal.dentro}
    onguardar={guardarAgrupador} onclose={() => (modal = null)}
    oneliminar={() => { grupos.eliminar(modal.agrupador); modal = null }}
    onacomodar={() => { grupos.acomodar(modal.agrupador); modal = null }} />
{:else if modal?.conexion}
  <Modal titulo={modal.nueva ? 'Nueva conexión' : 'Conexión'} onclose={() => (modal = null)} ancho={420}>
    <!-- svelte-ignore a11y_autofocus -->
    <label class="campo"><span>Etiqueta (opcional)</span><input type="text" bind:value={modal.conexion.etiqueta} placeholder="contradice" autofocus /></label>
    <div class="fila entre">
      {#if !modal.nueva}<button class="btn peligro" onclick={() => eliminarConexion(modal.conexion.id)}>Eliminar</button>{:else}<span></span>{/if}
      <button class="btn primario" onclick={() => guardarConexion(modal.conexion, modal.nueva)}>Guardar</button>
    </div>
  </Modal>
{/if}

<style>
  .lectura-panel {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 12;
    display: flex; flex-direction: column; background: var(--paper);
  }
  /* El visor (fijo a la derecha) mide min(50vw, 900px), con un mínimo de 420px. */
  .lectura-panel.con-visor { right: max(420px, min(50vw, 900px)); }
  .sub-cab { display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; border-bottom: 1px solid var(--line); }
  .sub-cab .chip { flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; }
  .sub-cab .btn { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .sub-titulo { flex-grow: 1; min-width: 0; font: 600 15px var(--serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub-titulo .suave { font: 400 13px var(--sans); }
  .buscar { width: 200px; padding: 6px 10px; font-size: 13px; }
  .sub-cuerpo { flex-grow: 1; display: flex; position: relative; min-height: 0; }

  .barra {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 5;
    display: flex; align-items: center; gap: 4px; background: var(--paper); border: 1px solid var(--line);
    border-radius: 12px; padding: 6px; box-shadow: 0 4px 14px rgba(33, 31, 26, .12); white-space: nowrap;
    max-width: calc(100% - 16px); overflow-x: auto; scrollbar-width: none;
  }
  .pista-conexion {
    position: absolute; top: 66px; left: 50%; transform: translateX(-50%); z-index: 5; font-size: 13px;
    background: var(--accent); color: var(--paper); border-radius: 999px; padding: 4px 6px 4px 14px; display: flex; align-items: center; gap: 6px; white-space: nowrap;
  }
  .pista-conexion .btn { color: var(--paper); }
  .vacio {
    position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); z-index: 4; text-align: center;
    background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 16px 20px; box-shadow: 0 4px 14px rgba(33,31,26,.1);
    width: min(420px, calc(100% - 32px));
  }
  .vacio p { margin: 0 0 6px; font-size: 13px; line-height: 1.5; }
  .vacio .serif { font-size: 16px; }
  .vacio .fila { justify-content: center; margin-top: 10px; }

  .conexion { fill: none; stroke: var(--accent); stroke-opacity: .55; stroke-width: 1.5; stroke-dasharray: 5 4; pointer-events: none; }
  .conexion.hilo { stroke: #B3261E; stroke-opacity: 1; stroke-width: 2.2; stroke-dasharray: none; stroke-linecap: round; }
  .etq-punto.nudo { fill: #8E1B14; stroke: #B3261E; }
  .hilo-sombra { fill: none; stroke: rgba(0, 0, 0, .22); stroke-width: 2.6; transform: translate(1.5px, 3px); pointer-events: none; }
  .etq { cursor: pointer; }
  .etq rect { fill: var(--paper); stroke: var(--accent); }
  .etq text { font: 400 10px var(--sans); fill: var(--accent); }
  .etq-punto { fill: var(--paper); stroke: var(--accent); cursor: pointer; }
  :global(.fuente-centro) { cursor: pointer; }
  .fc-caja { fill: var(--paper); stroke: var(--accent); stroke-width: 2; }
  :global(.fuente-centro.origen) .fc-caja { stroke-width: 4; }
  .fc-rotulo { font: 600 11px var(--sans); fill: var(--accent); letter-spacing: .06em; }
  .fc-titulo { font: 600 20px var(--serif); fill: var(--ink); }
  .fc-sub { font: 400 12px var(--sans); fill: var(--ink-soft); }
  text { user-select: none; }

  @media (max-width: 820px) {
    .lectura-panel { z-index: 25; }
    .lectura-panel.con-visor { right: 0; }
    .barra { gap: 2px; padding: 4px; }
  }
</style>
