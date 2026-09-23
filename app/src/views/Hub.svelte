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
  import { listaObjetivos, objetivosPorIndicador } from '../lib/objetivos.js'
  import { S, guardarProyecto, avisar } from '../lib/store.svelte.js'
  import { estadoDeCitas, autorCorto, anio, coincide, TIPOS_PROYECTO, ESTADOS_USO } from '../lib/citas.js'
  import { F, envolver, ancho } from '../lib/texto.js'
  import { NODO_W, alturaNodo, radial, porTema, limitesDe, rutaConexion } from '../lib/grafo.js'
  import { descargarBib } from '../lib/io.svelte.js'

  let { p, fid = null, oid = null, abrirDatos, atras } = $props()

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

  const NOTA_W = 168
  const notaLineas = n => (S.tipografias, envolver(n.texto || 'Nota vacía', F.nota, NOTA_W - 32, 14))
  const notaAlto = n => 28 + notaLineas(n).length * 18.75
  const fotoLineas = f => (S.tipografias, envolver(f.titulo || '', F.chico, 120, 3))

  function centroDe(id) {
    if (id === 'hub') return { x: 0, y: 0 }
    const it = itemPorId.get(id)
    if (it) { const q = posDe(id); return q && { x: q.x + NODO_W / 2, y: q.y + it.h / 2 } }
    const n = cv.notas.find(x => x.id === id)
    if (n) return { x: n.x + NOTA_W / 2, y: n.y + notaAlto(n) / 2 }
    const f = cv.fotos.find(x => x.id === id)
    if (f) return { x: f.x + 60, y: f.y + 45 }
    return null
  }

  const limites = $derived(limitesDe([
    { x: -HUB_W / 2, y: -hubH / 2, w: HUB_W, h: hubH },
    ...items.map(it => { const q = posDe(it.id); return { x: q.x, y: q.y, w: NODO_W, h: it.h } }),
    ...cv.notas.map(n => ({ x: n.x, y: n.y, w: NOTA_W, h: notaAlto(n) })),
    ...cv.fotos.map(f => ({ x: f.x, y: f.y, w: 120, h: 140 }))
  ], 40))

  // --- Interacción ---
  let lienzo
  let q = $state('')
  let ficha = $state(false)
  let modal = $state(null) // 'agregar' | 'ficha' | { nota } | { foto } | { conexion }
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

  function nuevaNota() {
    const c = lienzo.centro()
    modal = { nota: { id: 'nota_' + Date.now().toString(36), texto: '', x: Math.round(c.x - NOTA_W / 2), y: Math.round(c.y - 50) }, nueva: true }
  }

  async function comprimir(archivo) {
    const bmp = await createImageBitmap(archivo)
    const s = Math.min(1, 1024 / Math.max(bmp.width, bmp.height))
    const tela = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * s), height: Math.round(bmp.height * s) })
    tela.getContext('2d').drawImage(bmp, 0, 0, tela.width, tela.height)
    bmp.close?.()
    return tela.toDataURL('image/jpeg', 0.78)
  }

  async function nuevaFoto(e) {
    const input = e.currentTarget
    const archivo = input.files?.[0]
    input.value = ''
    if (!archivo) return
    try {
      const c = lienzo.centro()
      const foto = { id: 'foto_' + Date.now().toString(36), titulo: '', imagen: await comprimir(archivo), x: Math.round(c.x - 60), y: Math.round(c.y - 70) }
      modal = { foto, nueva: true }
    } catch { avisar('No se pudo leer la imagen') }
  }

  // --- Pegar (Ctrl+V) o soltar texto / imágenes sobre el lienzo ---
  const idLocal = prefijo => `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  let soltando = $state(false)
  let tSoltar

  async function insertar(imagenes, texto, x, y) {
    let fotos = 0
    for (const archivo of imagenes) {
      try {
        const titulo = /^image\.\w+$/i.test(archivo.name) ? '' : archivo.name.replace(/\.[^.]+$/, '')
        cv.fotos.push({ id: idLocal('foto'), titulo, imagen: await comprimir(archivo), x: Math.round(x - 60), y: Math.round(y - 45) })
        fotos++
        x += 30
        y += 30
      } catch { avisar(`No se pudo leer ${archivo.name}`) }
    }
    if (!imagenes.length && texto.trim()) {
      cv.notas.push({ id: idLocal('nota'), texto: texto.trim().slice(0, 4000), x: Math.round(x - NOTA_W / 2), y: Math.round(y - 30) })
    }
    guardar()
    avisar(fotos ? `${fotos === 1 ? 'Foto agregada' : `${fotos} fotos agregadas`}` : 'Nota agregada')
  }

  function pegar(e) {
    if (modal || fuenteAbierta || oid || document.querySelector('dialog[open]')) return
    if (e.target.closest?.('input, textarea, [contenteditable]')) return
    const dt = e.clipboardData
    if (!dt) return
    const imagenes = [...dt.files].filter(f => f.type.startsWith('image/'))
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
    const imagenes = archivos.filter(f => f.type.startsWith('image/'))
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

  function guardarElemento(lista, obj, nueva) {
    const datos = copia(obj)
    if (nueva) cv[lista].push(datos)
    else Object.assign(cv[lista].find(x => x.id === datos.id), datos)
    guardar()
    modal = null
  }

  function eliminarElemento(lista, id) {
    cv[lista] = cv[lista].filter(x => x.id !== id)
    cv.conexiones = cv.conexiones.filter(c => c.desde !== id && c.hasta !== id)
    guardar()
    modal = null
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

  const conexionesDe = id => cv.conexiones.filter(c => c.desde === id || c.hasta === id).length
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
      Arrastra las tarjetas para acomodarlas (pasa a modo Libre). Desliza con dos dedos para mover el lienzo y pellizca para hacer zoom (con ratón: Ctrl + rueda). Toca una fuente para ver sus citas. Pega (Ctrl+V) o arrastra texto o imágenes al lienzo para crear notas y fotos.
    </div>
  </aside>

  <Lienzo bind:this={lienzo} {limites} cursor={conectando ? 'conectando' : ''} alTocarFondo={() => { if (conectando) conectando = null }}>
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
      {@const a = centroDe(con.desde)}
      {@const b = centroDe(con.hasta)}
      {#if a && b}
        <!-- Si la recta pasaría por debajo del título, se curva alrededor de la tarjeta central. -->
        {@const ruta = con.desde === 'hub' || con.hasta === 'hub'
          ? { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          : rutaConexion(a, b, { x: -HUB_W / 2, y: -hubH / 2, w: HUB_W, h: hubH + 6 })}
        <path d={ruta.d} class="conexion" />
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

    <!-- Notas adhesivas -->
    {#each cv.notas as n (n.id)}
      {@const h = notaAlto(n)}
      <Arrastrable transform="translate({n.x} {n.y}) rotate(-2 {NOTA_W / 2} {h / 2})" clase="nota {conectando?.desde === n.id ? 'origen' : ''}"
        etiqueta="Nota" alTocar={() => tocar(n.id, () => (modal = { nota: copia(n) }))} {...arrastreLibre(n)}>
        <rect x="2" y="6" width={NOTA_W} height={h} rx="4" fill="rgba(33,31,26,.10)" />
        <rect width={NOTA_W} height={h} rx="4" class="nota-papel" />
        {#each notaLineas(n) as l, i}<text x="16" y={27 + i * 18.75} class="nota-txt" class:vacia={!n.texto}>{l}</text>{/each}
      </Arrastrable>
    {/each}

    <!-- Fotos -->
    {#each cv.fotos as f (f.id)}
      {@const lineas = fotoLineas(f)}
      {@const nc = conexionesDe(f.id)}
      <Arrastrable transform="translate({f.x} {f.y})" clase="foto {conectando?.desde === f.id ? 'origen' : ''}"
        etiqueta="Foto: {f.titulo}" alTocar={() => tocar(f.id, () => (modal = { foto: copia(f) }))} {...arrastreLibre(f)}>
        <clipPath id="clip-{f.id}"><rect width="120" height="90" rx="10" /></clipPath>
        <rect width="120" height="90" rx="10" fill="#E4E0D4" />
        <image href={f.imagen} width="120" height="90" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-{f.id})" />
        <rect width="120" height="90" rx="10" class="foto-borde" />
        {#each lineas as l, i}<text x="0" y={106 + i * 15} class="foto-txt">{l}</text>{/each}
        {#if nc}<text x="0" y={110 + lineas.length * 15} class="foto-con">{nc} {nc === 1 ? 'conexión' : 'conexiones'}</text>{/if}
      </Arrastrable>
    {/each}
  </Lienzo>

  <!-- Barra flotante -->
  <div class="barra" role="toolbar" aria-label="Herramientas del lienzo">
    <button class="icono-btn" aria-label="Añadir nota" title="Añadir nota" onclick={nuevaNota}><Icono nombre="nota" /></button>
    <button class="icono-btn" aria-label="Añadir foto" title="Añadir foto" onclick={() => entradaFoto.click()}><Icono nombre="foto" /></button>
    <input bind:this={entradaFoto} type="file" accept="image/*" hidden onchange={nuevaFoto} />
    <button class="icono-btn" aria-label="Conectar elementos" title="Conectar elementos" aria-pressed={!!conectando}
      onclick={() => (conectando = conectando ? null : { desde: null })}><Icono nombre="enlace" /></button>
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

  {#if !items.length && !cv.notas.length && !cv.fotos.length}
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
{:else if modal?.nota}
  <Modal titulo={modal.nueva ? 'Nueva nota' : 'Nota'} onclose={() => (modal = null)} ancho={440}>
    <!-- svelte-ignore a11y_autofocus -->
    <textarea rows="5" bind:value={modal.nota.texto} autofocus aria-label="Texto de la nota"></textarea>
    <div class="fila entre">
      {#if !modal.nueva}<button class="btn peligro" onclick={() => eliminarElemento('notas', modal.nota.id)}>Eliminar</button>{:else}<span></span>{/if}
      <button class="btn primario" onclick={() => guardarElemento('notas', modal.nota, modal.nueva)}>Guardar</button>
    </div>
  </Modal>
{:else if modal?.foto}
  <Modal titulo={modal.nueva ? 'Nueva foto' : 'Foto'} onclose={() => (modal = null)} ancho={560}>
    <img src={modal.foto.imagen} alt={modal.foto.titulo} class="foto-grande" />
    <label class="campo"><span>Descripción</span><input type="text" bind:value={modal.foto.titulo} placeholder="Foto: ensayo en laboratorio, feb. 2026" /></label>
    <div class="fila entre">
      {#if !modal.nueva}<button class="btn peligro" onclick={() => eliminarElemento('fotos', modal.foto.id)}>Eliminar</button>{:else}<span></span>{/if}
      <button class="btn primario" onclick={() => guardarElemento('fotos', modal.foto, modal.nueva)}>Guardar</button>
    </div>
  </Modal>
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
  :global(.nota), :global(.foto) { cursor: grab; }
  .nota-papel { fill: var(--nota); }
  :global(.nota.origen) .nota-papel, :global(.foto.origen) .foto-borde { stroke: var(--accent); stroke-width: 2; }
  .nota-txt { font: 400 12.5px var(--sans); fill: var(--nota-ink); pointer-events: none; }
  .nota-txt.vacia { opacity: .5; }
  .foto-borde { fill: none; stroke: var(--line); }
  .foto-txt { font: 400 11px var(--sans); fill: var(--ink-soft); pointer-events: none; }
  .foto-con { font: 400 10px var(--sans); fill: var(--accent); pointer-events: none; }
  .foto-grande { width: 100%; max-height: 50dvh; object-fit: contain; border-radius: 10px; background: var(--paper-dim); }
  text { user-select: none; }

  @media (max-width: 820px) {
    .buscar { width: 120px; }
    .barra { top: 10px; left: 50%; }
    .barra { gap: 2px; padding: 4px; }
    .barra .div { margin: 0 1px; }
    .barra .segmentado button { padding: 6px 7px; }
    .pista-conexion { left: 50%; top: 62px; }
    .vacio-hub { left: 50%; }
  }
</style>
