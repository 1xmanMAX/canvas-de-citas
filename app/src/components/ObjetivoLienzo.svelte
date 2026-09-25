<script>
  // Sub-lienzo de un objetivo de la tesis: el objetivo al centro, sus indicadores vinculados,
  // las fuentes que lo sustentan, notas y conexiones. Se abre en media pantalla y se puede agrandar.
  import Lienzo from './Lienzo.svelte'
  import NodoFuente from './NodoFuente.svelte'
  import Arrastrable from './Arrastrable.svelte'
  import Icono from './Icono.svelte'
  import Modal from './Modal.svelte'
  import { S, guardarProyecto, avisar } from '../lib/store.svelte.js'
  import { estadoDeCitas, autorCorto, anio } from '../lib/citas.js'
  import { F, envolver, ancho } from '../lib/texto.js'
  import { NODO_W, alturaNodo, limitesDe, rutaConexion } from '../lib/grafo.js'
  import { listaObjetivos, vacio } from '../lib/objetivos.js'
  import Tarjeta from './Tarjeta.svelte'
  import Chinchetas from './Chinchetas.svelte'
  import EditorTarjeta from './EditorTarjeta.svelte'
  import Agrupador from './Agrupador.svelte'
  import EditorAgrupador from './EditorAgrupador.svelte'
  import { accionesAgrupadores } from '../lib/agrupadores.js'
  import { LISTAS, TIPO, cajas, nombreTarjeta, asegurarTablero } from '../lib/tarjetas.js'
  import { lugarLibre, nuevaTarjeta, guardarTarjeta, eliminarTarjeta, duplicarTarjeta, alternarTarea, vinculosDe, ancla, rutaHilo } from '../lib/tablero.js'
  import { comprimirFoto } from '../lib/imagen.js'
  import { abrirOrigen } from '../lib/visor.svelte.js'

  let { p, clave, abrirFuente, cerrar } = $props()

  const cv = $derived(p.canvas)
  const objetivo = $derived(listaObjetivos(p).find(o => o.clave === clave))
  const VACIO = vacio()
  const o = $derived(cv.objetivos[clave] || VACIO)
  /** Crea el sub-lienzo la primera vez que se le agrega algo. */
  // Se relee desde cv.objetivos: el valor de `||=` es el objeto crudo, no su versión reactiva.
  const asegurar = () => {
    cv.objetivos[clave] ||= vacio()
    return asegurarTablero(cv.objetivos[clave])
  }
  // Al guardar, cada agrupador fija su recuadro ajustado a lo que tiene dentro.
  const guardar = () => { if (cv.objetivos[clave]) grupos.fijar(); guardarProyecto(p) }
  const copia = x => $state.snapshot(x)
  const idLocal = prefijo => `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

  let grande = $state(false)
  let lienzo
  let modal = $state(null) // 'indicadores' | 'fuentes' | { lista, o, nueva } | { indicador } | { conexion }
  let entradaFoto
  let conectando = $state(null)
  let lejos = $state(false) // zoom lejano: el Lienzo simplifica el dibujo

  // --- Datos visibles ---
  const citasProyecto = $derived(S.citasPorProyecto.get(p.id) || [])
  const fuentesProyecto = $derived.by(() => {
    const ids = [...new Set(citasProyecto.map(c => c.fuente_id))]
    return ids.map(id => S.fuentePorId.get(id)).filter(Boolean)
      .sort((a, b) => autorCorto(a).localeCompare(autorCorto(b), 'es'))
  })
  const estadoDe = fid => estadoDeCitas(citasProyecto.filter(c => c.fuente_id === fid))
  const indicadores = $derived(o.indicadores.filter(x => p.indicadores.includes(x.texto)))
  const fuentes = $derived(o.fuentes.map(x => ({ ...x, f: S.fuentePorId.get(x.id) })).filter(x => x.f))

  // --- Medidas ---
  const OBJ_W = 380, IND_W = 210
  const objLineas = $derived((S.tipografias, envolver(objetivo?.texto || '', F.hub, OBJ_W - 48, 6)))
  const objH = $derived(22 + 20 + 16 + objLineas.length * 27 + 18)
  const indLineas = x => (S.tipografias, envolver(x.texto, F.nota, IND_W - 28, 5))
  const indAlto = x => 38 + indLineas(x).length * 17
  const tarj = $derived(cajas(o))
  const corcho = $derived(!!cv.corcho)
  const hayTarjetas = $derived(LISTAS.some(l => o[l]?.length))
  const altoFuente = f => alturaNodo(false, !!f.etiquetas?.length)

  function centroDe(id) {
    if (id === 'objetivo') return { x: 0, y: 0 }
    const i = indicadores.find(x => x.id === id)
    if (i) return { x: i.x + IND_W / 2, y: i.y + indAlto(i) / 2 }
    const f = fuentes.find(x => x.id === id)
    if (f) return { x: f.x + NODO_W / 2, y: f.y + altoFuente(f.f) / 2 }
    return ancla(tarj.get(id), false)
  }
  /** Anclaje de las conexiones: en el tablero de corcho, las chinchetas de las tarjetas libres. */
  // Solo se dibujan las tarjetas cercanas a la vista (ventana del Lienzo).
  let ventana = $state(null)
  const cruza = c => !ventana || (c && c.x < ventana.x + ventana.w && c.x + c.w > ventana.x && c.y < ventana.y + ventana.h && c.y + c.h > ventana.y)
  const pesado = $derived(fuentes.length + indicadores.length + LISTAS.reduce((s, l) => s + (o[l]?.length || 0), 0) > 150)
  const tarjVista = $derived(Object.fromEntries(LISTAS.map(l => [l, (o[l] || []).filter(t => cruza(tarj.get(t.id)))])))
  const chinchetas = $derived(corcho ? [...tarj.values()].filter(cruza).map(c => ({ id: c.obj.id, x: c.x, y: c.y, w: c.w })) : [])
  const puntoDe = id => (corcho && tarj.has(id) ? ancla(tarj.get(id), true) : centroDe(id))

  function nombreDe(id) {
    if (id === 'objetivo') return objetivo?.rotulo || 'Objetivo'
    const i = indicadores.find(x => x.id === id)
    if (i) return `Indicador: ${i.texto}`
    const f = S.fuentePorId.get(id)
    if (f) return `${autorCorto(f)} (${anio(f)})`
    const t = tarj.get(id)
    return t ? nombreTarjeta(t.lista, t.obj) : id
  }

  const caja = $derived({ x: -OBJ_W / 2, y: -objH / 2, w: OBJ_W, h: objH })
  const ocupadas = $derived([
    caja,
    ...indicadores.map(x => ({ x: x.x, y: x.y, w: IND_W, h: indAlto(x) })),
    ...fuentes.map(x => ({ x: x.x, y: x.y, w: NODO_W, h: altoFuente(x.f) })),
    ...[...tarj.values()].map(({ x, y, w, h }) => ({ x, y, w, h })),
    ...[...cajasGrupos.values()]
  ])
  const limites = $derived(limitesDe(ocupadas, 40))

  // --- Vincular indicadores y fuentes (nuevos se apilan a la izquierda / derecha del objetivo) ---
  function siguienteY(lista, alto) {
    return lista.length ? Math.max(...lista.map(x => x.y + alto(x))) + 24 : -objH / 2
  }

  function alternarIndicador(texto) {
    const s = asegurar()
    const i = s.indicadores.findIndex(x => x.texto === texto)
    if (i >= 0) {
      const id = s.indicadores[i].id
      s.indicadores.splice(i, 1)
      s.conexiones = s.conexiones.filter(c => c.desde !== id && c.hasta !== id)
    } else {
      s.indicadores.push({ id: idLocal('ind'), texto, x: -OBJ_W / 2 - IND_W - 90, y: Math.round(siguienteY(s.indicadores, indAlto)) })
    }
    guardar()
  }

  function alternarFuente(fid) {
    const s = asegurar()
    const i = s.fuentes.findIndex(x => x.id === fid)
    if (i >= 0) {
      s.fuentes.splice(i, 1)
      s.conexiones = s.conexiones.filter(c => c.desde !== fid && c.hasta !== fid)
    } else {
      const alto = x => altoFuente(S.fuentePorId.get(x.id) || {})
      s.fuentes.push({ id: fid, x: OBJ_W / 2 + 90, y: Math.round(siguienteY(s.fuentes, alto)) })
    }
    guardar()
  }

  /** Al cerrar el selector se encuadra todo para que se vea lo recién vinculado. */
  function cerrarSelector() {
    modal = null
    requestAnimationFrame(() => lienzo?.encuadrar())
  }

  // --- Agrupadores: recuadros punteados que reúnen elementos (lib/agrupadores.js) ---
  function elementos() {
    const s = cv.objetivos[clave]
    if (!s) return []
    const out = [
      ...(s.indicadores || []).filter(x => p.indicadores.includes(x.texto)).map(x => ({ id: x.id, get nombre() { return `Indicador: ${x.texto}` }, tipo: 'indicador', caja: { x: x.x, y: x.y, w: IND_W, h: indAlto(x) }, poner: (a, b) => { x.x = a; x.y = b } })),
      ...(s.fuentes || []).filter(x => S.fuentePorId.has(x.id)).map(x => ({ id: x.id, get nombre() { return nombreDe(x.id) }, tipo: 'fuente', caja: { x: x.x, y: x.y, w: NODO_W, h: altoFuente(S.fuentePorId.get(x.id)) }, poner: (a, b) => { x.x = a; x.y = b } }))
    ]
    for (const [id, t] of tarj) out.push({ id, get nombre() { return nombreDe(id) }, tipo: TIPO[t.lista], caja: t, poner: (a, b) => { t.obj.x = a; t.obj.y = b } })
    return out
  }
  function cajaPorId(id) {
    const i = indicadores.find(x => x.id === id)
    if (i) return { x: i.x, y: i.y, w: IND_W, h: indAlto(i) }
    const f = fuentes.find(x => x.id === id)
    if (f) return { x: f.x, y: f.y, w: NODO_W, h: altoFuente(f.f) }
    return tarj.get(id) || null
  }
  const grupos = accionesAgrupadores({ lienzo: asegurar, elementos, cajaPorId, guardar: () => guardarProyecto(p) })
  /** Recuadro de cada agrupador, ajustado en vivo a lo que tiene dentro. */
  const cajasGrupos = $derived(new Map((o.agrupadores || []).map(g => [g.id, grupos.caja(g)])))
  const agrupadoresVista = $derived((o.agrupadores || []).filter(g => cruza(cajasGrupos.get(g.id))))
  const cuantos = $derived(new Map((o.agrupadores || []).map(g => [g.id, Array.isArray(g.miembros) ? g.miembros.length : grupos.miembros(g).length])))
  const editarAgrupador = g => (modal = { grupo: true, agrupador: g, dentro: g ? grupos.miembros(g).map(e => e.id) : [] })
  function guardarAgrupador({ titulo, color, ids }) {
    const g = modal.agrupador
    if (g) grupos.editar(g, { titulo, color, ids })
    else {
      const els = elementos().filter(e => ids.includes(e.id))
      const c = els.length ? { x: els.reduce((s, e) => s + e.caja.x + e.caja.w / 2, 0) / els.length, y: els.reduce((s, e) => s + e.caja.y + e.caja.h / 2, 0) / els.length } : lienzo.centro()
      const libres = ocupadas.filter(q => !els.some(e => e.caja.x === q.x && e.caja.y === q.y && e.caja.w === q.w))
      grupos.crear(titulo, color, ids, (w, h) => lugarLibre(libres, w, h, c.x, c.y, 40))
      avisar('Agrupador creado')
    }
    modal = null
  }

  // --- Arrastre, notas y conexiones ---
  function arrastre(obj) {
    let x0, y0
    return {
      inicio: () => { grupos.fijar(); x0 = obj.x; y0 = obj.y },
      mover: (dx, dy) => { obj.x = Math.round(x0 + dx); obj.y = Math.round(y0 + dy) },
      // Al soltar: sale de su agrupador si se alejó, o entra en el que quedó debajo.
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

  // --- Tarjetas libres (notas, listas, notas de voz, fotos) ---
  function crear(lista, datos) {
    const c = lienzo.centro()
    modal = { lista, o: nuevaTarjeta(lista, c.x, c.y, datos, ocupadas), nueva: true }
  }

  async function nuevaFoto(e) {
    const input = e.currentTarget
    const archivo = input.files?.[0]
    input.value = ''
    if (!archivo) return
    try { crear('fotos', await comprimirFoto(archivo)) } catch { avisar('No se pudo leer la imagen') }
  }

  function guardarModal() {
    guardarTarjeta(asegurar(), modal.lista, modal.o, modal.nueva, ocupadas)
    guardar()
    modal = null
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

  /** Ctrl+V con texto mientras el sub-lienzo está abierto: nota nueva en el centro. */
  function pegar(e) {
    if (modal || document.querySelector('dialog[open]')) return
    if (e.target.closest?.('input, textarea, [contenteditable]')) return
    const texto = e.clipboardData?.getData('text/plain') || ''
    if (!texto.trim()) return
    e.preventDefault()
    const c = lienzo.centro()
    asegurar().notas.push(nuevaTarjeta('notas', c.x, c.y, { texto: texto.trim().slice(0, 4000) }, ocupadas))
    guardar()
    avisar('Nota agregada')
  }

  function teclas(e) {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return
    if (conectando) conectando = null
    else cerrar()
  }

  // Si el objetivo deja de existir (se borró en la ficha), se cierra solo.
  $effect(() => { if (!objetivo) cerrar() })
</script>

{#snippet conexionesSvg()}
  {#each o.conexiones as con (con.id)}
    {@const a = puntoDe(con.desde)}
    {@const b = puntoDe(con.hasta)}
    {#if a && b}
      {@const ruta = corcho ? rutaHilo(a, b) : con.desde === 'objetivo' || con.hasta === 'objetivo'
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

{#if objetivo}
<section class="obj-panel" class:grande aria-label="Lienzo del {objetivo.rotulo.toLowerCase()}">
  <header class="sub-cab">
    <span class="chip"><Icono nombre="objetivo" tam={12} trazo={2} />{objetivo.corto}</span>
    <span class="sub-titulo" title={objetivo.texto}>{objetivo.texto}</span>
    <button class="icono-btn solo-escritorio" aria-label={grande ? 'Reducir a media pantalla' : 'Agrandar'} title={grande ? 'Media pantalla' : 'Agrandar'}
      onclick={() => { grande = !grande; requestAnimationFrame(() => lienzo?.encuadrar()) }}>
      <Icono nombre={grande ? 'reducir' : 'agrandar'} tam={16} />
    </button>
    <button class="icono-btn" aria-label="Cerrar lienzo del objetivo" title="Cerrar" onclick={cerrar}><Icono nombre="cerrar" tam={18} trazo={2} /></button>
  </header>

  <div class="sub-cuerpo">
    <Lienzo bind:this={lienzo} bind:simple={lejos} bind:ventana pesado={pesado} {limites} {corcho} cursor={conectando ? 'conectando' : ''} alTocarFondo={() => { if (conectando) conectando = null }}>
      <!-- Agrupadores: debajo de todo -->
      {#each agrupadoresVista as g (g.id)}
        <Agrupador {g} caja={cajasGrupos.get(g.id)} alTocar={() => editarAgrupador(g)} arrastre={grupos.arrastre(g)} />
      {/each}

      <!-- Aristas objetivo → indicadores y fuentes -->
      {#each indicadores as x (x.id)}
        {@const c = centroDe(x.id)}
        <line x1="0" y1="0" x2={c.x} y2={c.y} class="arista-ind" />
      {/each}
      {#each fuentes as x (x.id)}
        {@const c = centroDe(x.id)}
        <line x1="0" y1="0" x2={c.x} y2={c.y} class="arista" />
      {/each}

      <!-- Conexiones manuales (curvan alrededor del objetivo; en corcho van encima de las tarjetas) -->
      {#if !corcho}{@render conexionesSvg()}{/if}

      <!-- Objetivo al centro -->
      <Arrastrable transform="translate({-OBJ_W / 2} {-objH / 2})" clase="obj {conectando?.desde === 'objetivo' ? 'origen' : ''}"
        etiqueta="{objetivo.rotulo}: {objetivo.texto}" alTocar={() => tocar('objetivo', () => {})}>
        <rect x="0" y="6" width={OBJ_W} height={objH} rx="16" fill="rgba(46,75,94,.10)" />
        <rect width={OBJ_W} height={objH} rx="16" class="obj-caja" />
        <text x="24" y="36" class="obj-rotulo">{objetivo.rotulo.toUpperCase()}</text>
        {#each objLineas as l, i}<text x="24" y={66 + i * 27} class="obj-texto">{l}</text>{/each}
      </Arrastrable>

      <!-- Indicadores vinculados -->
      {#each indicadores as x (x.id)}
        {@const h = indAlto(x)}
        <Arrastrable transform="translate({x.x} {x.y})" clase="ind {conectando?.desde === x.id ? 'origen' : ''}"
          etiqueta="Indicador: {x.texto}" alTocar={() => tocar(x.id, () => (modal = { indicador: x.texto }))} {...arrastre(x)}>
          <rect width={IND_W} height={h} rx="10" class="ind-caja" />
          <text x="14" y="21" class="ind-rotulo">INDICADOR</text>
          {#each indLineas(x) as l, i}<text x="14" y={40 + i * 17} class="ind-texto">{l}</text>{/each}
        </Arrastrable>
      {/each}

      <!-- Fuentes que sustentan el objetivo -->
      {#each fuentes as x (x.id)}
        <NodoFuente x={x.x} y={x.y} anio={anio(x.f)} autor={autorCorto(x.f)} chips={x.f.etiquetas || []}
          estado={estadoDe(x.id)} resaltado={conectando?.desde === x.id}
          alAbrir={() => tocar(x.id, () => abrirFuente(x.id))} {...arrastre(o.fuentes.find(y => y.id === x.id))} />
      {/each}

      <!-- Tarjetas libres: notas, listas, notas de voz y fotos -->
      {#each LISTAS as l (l)}
        {#each tarjVista[l] as t (t.id)}
          <Tarjeta lista={l} o={t} origen={conectando?.desde === t.id} alVinculo={() => abrirOrigen(t.origen, p.id, t.id)}
            alTocar={() => tocar(t.id, () => (modal = { lista: l, o: copia(t) }))}
            alternar={i => { alternarTarea(t, i); guardar() }} {...arrastre(t)} />
        {/each}
      {/each}

      <!-- Nombre y esquina de los agrupadores, encima de las tarjetas -->
      {#each agrupadoresVista as g (g.id)}
        <Agrupador {g} caja={cajasGrupos.get(g.id)} capa="frente" n={cuantos.get(g.id)} {lejos} alTocar={() => editarAgrupador(g)} arrastre={grupos.arrastre(g)} />
      {/each}

      {#if corcho}
        {@render conexionesSvg()}
        <Chinchetas cajas={chinchetas} />
      {/if}
    </Lienzo>

    <div class="barra" role="toolbar" aria-label="Herramientas del lienzo del objetivo">
      <button class="btn chico" onclick={() => (modal = 'indicadores')}><Icono nombre="objetivo" tam={13} />Indicadores</button>
      <button class="btn chico" onclick={() => (modal = 'fuentes')}><Icono nombre="libro" tam={13} />Fuentes</button>
      <div class="div"></div>
      <button class="icono-btn" aria-label="Añadir nota" title="Nota" onclick={() => crear('notas')}><Icono nombre="nota" /></button>
      <button class="icono-btn" aria-label="Añadir lista de tareas" title="Lista de tareas" onclick={() => crear('listas')}><Icono nombre="tareas" /></button>
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

    {#if !indicadores.length && !fuentes.length && !hayTarjetas}
      <div class="vacio">
        <p class="serif">Desarrolla este objetivo por separado</p>
        <p class="suave">Vincula los indicadores que lo miden, agrega las fuentes que lo sustentan y toma notas.</p>
        <div class="fila">
          <button class="btn primario chico" onclick={() => (modal = 'indicadores')}>Vincular indicadores</button>
          <button class="btn chico" onclick={() => (modal = 'fuentes')}>Agregar fuentes</button>
        </div>
      </div>
    {/if}
  </div>
</section>
{/if}

{#if modal === 'indicadores'}
  <Modal titulo="Indicadores de {objetivo.corto}" onclose={cerrarSelector} ancho={520}>
    {#if p.indicadores.length}
      <p class="suave nota-modal">Marca los indicadores que miden este objetivo. Un indicador puede estar en varios objetivos.</p>
      <div class="lista">
        {#each p.indicadores as t}
          <label class="opcion"><input type="checkbox" checked={o.indicadores.some(x => x.texto === t)} onchange={() => alternarIndicador(t)} />{t}</label>
        {/each}
      </div>
    {:else}
      <p class="suave">El proyecto aún no tiene indicadores. Agrégalos en <b>Editar ficha</b> (uno por línea).</p>
    {/if}
  </Modal>
{:else if modal === 'fuentes'}
  <Modal titulo="Fuentes de {objetivo.corto}" onclose={cerrarSelector} ancho={520}>
    {#if fuentesProyecto.length}
      <p class="suave nota-modal">Marca las fuentes del proyecto que sustentan este objetivo.</p>
      <div class="lista">
        {#each fuentesProyecto as f (f.id)}
          <label class="opcion"><input type="checkbox" checked={o.fuentes.some(x => x.id === f.id)} onchange={() => alternarFuente(f.id)} />
            <span><b>{autorCorto(f)}</b> ({anio(f)}){#if f.titulo} · <span class="suave">{f.titulo}</span>{/if}</span></label>
        {/each}
      </div>
    {:else}
      <p class="suave">Este proyecto aún no tiene fuentes.</p>
    {/if}
  </Modal>
{:else if modal?.indicador}
  <Modal titulo="Indicador" onclose={() => (modal = null)} ancho={440}>
    <p class="texto-modal">{modal.indicador}</p>
    <p class="suave nota-modal">El texto se edita en la ficha del proyecto; el vínculo se actualiza solo.</p>
    <div class="fila entre">
      <button class="btn peligro" onclick={() => { alternarIndicador(modal.indicador); modal = null }}>Desvincular de {objetivo.corto}</button>
      <button class="btn" onclick={() => (modal = null)}>Cerrar</button>
    </div>
  </Modal>
{:else if modal?.lista}
  {#key modal.o.id}
    <EditorTarjeta lista={modal.lista} bind:o={modal.o} nueva={modal.nueva} vinculos={modal.nueva ? [] : vinculosDe(o, modal.o.id, nombreDe)} onvinculo={() => { const t = modal.o; modal = null; abrirOrigen(t.origen, p.id, t.id) }}
      onguardar={guardarModal} oneliminar={eliminarModal} onduplicar={duplicarModal} onclose={() => (modal = null)} />
  {/key}
{:else if modal?.grupo}
  <EditorAgrupador nuevo={!modal.agrupador} titulo={modal.agrupador?.titulo || ''} color={modal.agrupador?.color || 'azul'}
    elementos={elementos().map(({ id, nombre, tipo }) => ({ id, nombre, tipo }))} dentro={modal.dentro}
    onguardar={guardarAgrupador} onclose={() => (modal = null)}
    oneliminar={() => { grupos.eliminar(modal.agrupador); modal = null }}
    onacomodar={() => { grupos.acomodar(modal.agrupador); modal = null }} />
{:else if modal?.conexion}
  <Modal titulo={modal.nueva ? 'Nueva conexión' : 'Conexión'} onclose={() => (modal = null)} ancho={420}>
    <!-- svelte-ignore a11y_autofocus -->
    <label class="campo"><span>Etiqueta (opcional)</span><input type="text" bind:value={modal.conexion.etiqueta} placeholder="lo mide" autofocus /></label>
    <div class="fila entre">
      {#if !modal.nueva}<button class="btn peligro" onclick={() => eliminarConexion(modal.conexion.id)}>Eliminar</button>{:else}<span></span>{/if}
      <button class="btn primario" onclick={() => guardarConexion(modal.conexion, modal.nueva)}>Guardar</button>
    </div>
  </Modal>
{/if}

<style>
  .obj-panel {
    position: absolute; top: 0; right: 0; bottom: 0; width: 50%; min-width: 420px; z-index: 12;
    display: flex; flex-direction: column; background: var(--paper);
    border-left: 1px solid var(--line); box-shadow: -10px 0 30px rgba(33, 31, 26, .14);
  }
  .obj-panel.grande { width: 100%; min-width: 0; border-left: none; }
  .sub-cab { display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; border-bottom: 1px solid var(--line); }
  .sub-cab .chip { flex-shrink: 0; }
  .sub-titulo { flex-grow: 1; min-width: 0; font: 600 15px var(--serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub-cuerpo { flex-grow: 1; display: flex; position: relative; min-height: 0; }

  .barra {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 5;
    display: flex; align-items: center; gap: 4px; background: var(--paper); border: 1px solid var(--line);
    border-radius: 12px; padding: 6px; box-shadow: 0 4px 14px rgba(33, 31, 26, .12); white-space: nowrap;
    max-width: calc(100% - 16px); overflow-x: auto; scrollbar-width: none;
  }
  .barra .btn { display: inline-flex; align-items: center; gap: 6px; }
  .div { width: 1px; height: 22px; background: var(--line); margin: 0 4px; }
  .pista-conexion {
    position: absolute; top: 66px; left: 50%; transform: translateX(-50%); z-index: 5; font-size: 13px;
    background: var(--accent); color: var(--paper); border-radius: 999px; padding: 4px 6px 4px 14px; display: flex; align-items: center; gap: 6px; white-space: nowrap;
  }
  .pista-conexion .btn { color: var(--paper); }
  .vacio {
    position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); z-index: 4; text-align: center;
    background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 16px 20px; box-shadow: 0 4px 14px rgba(33,31,26,.1);
    width: min(400px, calc(100% - 32px));
  }
  .vacio p { margin: 0 0 6px; font-size: 13px; }
  .vacio .serif { font-size: 16px; }
  .vacio .fila { justify-content: center; margin-top: 10px; }

  .lista { display: flex; flex-direction: column; gap: 2px; max-height: 50dvh; overflow-y: auto; }
  .opcion { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; font-size: 13.5px; line-height: 1.45; cursor: pointer; }
  .opcion:hover { background: var(--paper-dim); }
  .opcion input { margin-top: 3px; flex-shrink: 0; }
  .nota-modal { margin: -6px 0 0; font-size: 13px; }
  .texto-modal { margin: 0; font-size: 15px; line-height: 1.5; }

  .arista { stroke: var(--ink-soft); stroke-opacity: .3; stroke-width: 1; }
  .arista-ind { stroke: var(--using); stroke-opacity: .55; stroke-width: 1.5; }
  .conexion { fill: none; stroke: var(--accent); stroke-opacity: .55; stroke-width: 1.5; stroke-dasharray: 5 4; pointer-events: none; }
  .conexion.hilo { stroke: #B3261E; stroke-opacity: 1; stroke-width: 2.2; stroke-dasharray: none; stroke-linecap: round; }
  .etq-punto.nudo { fill: #8E1B14; stroke: #B3261E; }
  .hilo-sombra { fill: none; stroke: rgba(0, 0, 0, .22); stroke-width: 2.6; transform: translate(1.5px, 3px); pointer-events: none; }
  .etq { cursor: pointer; }
  .etq rect { fill: var(--paper); stroke: var(--accent); }
  .etq text { font: 400 10px var(--sans); fill: var(--accent); }
  .etq-punto { fill: var(--paper); stroke: var(--accent); cursor: pointer; }
  .obj-caja { fill: var(--paper); stroke: var(--accent); stroke-width: 2; }
  :global(.obj.origen) .obj-caja { stroke-width: 4; }
  .obj-rotulo { font: 600 11px var(--sans); fill: var(--accent); letter-spacing: .06em; }
  .obj-texto { font: 600 20px var(--serif); fill: var(--ink); }
  :global(.ind) { cursor: grab; }
  .ind-caja { fill: var(--using-bg); stroke: var(--using); stroke-opacity: .5; }
  :global(.ind.origen) .ind-caja { stroke-opacity: 1; stroke-width: 2; }
  .ind-rotulo { font: 600 9.5px var(--sans); fill: var(--using); letter-spacing: .08em; pointer-events: none; }
  .ind-texto { font: 400 12.5px var(--sans); fill: var(--ink); pointer-events: none; }

  text { user-select: none; }

  @media (max-width: 820px) {
    .obj-panel { width: 100%; min-width: 0; border-left: none; z-index: 25; }
    .barra { gap: 2px; padding: 4px; max-width: calc(100% - 16px); overflow-x: auto; scrollbar-width: none; }
  }
</style>
