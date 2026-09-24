<script>
  // Vista de un proyecto: nodo central + fuentes alrededor, notas, fotos y conexiones (mockup 2-tesis-hub).
  import Lienzo from '../components/Lienzo.svelte'
  import NodoFuente from '../components/NodoFuente.svelte'
  import Arrastrable from '../components/Arrastrable.svelte'
  import Icono from '../components/Icono.svelte'
  import Modal from '../components/Modal.svelte'
  import FuenteModal from '../components/FuenteModal.svelte'
  import AgregarFuente from '../components/AgregarFuente.svelte'
  import ProyectoForm from '../components/ProyectoForm.svelte'
  import ObjetivoLienzo from '../components/ObjetivoLienzo.svelte'
  import Tarjeta from '../components/Tarjeta.svelte'
  import EditorTarjeta from '../components/EditorTarjeta.svelte'
  import { LISTAS, cajas, coincideTarjeta, nombreTarjeta } from '../lib/tarjetas.js'
  import { nuevaTarjeta, guardarTarjeta, eliminarTarjeta, duplicarTarjeta, alternarTarea, vinculosDe, ancla, rutaHilo } from '../lib/tablero.js'
  import { analizar, aDataURL } from '../lib/audio.svelte.js'
  import { listaObjetivos, objetivosPorIndicador } from '../lib/objetivos.js'
  import { S, guardarProyecto, avisar } from '../lib/store.svelte.js'
  import { estadoDeCitas, autorCorto, anio, coincide, TIPOS_PROYECTO, ESTADOS_USO } from '../lib/citas.js'
  import { F, envolver, ancho } from '../lib/texto.js'
  import { NODO_W, alturaNodo, radial, porTema, limitesDe, rutaConexion } from '../lib/grafo.js'
  import { descargarBib } from '../lib/io.svelte.js'
  import { comprimirFoto } from '../lib/imagen.js'
  import { R } from '../lib/celular.svelte.js'

  let { p, fid = null, oid = null, abrirDatos, abrirCelular, atras } = $props()

  const cv = $derived(p.canvas)
  const citas = $derived(S.citasPorProyecto.get(p.id) || [])
  const porFuente = $derived.by(() => {
    const m = new Map()
    for (const c of citas) (m.get(c.fuente_id) ?? m.set(c.fuente_id, []).get(c.fuente_id)).push(c)
    return m
  })
  const fuentes = $derived(
    [...porFuente.keys()].map(id => S.fuentePorId.get(id)).filter(Boolean)
      .sort((a, b) => autorCorto(a).localeCompare(autorCorto(b), 'es') || String(a.anio).localeCompare(String(b.anio)))
  )
  const estados = $derived(new Map(fuentes.map(f => [f.id, estadoDeCitas(porFuente.get(f.id))])))
  const conteo = $derived.by(() => {
    const c = { usando: 0, revisado_no_usado: 0, no_revisado: 0 }
    for (const e of estados.values()) c[e]++
    return c
  })
  const nCitas = $derived(citas.filter(c => c.cita_en_texto).length)

  // --- Disposición ---
  const HUB_W = 420
  const hubLineas = $derived((S.tipografias, envolver(p.titulo, F.hub, HUB_W - 52, 4)))
  // Objetivos: chips en la tarjeta del título que abren su sub-lienzo.
  const objetivos = $derived(listaObjetivos(p))
  const indObjetivos = $derived(objetivosPorIndicador(p))
  const chipsObj = $derived.by(() => {
    S.tipografias
    let x = 26
    return objetivos.map(o => {
      const w = ancho(o.corto, '600 11px "Work Sans", sans-serif') + 22
      const c = { ...o, x, w }
      x += w + 6
      return c
    }).filter(c => c.x + c.w <= HUB_W - 20)
  })
  const filaObj = $derived(chipsObj.length ? 34 : 0)
  const hubH = $derived(22 + 22 + 10 + hubLineas.length * 27 + 6 + 16 + 22 + filaObj)
  const chipTipo = $derived((TIPOS_PROYECTO[p.tipo] || 'Tesis').toUpperCase())
  const chipW = $derived((S.tipografias, ancho(chipTipo, '600 11px "Work Sans", sans-serif') + chipTipo.length * 0.5 + 20))
  const items = $derived(fuentes.map(f => ({ id: f.id, f, h: alturaNodo(false, !!f.etiquetas?.length) })))
  const itemPorId = $derived(new Map(items.map(it => [it.id, it])))
  const base = $derived((S.tipografias, cv.modo === 'tema' ? porTema(items, it => it.f.tema, HUB_W, hubH) : { pos: radial(items), grupos: [] }))
  const posDe = id => (cv.modo === 'libre' && cv.posiciones[id]) || base.pos.get(id)

  // Tarjetas libres (notas, listas, notas de voz, fotos) y sus cajas.
  const tarj = $derived(cajas(cv))
  const corcho = $derived(!!cv.corcho)
  const hayTarjetas = $derived(LISTAS.some(l => cv[l]?.length))

  function cajaDe(id) {
    if (id === 'hub') return { x: -HUB_W / 2, y: -hubH / 2, w: HUB_W, h: hubH }
    const it = itemPorId.get(id)
    if (it) { const q = posDe(id); return q && { x: q.x, y: q.y, w: NODO_W, h: it.h } }
    return tarj.get(id) || null
  }
  const centroDe = id => (id === 'hub' ? { x: 0, y: 0 } : ancla(cajaDe(id), false))
  const puntoDe = id => ancla(cajaDe(id), corcho)

  function nombreDe(id) {
    if (id === 'hub') return `Proyecto: ${p.titulo}`
    const f = S.fuentePorId.get(id)
    if (f) return `${autorCorto(f)} (${anio(f)})`
    const t = tarj.get(id)
    return t ? nombreTarjeta(t.lista, t.obj) : id
  }

  const ocupadas = $derived([
    { x: -HUB_W / 2, y: -hubH / 2, w: HUB_W, h: hubH },
    ...items.map(it => { const q = posDe(it.id); return { x: q.x, y: q.y, w: NODO_W, h: it.h } }),
    ...[...tarj.values()].map(({ x, y, w, h }) => ({ x, y, w, h }))
  ])
  const limites = $derived(limitesDe(ocupadas, 40))

  // --- Interacción ---
  let lienzo
  let q = $state('')
  let ficha = $state(false)
  let modal = $state(null) // 'agregar' | 'ficha' | { lista, o, nueva } | { conexion }
  let conectando = $state(null) // null | { desde }
  let entradaFoto

  const guardar = () => guardarProyecto(p)
  const copia = o => $state.snapshot(o)

  /** Al arrastrar en Radial / Por tema, se congela lo que se ve y se pasa a Libre. */
  function fijarLibre() {
    if (cv.modo === 'libre') return
    const nuevas = {}
    for (const it of items) {
      const q0 = base.pos.get(it.id)
      nuevas[it.id] = { x: Math.round(q0.x), y: Math.round(q0.y) }
    }
    cv.posiciones = nuevas
    cv.modo = 'libre'
  }

  function arrastreFuente(id) {
    let x0, y0
    return {
      inicio: () => { fijarLibre(); ({ x: x0, y: y0 } = posDe(id)) },
      mover: (dx, dy) => { cv.posiciones[id] = { x: Math.round(x0 + dx), y: Math.round(y0 + dy) } },
      fin: guardar
    }
  }

  function arrastreLibre(obj) {
    let x0, y0
    return {
      inicio: () => { x0 = obj.x; y0 = obj.y },
      mover: (dx, dy) => { obj.x = Math.round(x0 + dx); obj.y = Math.round(y0 + dy) },
      fin: guardar
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

  const rutaObjetivo = $derived(oid ? `#/p/${p.id}/o/${oid}` : `#/p/${p.id}`)
  const abrirFuente = id => (location.hash = `${rutaObjetivo}/f/${id}`)
  const cerrarFuente = () => atras(rutaObjetivo)
  const abrirObjetivo = clave => {
    ficha = false
    if (clave === oid) return
    if (oid) location.replace(`#/p/${p.id}/o/${clave}`)
    else location.hash = `#/p/${p.id}/o/${clave}`
  }
  const cerrarObjetivo = () => atras(`#/p/${p.id}`)
  const fuenteAbierta = $derived(fid ? S.fuentePorId.get(fid) : null)

  // --- Tarjetas: crear, editar, duplicar ---
  function crear(lista, datos) {
    const c = lienzo.centro()
    modal = { lista, o: nuevaTarjeta(lista, c.x, c.y, datos, ocupadas), nueva: true }
  }
  const abrirTarjeta = (lista, o) => (modal = { lista, o: copia(o) })

  async function nuevaFoto(e) {
    const input = e.currentTarget
    const archivo = input.files?.[0]
    input.value = ''
    if (!archivo) return
    try { crear('fotos', await comprimirFoto(archivo)) } catch { avisar('No se pudo leer la imagen') }
  }

  function guardarModal() {
    guardarTarjeta(cv, modal.lista, modal.o, modal.nueva, ocupadas)
    guardar()
    modal = null
  }
  function eliminarModal() {
    eliminarTarjeta(cv, modal.lista, modal.o.id)
    guardar()
    modal = null
  }
  function duplicarModal() {
    guardarTarjeta(cv, modal.lista, modal.o, false)
    const d = duplicarTarjeta(cv, modal.lista, modal.o)
    guardar()
    modal = { lista: modal.lista, o: copia(d) }
    avisar('Tarjeta duplicada')
  }
  function alternar(o, i) {
    alternarTarea(o, i)
    guardar()
  }

  // --- Pegar (Ctrl+V) o soltar texto / imágenes / audios sobre el lienzo ---
  let soltando = $state(false)
  let tSoltar

  /** Crea tarjetas a partir de archivos (imágenes y audios) o texto, a partir del punto (x, y). */
  async function insertar(archivos, texto, x, y) {
    let n = 0
    for (const archivo of archivos) {
      try {
        const titulo = /^(image|audio|recording)\.\w+$/i.test(archivo.name) ? '' : archivo.name.replace(/\.[^.]+$/, '')
        if (archivo.type.startsWith('audio/')) {
          cv.audios.push(nuevaTarjeta('audios', x, y, { ...(await analizar(archivo)), audio: await aDataURL(archivo), transcripcion: titulo }, ocupadas))
        } else {
          cv.fotos.push(nuevaTarjeta('fotos', x, y, { ...(await comprimirFoto(archivo)), titulo }, ocupadas))
        }
        n++
      } catch { avisar(`No se pudo leer ${archivo.name}`) }
    }
    if (!archivos.length && texto.trim()) {
      cv.notas.push(nuevaTarjeta('notas', x, y, { texto: texto.trim().slice(0, 4000) }, ocupadas))
      n++
    }
    guardar()
    avisar(n === 1 ? 'Tarjeta agregada' : `${n} tarjetas agregadas`)
  }

  function pegar(e) {
    if (modal || fuenteAbierta || oid || document.querySelector('dialog[open]')) return
    if (e.target.closest?.('input, textarea, [contenteditable]')) return
    const dt = e.clipboardData
    if (!dt) return
    const imagenes = [...dt.files].filter(f => /^(image|audio)\//.test(f.type))
    const texto = imagenes.length ? '' : dt.getData('text/plain')
    if (!imagenes.length && !texto.trim()) return
    e.preventDefault()
    const c = lienzo.centro()
    insertar(imagenes, texto, c.x, c.y)
  }

  /** Datos arrastrados que el lienzo puede recibir (los .json los importa la app). */
  function recibible(dt) {
    const archivos = [...(dt?.files || [])]
    if (archivos.some(f => /\.json$/i.test(f.name))) return null
    const imagenes = archivos.filter(f => /^(image|audio)\//.test(f.type))
    const texto = imagenes.length ? '' : dt?.getData('text/plain') || ''
    return imagenes.length || texto.trim() ? { imagenes, texto } : null
  }

  function sobreLienzo(e) {
    const tipos = [...(e.dataTransfer?.types || [])]
    if (!tipos.includes('Files') && !tipos.includes('text/plain')) return
    soltando = true
    clearTimeout(tSoltar)
    tSoltar = setTimeout(() => (soltando = false), 150)
  }

  function soltarEnLienzo(e) {
    soltando = false
    if (oid) return
    const r = recibible(e.dataTransfer)
    if (!r) return
    e.preventDefault()
    e.stopPropagation()
    const p = lienzo.aMundo(e.clientX, e.clientY)
    insertar(r.imagenes, r.texto, p.x, p.y)
  }


  function guardarConexion(c, nueva) {
    const datos = copia(c)
    if (nueva) cv.conexiones.push({ ...datos, id: 'con_' + Date.now().toString(36) })
    else Object.assign(cv.conexiones.find(x => x.id === datos.id), datos)
    guardar()
    modal = null
  }

  function eliminarConexion(id) {
    cv.conexiones = cv.conexiones.filter(c => c.id !== id)
    guardar()
    modal = null
  }

  function cambiarModo(m) {
    if (cv.modo === m) return
    cv.modo = m
    guardar()
    requestAnimationFrame(() => lienzo?.encuadrar())
  }

  function alternarCorcho() {
    cv.corcho = !cv.corcho
    guardar()
  }
  const editarConexion = con => (modal = { conexion: copia(con) })
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && conectando && (conectando = null)} onpaste={pegar} />

<header class="cabecera">
  <button class="icono-btn solo-movil" aria-label="Ficha del proyecto" onclick={() => (ficha = !ficha)}><Icono nombre="menu" tam={18} /></button>
  <a class="logo solo-escritorio" href="#/" aria-label="Inicio">C</a>
  <nav class="migas">
    <a href="#/" class="solo-escritorio">Proyectos</a>
    <span class="suave solo-escritorio"><Icono nombre="chevron" tam={14} trazo={2} /></span>
    <span class="titulo">{p.titulo}</span>
  </nav>
  <div class="espacio"></div>
  <label for="buscar-fuente" class="sr-only">Buscar fuentes</label>
  <input id="buscar-fuente" class="buscar" type="search" placeholder="Buscar fuente..." bind:value={q} />
  <a class="btn solo-escritorio" href="#/citas/{p.id}">Vista de citas</a>
  <a class="icono-btn solo-movil" href="#/citas/{p.id}" aria-label="Vista de citas"><Icono nombre="lista" tam={18} /></a>
  <button class="btn solo-escritorio" onclick={() => descargarBib(fuentes, 'bibliografia.bib')}>Exportar .bib</button>
<button class="icono-btn celular-btn" aria-label="Celular y PixPin" title="Pasar archivos con el celular o PixPin" onclick={abrirCelular}><Icono nombre="celular" tam={18} />{#if R.recibidos.length}<span class="insignia">{R.recibidos.length}</span>{/if}</button>
  <button class="icono-btn" aria-label="Configuración" title="Configuración" onclick={abrirDatos}><Icono nombre="ajustes" tam={18} /></button>
</header>

<div class="cuerpo" class:soltando role="region" aria-label="Lienzo del proyecto" ondragover={sobreLienzo} ondrop={soltarEnLienzo}>
  <button class="velo" class:abierto={ficha} aria-label="Cerrar ficha" onclick={() => (ficha = false)}></button>
  <aside class="panel" class:abierto={ficha} style="width:320px">
    <span class="chip">{TIPOS_PROYECTO[p.tipo] || 'Tesis'}</span>
    {#if p.area}<div class="suave area">{p.area}</div>{/if}
    {#if objetivos.length}
      <div>
        <div class="rotulo sub">Objetivos</div>
        <div class="objetivos">
          {#each objetivos as o (o.clave)}
            <button class="objetivo" class:activo={oid === o.clave} onclick={() => abrirObjetivo(o.clave)} title="Abrir el lienzo de {o.rotulo.toLowerCase()}">
              <span class="obj-corto">{o.corto}</span><span class="obj-texto">{o.texto}</span>
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div>
        <div class="rotulo sub">Objetivos</div>
        <div class="texto suave">— Agrégalos en la ficha para desarrollar cada uno en su propio lienzo.</div>
      </div>
    {/if}
    {#if p.indicadores.length}
      <div>
        <div class="rotulo sub">Indicadores</div>
        <ul>{#each p.indicadores as t}
          <li>{t}{#each indObjetivos.get(t) || [] as c}<span class="vinculo">{c}</span>{/each}</li>
        {/each}</ul>
      </div>
    {/if}
    <button class="btn chico" onclick={() => (modal = 'ficha')}>Editar ficha</button>
    <div class="separador"></div>
    <div>
      <div class="rotulo sub2">Leyenda</div>
      <div class="leyenda">
        {#each Object.entries(ESTADOS_USO) as [e, t]}
          <div class="fila entre"><span class="fila"><span class="punto {e}"></span>{t}</span><span class="suave">{conteo[e]}</span></div>
        {/each}
      </div>
    </div>
    <div class="separador"></div>
    <div class="suave ayuda">
      Arrastra las tarjetas para acomodarlas (pasa a modo Libre). Desliza con dos dedos para mover el lienzo y pellizca para hacer zoom (con ratón: Ctrl + rueda). Toca una fuente para ver sus citas. Crea notas, listas de tareas, notas de voz y fotos desde la barra; también puedes pegar (Ctrl+V) o arrastrar texto, imágenes y audios al lienzo. El buscador también encuentra texto en notas, tareas y transcripciones. La chincheta cambia a tablero de corcho.
    </div>
  </aside>

  <Lienzo bind:this={lienzo} {limites} {corcho} cursor={conectando ? 'conectando' : ''} alTocarFondo={() => { if (conectando) conectando = null }}>
    <!-- Etiquetas de grupo (Por tema) -->
    {#each base.grupos as g}
      <text class="grupo" x={g.x} y={g.y - 4}>{g.nombre.toUpperCase()}</text>
    {/each}

    <!-- Aristas nodo central → fuentes -->
    {#each items as it (it.id)}
      {@const c = centroDe(it.id)}
      <line x1="0" y1="0" x2={c.x} y2={c.y} class="arista" />
    {/each}

    <!-- Conexiones manuales -->
    {#each cv.conexiones as con (con.id)}
      {@const a = puntoDe(con.desde)}
      {@const b = puntoDe(con.hasta)}
      {#if a && b}
        <!-- Si la recta pasaría por debajo del título, se curva alrededor de la tarjeta central.
             En el tablero de corcho es un hilo rojo que cuelga entre chinchetas. -->
        {@const ruta = corcho ? rutaHilo(a, b) : con.desde === 'hub' || con.hasta === 'hub'
          ? { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          : rutaConexion(a, b, { x: -HUB_W / 2, y: -hubH / 2, w: HUB_W, h: hubH + 6 })}
        <path d={ruta.d} class="conexion" class:hilo={corcho} />
        {#if con.etiqueta}
          {@const w = (S.tipografias, ancho(con.etiqueta, F.mini)) + 16}
          <g class="etq" transform="translate({ruta.x - w / 2} {ruta.y - 9})" role="button" tabindex="0" aria-label="Conexión: {con.etiqueta}"
            onpointerdown={e => e.stopPropagation()} onclick={() => editarConexion(con)} onkeydown={e => e.key === 'Enter' && editarConexion(con)}>
            <rect width={w} height="18" rx="9" />
            <text x={w / 2} y="12.5" text-anchor="middle">{con.etiqueta}</text>
          </g>
        {:else}
          <circle cx={ruta.x} cy={ruta.y} r="6" class="etq-punto" role="button" tabindex="0" aria-label="Editar conexión"
            onpointerdown={e => e.stopPropagation()} onclick={() => editarConexion(con)} onkeydown={e => e.key === 'Enter' && editarConexion(con)} />
        {/if}
      {/if}
    {/each}

    <!-- Nodo central: el proyecto -->
    <Arrastrable transform="translate({-HUB_W / 2} {-hubH / 2})" clase="hub {conectando?.desde === 'hub' ? 'origen' : ''}"
      etiqueta="Proyecto: {p.titulo}" alTocar={() => tocar('hub', () => (modal = 'ficha'))}>
      <rect x="0" y="6" width={HUB_W} height={hubH} rx="16" fill="rgba(46,75,94,.10)" />
      <rect width={HUB_W} height={hubH} rx="16" class="hub-caja" />
      <rect x="26" y="22" width={chipW} height="20" rx="10" fill="var(--accent-soft)" />
      <text x={26 + chipW / 2} y="36" text-anchor="middle" class="hub-chip">{chipTipo}</text>
      {#each hubLineas as l, i}<text x="26" y={72 + i * 27} class="hub-titulo">{l}</text>{/each}
      <text x="26" y={hubH - 22 - filaObj} class="hub-sub">{fuentes.length} fuentes · {nCitas} citas</text>
      {#each chipsObj as c (c.clave)}
        <g class="hub-obj" transform="translate({c.x} {hubH - 44})" role="button" tabindex="0" aria-label="Abrir lienzo de {c.rotulo.toLowerCase()}"
          onpointerdown={e => e.stopPropagation()} onclick={() => abrirObjetivo(c.clave)} onkeydown={e => e.key === 'Enter' && abrirObjetivo(c.clave)}>
          <title>{c.rotulo}: {c.texto}</title>
          <rect width={c.w} height="22" rx="11" />
          <text x={c.w / 2} y="15" text-anchor="middle">{c.corto}</text>
        </g>
      {/each}
    </Arrastrable>

    <!-- Fuentes -->
    {#each items as it (it.id)}
      {@const q0 = posDe(it.id)}
      {@const coin = !!q && coincide(it.f, q)}
      <NodoFuente
        x={q0.x} y={q0.y}
        anio={anio(it.f)} autor={autorCorto(it.f)} chips={it.f.etiquetas || []}
        estado={estados.get(it.id)}
        resaltado={coin || conectando?.desde === it.id}
        atenuado={!!q && !coin}
        pista={coin ? 'Ver citas →' : ''}
        alAbrir={() => tocar(it.id, () => abrirFuente(it.id))}
        {...arrastreFuente(it.id)}
      />
    {/each}

    <!-- Chinchetas sobre la tarjeta central y las fuentes (tablero de corcho) -->
    {#if corcho}
      {#each [cajaDe('hub'), ...items.map(it => cajaDe(it.id))] as c}
        {#if c}
          <g class="chincheta"><circle cx={c.x + c.w / 2 + 1.5} cy={c.y + 11} r="7" fill="rgba(0,0,0,.25)" /><circle cx={c.x + c.w / 2} cy={c.y + 9} r="7" fill="#C0392B" /><circle cx={c.x + c.w / 2 - 2.2} cy={c.y + 6.8} r="2" fill="rgba(255,255,255,.55)" /></g>
        {/if}
      {/each}
    {/if}

    <!-- Tarjetas libres: notas, listas de tareas, notas de voz y fotos -->
    {#each LISTAS as l (l)}
      {#each cv[l] || [] as o (o.id)}
        {@const coin = !!q && coincideTarjeta(o, q)}
        <Tarjeta lista={l} {o} {corcho} origen={conectando?.desde === o.id} resaltado={coin} atenuado={!!q && !coin}
          alTocar={() => tocar(o.id, () => abrirTarjeta(l, o))} alternar={i => alternar(o, i)} {...arrastreLibre(o)} />
      {/each}
    {/each}
  </Lienzo>

  <!-- Barra flotante -->
  <div class="barra" role="toolbar" aria-label="Herramientas del lienzo">
    <button class="icono-btn" aria-label="Añadir nota" title="Nota" onclick={() => crear('notas')}><Icono nombre="nota" /></button>
    <button class="icono-btn" aria-label="Añadir lista de tareas" title="Lista de tareas" onclick={() => crear('listas')}><Icono nombre="tareas" /></button>
    <button class="icono-btn" aria-label="Grabar nota de voz" title="Nota de voz" onclick={() => crear('audios')}><Icono nombre="mic" /></button>
    <button class="icono-btn" aria-label="Añadir foto" title="Foto" onclick={() => entradaFoto.click()}><Icono nombre="foto" /></button>
    <input bind:this={entradaFoto} type="file" accept="image/*" hidden onchange={nuevaFoto} />
    <button class="icono-btn" aria-label="Conectar elementos" title="Conectar elementos" aria-pressed={!!conectando}
      onclick={() => (conectando = conectando ? null : { desde: null })}><Icono nombre="enlace" /></button>
    <button class="icono-btn" aria-label="Tablero de corcho" title="Tablero de corcho" aria-pressed={corcho} onclick={alternarCorcho}><Icono nombre="chincheta" /></button>
    <div class="div"></div>
    <div class="segmentado">
      <button aria-pressed={cv.modo === 'radial'} onclick={() => cambiarModo('radial')}>Radial</button>
      <button aria-pressed={cv.modo === 'libre'} onclick={() => cambiarModo('libre')}>Libre</button>
      <button aria-pressed={cv.modo === 'tema'} onclick={() => cambiarModo('tema')}>Por tema</button>
    </div>
    <div class="div"></div>
    <button class="btn chico primario" onclick={() => (modal = 'agregar')}><Icono nombre="mas" tam={12} trazo={2.2} /><span class="solo-escritorio">Fuente</span></button>
  </div>

  {#if conectando}
    <div class="pista-conexion">
      {conectando.desde ? 'Ahora toca el segundo elemento' : 'Toca el primer elemento a conectar'}
      <button class="btn chico fantasma" onclick={() => (conectando = null)}>Cancelar</button>
    </div>
  {/if}

  {#if !items.length && !hayTarjetas}
    <div class="vacio-hub">
      <p class="serif">Este proyecto aún no tiene fuentes</p>
      <p class="suave">Agrégalas aquí o importa los JSON que genera la skill <b>citas-tesis</b>.</p>
      <div class="fila">
        <button class="btn primario" onclick={() => (modal = 'agregar')}>+ Agregar fuente</button>
        <button class="btn" onclick={abrirDatos}>Importar JSON</button>
      </div>
    </div>
  {/if}

  {#if oid}
    {#key oid}<ObjetivoLienzo {p} clave={oid} {abrirFuente} cerrar={cerrarObjetivo} />{/key}
  {/if}
</div>

{#if fuenteAbierta}
  {#key fuenteAbierta.id}<FuenteModal fuente={fuenteAbierta} proyectoId={p.id} onclose={cerrarFuente} />{/key}
{/if}

{#if modal === 'agregar'}
  <AgregarFuente proyectoId={p.id} onclose={() => (modal = null)} />
{:else if modal === 'ficha'}
  <ProyectoForm proyecto={p} onclose={() => (modal = null)} />
{:else if modal?.lista}
  {#key modal.o.id}
    <EditorTarjeta lista={modal.lista} bind:o={modal.o} nueva={modal.nueva} vinculos={modal.nueva ? [] : vinculosDe(cv, modal.o.id, nombreDe)}
      onguardar={guardarModal} oneliminar={eliminarModal} onduplicar={duplicarModal} onclose={() => (modal = null)} />
  {/key}
{:else if modal?.conexion}
  <Modal titulo={modal.nueva ? 'Nueva conexión' : 'Conexión'} onclose={() => (modal = null)} ancho={420}>
    <!-- svelte-ignore a11y_autofocus -->
    <label class="campo"><span>Etiqueta (opcional)</span><input type="text" bind:value={modal.conexion.etiqueta} placeholder="misma metodología" autofocus /></label>
    <div class="fila entre">
      {#if !modal.nueva}<button class="btn peligro" onclick={() => eliminarConexion(modal.conexion.id)}>Eliminar</button>{:else}<span></span>{/if}
      <button class="btn primario" onclick={() => guardarConexion(modal.conexion, modal.nueva)}>Guardar</button>
    </div>
  </Modal>
{/if}

<style>
  .buscar { width: 240px; padding: 8px 12px; font-size: 13px; }
  .area { font-size: 13px; margin-top: -10px; }
  .sub { margin-bottom: 6px; }
  .sub2 { margin-bottom: 10px; }
  .texto, ol, ul { font-size: 13px; line-height: 1.55; }
  ol, ul { margin: 0; padding-left: 18px; }
  .leyenda { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
  .leyenda .punto { width: 9px; height: 9px; }
  .ayuda { font-size: 12px; line-height: 1.5; }
  .objetivos { display: flex; flex-direction: column; gap: 4px; margin: 0 -8px; }
  .objetivo {
    display: flex; gap: 8px; align-items: flex-start; text-align: left; width: 100%; padding: 7px 8px;
    border: 1px solid transparent; border-radius: 8px; background: none; font: inherit; font-size: 13px; line-height: 1.45; color: var(--ink); cursor: pointer;
  }
  .objetivo:hover { background: var(--paper-dim); }
  .objetivo.activo { background: var(--accent-soft); border-color: var(--accent); }
  .obj-corto { flex-shrink: 0; font-size: 10.5px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 2px 7px; margin-top: 1px; }
  .objetivo.activo .obj-corto { background: var(--paper); }
  .obj-texto { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .vinculo { display: inline-block; margin-left: 5px; font-size: 10px; font-weight: 600; color: var(--using); background: var(--using-bg); border-radius: 999px; padding: 0 6px; vertical-align: 1px; }
  .hub-obj { cursor: pointer; }
  .hub-obj rect { fill: var(--paper-dim); stroke: var(--accent); stroke-opacity: .45; }
  .hub-obj:hover rect, .hub-obj:focus-visible rect { fill: var(--accent-soft); stroke-opacity: 1; }
  .hub-obj:focus { outline: none; }
  .hub-obj text { font: 600 11px var(--sans); fill: var(--accent); letter-spacing: .04em; }

  .barra {
    position: absolute; top: 16px; left: calc(50% + 160px); transform: translateX(-50%); z-index: 5;
    display: flex; align-items: center; gap: 4px; background: var(--paper); border: 1px solid var(--line);
    border-radius: 12px; padding: 6px; box-shadow: 0 4px 14px rgba(33, 31, 26, .12); max-width: calc(100% - 24px);
  }
  .div { width: 1px; height: 22px; background: var(--line); margin: 0 4px; flex-shrink: 0; }
  .pista-conexion {
    position: absolute; top: 72px; left: calc(50% + 160px); transform: translateX(-50%); z-index: 5; font-size: 13px;
    background: var(--accent); color: var(--paper); border-radius: 999px; padding: 4px 6px 4px 14px; display: flex; align-items: center; gap: 6px; white-space: nowrap;
  }
  .pista-conexion .btn { color: var(--paper); }
  .vacio-hub {
    position: absolute; left: calc(50% + 160px); bottom: 72px; transform: translateX(-50%); z-index: 4; text-align: center;
    background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 18px 22px; box-shadow: 0 4px 14px rgba(33,31,26,.1);
    width: min(440px, calc(100% - 32px));
  }
  .vacio-hub p { margin: 0 0 6px; font-size: 13px; }
  .vacio-hub .serif { font-size: 17px; }
  .vacio-hub .fila { justify-content: center; margin-top: 12px; }

  .soltando::after {
    content: 'Suelta para agregar como nota o foto'; position: absolute; inset: 10px; z-index: 30; pointer-events: none;
    display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--accent);
    border: 2px dashed var(--accent); border-radius: 14px; background: rgba(227, 233, 236, .45);
  }
  .arista { stroke: var(--ink-soft); stroke-opacity: .3; stroke-width: 1; }
  .conexion { fill: none; stroke: var(--accent); stroke-opacity: .55; stroke-width: 1.5; stroke-dasharray: 5 4; }
  .conexion.hilo { stroke: #B3261E; stroke-opacity: .85; stroke-width: 2; stroke-dasharray: none; filter: drop-shadow(0 2px 1px rgba(0, 0, 0, .25)); }
  .chincheta { pointer-events: none; }
  .etq { cursor: pointer; }
  .etq rect { fill: var(--paper); stroke: var(--accent); }
  .etq text { font: 400 10px var(--sans); fill: var(--accent); }
  .etq-punto { fill: var(--paper); stroke: var(--accent); cursor: pointer; }
  .grupo { font: 600 26px var(--serif); fill: var(--ink); opacity: .12; letter-spacing: .02em; }
  :global(.hub) { cursor: pointer; }
  .hub-caja { fill: var(--paper); stroke: var(--accent); stroke-width: 2; }
  :global(.hub.origen) .hub-caja { stroke-width: 4; }
  .hub-chip { font: 600 11px var(--sans); fill: var(--accent); letter-spacing: .04em; }
  .hub-titulo { font: 600 20px var(--serif); fill: var(--ink); }
  .hub-sub { font: 400 12px var(--sans); fill: var(--ink-soft); }

  text { user-select: none; }

  @media (max-width: 820px) {
    .buscar { width: 120px; }
    .barra { top: 10px; left: 50%; }
    .barra { gap: 2px; padding: 4px; overflow-x: auto; scrollbar-width: none; }
    .barra .div { margin: 0 1px; }
    .barra .segmentado button { padding: 6px 7px; }
    .pista-conexion { left: 50%; top: 62px; }
    .vacio-hub { left: 50%; }
  }
</style>
