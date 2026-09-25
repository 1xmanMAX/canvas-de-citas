<script>
  import { untrack } from 'svelte'
  // Vista general de fuentes y citas con filtros y panel de detalle (mockup 4-vista-general).
  import Lienzo from '../components/Lienzo.svelte'
  import NodoFuente from '../components/NodoFuente.svelte'
  import Icono from '../components/Icono.svelte'
  import { R } from '../lib/celular.svelte.js'
  import BotonSincro from '../components/BotonSincro.svelte'
  import { esAndroid } from '../lib/plataforma.js'
  import Modal from '../components/Modal.svelte'
  import FuenteForm from '../components/FuenteForm.svelte'
  import AgregarFuente from '../components/AgregarFuente.svelte'
  import { S, copiar, guardarFuente, eliminarFuente, adjuntarDocumento, avisar } from '../lib/store.svelte.js'
  import { abrirDocumentoFuente } from '../lib/visor.svelte.js'
  import { referenciasDe, doiDe, enBiblioteca, analizarReferencia, completarConCrossref, conectarReferencia } from '../lib/referencias.js'
  import { TIPOS_FUENTE, ESTADOS_VERIF, autorCorto, anio, apellido, coincide, urlFuente, sugerirBibliografia, esMarcador, paginaTexto } from '../lib/citas.js'
  import { NODO_W, alturaNodo, enFilas, limitesDe } from '../lib/grafo.js'
  import { descargarBib } from '../lib/io.svelte.js'

  let { pid = null, abrirDatos, abrirCelular } = $props()

  let proyecto = $state(untrack(() => pid || ''))
  let tipos = $state(Object.fromEntries(Object.keys(TIPOS_FUENTE).map(k => [k, true])))
  let verif = $state({ verificado: true, dudoso: true, no_verificado: true })
  let orden = $state('tema')
  let q = $state('')
  let sel = $state(null)
  let filtros = $state(false)
  let modal = $state(null) // 'nueva' | 'agregar' | { editar: fuente }

  const tipoDe = f => (f.tipo_fuente in TIPOS_FUENTE ? f.tipo_fuente : 'otro')
  const verifDe = f => (f.estado_verificacion in ESTADOS_VERIF ? f.estado_verificacion : 'no_verificado')

  const idsProyecto = $derived(proyecto ? new Set((S.citasPorProyecto.get(proyecto) || []).map(c => c.fuente_id)) : null)
  const base = $derived(idsProyecto ? S.fuentes.filter(f => idsProyecto.has(f.id)) : S.fuentes)
  const cuentaTipo = $derived(base.reduce((m, f) => ((m[tipoDe(f)] = (m[tipoDe(f)] || 0) + 1), m), {}))
  const cuentaVerif = $derived(base.reduce((m, f) => ((m[verifDe(f)] = (m[verifDe(f)] || 0) + 1), m), {}))

  const CLAVE = {
    autor: f => (apellido(f.autores?.[0]) || f.titulo || '?')[0].toUpperCase(),
    anio: f => (typeof f.anio === 'number' ? `${Math.floor(f.anio / 10) * 10}s` : 'Sin año'),
    tema: f => f.tema || 'Sin tema'
  }
  const ORDEN = {
    autor: (a, b) => autorCorto(a).localeCompare(autorCorto(b), 'es'),
    anio: (a, b) => (Number(a.anio) || 0) - (Number(b.anio) || 0),
    tema: (a, b) => (a.tema || '~').localeCompare(b.tema || '~', 'es') || autorCorto(a).localeCompare(autorCorto(b), 'es')
  }
  const visibles = $derived(base.filter(f => tipos[tipoDe(f)] && verif[verifDe(f)] && coincide(f, q)).sort(ORDEN[orden]))
  const items = $derived(visibles.map(f => ({ id: f.id, f, h: alturaNodo(true, false) })))
  const disp = $derived((S.tipografias, enFilas(items, it => CLAVE[orden](it.f))))
  const limites = $derived(limitesDe([...items.map(it => ({ ...disp.pos.get(it.id), w: NODO_W, h: it.h })), ...disp.grupos.map(g => ({ x: g.x, y: g.y - 40, w: g.w, h: 40 }))]))

  // Aristas: fuentes que comparten autor.
  const aristas = $derived.by(() => {
    const porAutor = new Map()
    for (const f of visibles) for (const a of new Set((f.autores || []).map(apellido).filter(Boolean))) {
      if (!porAutor.has(a)) porAutor.set(a, [])
      porAutor.get(a).push(f.id)
    }
    const res = []
    for (const ids of porAutor.values()) for (let i = 1; i < ids.length; i++) res.push([ids[i - 1], ids[i]])
    return res
  })
  const centro = id => { const p = disp.pos.get(id); return { x: p.x + NODO_W / 2, y: p.y + 35 } }

  const fuente = $derived(sel ? S.fuentePorId.get(sel) : null)
  const citasSel = $derived(fuente ? (S.citasPorFuente.get(fuente.id) || []).filter(c => !esMarcador(c) && (!proyecto || c.proyecto_id === proyecto)) : [])

  // --- Documento, referencias del paper, relaciones y puntos clave ---
  let amplio = $state(false)
  let refs = $state([])
  let refsEstado = $state('') // '' | 'cargando' | 'sin-documento' | 'error'
  let filtroRefs = $state('')
  $effect(() => {
    const f = fuente, doc = f?.documento_original
    refs = []
    filtroRefs = ''
    if (!f) return
    if (!doc) { refsEstado = 'sin-documento'; return }
    refsEstado = 'cargando'
    referenciasDe(f).then(r => { if (sel === f.id) { refs = r.refs; refsEstado = r.error || '' } })
      .catch(() => { if (sel === f.id) refsEstado = 'error' })
  })
  const refsVisibles = $derived(refs.map((texto, i) => ({ i, texto, doi: doiDe(texto), bib: enBiblioteca(texto, fuente?.id) }))
    .filter(r => !filtroRefs || r.texto.toLowerCase().includes(filtroRefs.toLowerCase())))
  const citaA = $derived((fuente?.referencias_citadas || []).map(id => S.fuentePorId.get(id)).filter(Boolean))
  const citadaEn = $derived((fuente?.citada_en || []).map(id => S.fuentePorId.get(id)).filter(Boolean))
  const TIPOS_PUNTO = { hallazgo: 'Hallazgo', dato: 'Dato', metodo: 'Método', definicion: 'Definición', marco: 'Marco teórico', vacio: 'Vacío', limitacion: 'Limitación', cita: 'Cita textual' }

  /** Proyecto para el visor (las citas que se tomen van a su lienzo): el filtrado, o el primero de la fuente. */
  const proyectoDe = f => proyecto || (S.citasPorFuente.get(f.id) || [])[0]?.proyecto_id || null
  const verDocumento = () => abrirDocumentoFuente(fuente, proyectoDe(fuente))

  async function adjuntar(e) {
    const a = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!a) return
    if (!/\.(pdf|html?|md|markdown|txt)$/i.test(a.name)) return avisar('Solo PDF, HTML, Markdown o TXT')
    await adjuntarDocumento(fuente, a)
    avisar('Documento adjuntado')
  }

  let preparando = $state(-1)
  async function agregarReferencia(r) {
    preparando = r.i
    const datos = await completarConCrossref(analizarReferencia(r.texto))
    preparando = -1
    modal = { referencia: { ...datos, entrada_bibliografia: r.texto, notas_correccion: `Citada en ${autorCorto(fuente)} (${anio(fuente)})` }, paper: fuente }
  }
  function conectarExistente(r) {
    conectarReferencia(fuente, r.bib)
    avisar(`Conectada: ${autorCorto(fuente)} cita a ${autorCorto(r.bib)} (${anio(r.bib)})`)
  }

  function borrar() {
    const n = (S.citasPorFuente.get(fuente.id) || []).length
    if (!confirm(`¿Eliminar "${fuente.titulo}" de la biblioteca y sus ${n} citas en todos los proyectos?`)) return
    eliminarFuente(fuente.id)
    sel = null
  }
</script>

<header class="cabecera">
  <button class="icono-btn solo-movil" aria-label="Filtros" onclick={() => (filtros = !filtros)}><Icono nombre="filtro" tam={18} /></button>
  <a class="logo" href="#/" aria-label="Inicio">C</a>
  <a class="marca solo-escritorio" href={proyecto ? `#/p/${proyecto}` : '#/'} style="text-decoration:none;color:inherit">Canvas de Citas</a>
  <span class="suave solo-escritorio contexto">{proyecto ? S.proyectoPorId.get(proyecto)?.titulo : 'Todos los proyectos'}</span>
  <div class="busca">
    <span class="lupa"><Icono nombre="buscar" tam={16} trazo={2} /></span>
    <label for="buscar-citas" class="sr-only">Buscar citas</label>
    <input id="buscar-citas" type="search" placeholder="Buscar por autor, año o palabra clave..." bind:value={q} />
  </div>
  <div class="espacio solo-escritorio"></div>
  <button class="btn solo-escritorio" onclick={() => descargarBib(visibles)}>Exportar .bib</button>
  <button class="btn primario" aria-label="Agregar fuente" onclick={() => (modal = proyecto ? 'agregar' : 'nueva')}><span class="solo-escritorio">+ Agregar fuente</span><span class="solo-movil">+</span></button>
<BotonSincro {abrirDatos} />{#if !esAndroid}<button class="icono-btn celular-btn" aria-label="Celular y PixPin" title="Pasar archivos con el celular o PixPin" onclick={abrirCelular}><Icono nombre="celular" tam={18} />{#if R.recibidos.length}<span class="insignia">{R.recibidos.length}</span>{/if}</button>{/if}
  <button class="icono-btn" aria-label="Configuración" title="Configuración" onclick={abrirDatos}><Icono nombre="ajustes" tam={18} /></button>
</header>

<div class="cuerpo">
  <button class="velo" class:abierto={filtros} aria-label="Cerrar filtros" onclick={() => (filtros = false)}></button>
  <aside class="panel filtros" class:abierto={filtros} style="width:264px">
    <div class="grupo-f">
      <label class="rotulo" for="sel-proyecto">Proyecto</label>
      <select id="sel-proyecto" bind:value={proyecto} onchange={() => (sel = null)}>
        <option value="">Todos (biblioteca)</option>
        {#each S.proyectos as p}<option value={p.id}>{p.titulo}</option>{/each}
      </select>
      {#if proyecto}<a class="btn chico" href="#/p/{proyecto}"><Icono nombre="grafo" tam={12} />Abrir lienzo del proyecto</a>{/if}
    </div>
    <div class="separador"></div>
    <div class="grupo-f">
      <div class="rotulo">Tipo de fuente</div>
      {#each Object.entries(TIPOS_FUENTE) as [k, t]}
        <label class="fila entre opcion">
          <span class="fila"><input type="checkbox" bind:checked={tipos[k]} />{t}</span>
          <span class="suave n">{cuentaTipo[k] || 0}</span>
        </label>
      {/each}
    </div>
    <div class="separador"></div>
    <div class="grupo-f">
      <div class="rotulo">Estado de verificación</div>
      {#each Object.entries(ESTADOS_VERIF) as [k, t]}
        <label class="fila entre opcion">
          <span class="fila"><input type="checkbox" bind:checked={verif[k]} /><span class="punto {k}"></span>{t}</span>
          <span class="suave n">{cuentaVerif[k] || 0}</span>
        </label>
      {/each}
    </div>
    <div class="separador"></div>
    <div class="grupo-f">
      <div class="rotulo">Ordenar por</div>
      <div class="segmentado">
        <button aria-pressed={orden === 'autor'} onclick={() => (orden = 'autor')}>Autor</button>
        <button aria-pressed={orden === 'anio'} onclick={() => (orden = 'anio')}>Año</button>
        <button aria-pressed={orden === 'tema'} onclick={() => (orden = 'tema')}>Tema</button>
      </div>
    </div>
    <p class="suave n">{visibles.length} de {base.length} fuentes</p>
  </aside>

  {#key orden + proyecto}
    <Lienzo {limites} alTocarFondo={() => (sel = null)}>
      {#each disp.grupos as g}
        <text class="grupo" x={g.x} y={g.y - 6}>{g.nombre.toUpperCase()}</text>
      {/each}
      {#each aristas as [a, b]}
        {@const p1 = centro(a)}
        {@const p2 = centro(b)}
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} class="arista" />
      {/each}
      {#each items as it (it.id)}
        {@const pos = disp.pos.get(it.id)}
        <NodoFuente
          x={pos.x} y={pos.y} anio={anio(it.f)} autor={autorCorto(it.f)} linea2={it.f.titulo}
          estado={verifDe(it.f)} seleccionado={sel === it.id}
          alAbrir={() => (sel = it.id)}
        />
      {/each}
    </Lienzo>
  {/key}

  {#if !base.length}
    <div class="vacio">
      <p class="serif">No hay fuentes todavía</p>
      <p class="suave">Importa los JSON de la skill o agrega una fuente.</p>
      <button class="btn" onclick={abrirDatos}>Importar JSON</button>
    </div>
  {/if}

  {#if fuente}
    <aside class="panel derecho detalle abierto" style="width:{amplio ? 'min(760px, 62vw)' : '420px'}">
      <div class="fila entre">
        <span class="pastilla {verifDe(fuente)}"><span class="punto"></span>{ESTADOS_VERIF[verifDe(fuente)]}{fuente.fuente_verificacion ? ` · ${fuente.fuente_verificacion}` : ''}</span>
        <span class="fila">
          <button class="icono-btn solo-escritorio" aria-label={amplio ? 'Panel angosto' : 'Panel amplio'} title={amplio ? 'Panel angosto' : 'Ver en panel amplio'} onclick={() => (amplio = !amplio)}><Icono nombre={amplio ? 'reducir' : 'agrandar'} tam={16} /></button>
          <button class="icono-btn" aria-label="Cerrar detalle" onclick={() => (sel = null)}><Icono nombre="cerrar" tam={18} trazo={2} /></button>
        </span>
      </div>
      <div>
        <div class="serif titulo-d">{fuente.titulo}</div>
        <div class="suave meta">{(fuente.autores || []).join('; ') || 'Sin autor'} · {anio(fuente)} · {TIPOS_FUENTE[tipoDe(fuente)]}{fuente.revista_o_editorial ? ` · ${fuente.revista_o_editorial}` : ''}</div>
      </div>

      <!-- Documento: se abre en el visor rápido -->
      {#if fuente.documento_original}
        <button class="doc" onclick={verDocumento} title="Abrir en el visor">
          <Icono nombre="doc" tam={20} />
          <span class="doc-txt"><b>{fuente.documento_nombre || fuente.documento_original.split('/').pop()}</b><span class="suave">{(fuente.documento_original.split('.').pop() || '').toUpperCase()} · abrir en el visor</span></span>
          <Icono nombre="chevron" tam={16} />
        </button>
      {:else}
        <label class="doc vacio-doc">
          <Icono nombre="clip" tam={18} />
          <span class="doc-txt"><b>Sin documento</b><span class="suave">Adjuntar PDF, HTML o Markdown</span></span>
          <input type="file" accept=".pdf,.html,.htm,.md,.markdown,.txt" hidden onchange={adjuntar} />
        </label>
      {/if}
      <div class="separador"></div>

      <div class="bloque">
        <div class="rotulo">Cita en texto ({citasSel.length})</div>
        {#each citasSel as c (c.id)}
          <div class="cita-d">
            <div class="fila entre">
              <span class="caja-cita">{c.cita_en_texto || '—'}</span>
              <button class="icono-btn" aria-label="Copiar cita" onclick={() => copiar(c.cita_en_texto)}><Icono nombre="copiar" tam={14} /></button>
            </div>
            <div class="suave n">
              {paginaTexto(c.pagina) || 's. p.'}{c.contexto ? ` · ${c.contexto}` : ''}
              {#if !proyecto} · <a href="#/p/{c.proyecto_id}/f/{fuente.id}">{S.proyectoPorId.get(c.proyecto_id)?.titulo || c.proyecto_id}</a>{/if}
            </div>
          </div>
        {:else}
          <div class="suave n">Sin citas extraídas{proyecto ? ' en este proyecto' : ''}.</div>
        {/each}
      </div>

      <div class="bloque">
        <div class="fila entre">
          <div class="rotulo">Entrada de bibliografía</div>
          <button class="icono-btn" aria-label="Copiar bibliografía" onclick={() => copiar(fuente.entrada_bibliografia || sugerirBibliografia(fuente))}><Icono nombre="copiar" tam={14} /></button>
        </div>
        <div class="caja-cita bib">{fuente.entrada_bibliografia || sugerirBibliografia(fuente)}</div>
      </div>

      {#if fuente.puntos?.length}
        <div class="bloque">
          <div class="rotulo">Puntos clave ({fuente.puntos.length})</div>
          <ul class="puntos">
            {#each fuente.puntos as p (p.id)}
              <li><span class="chip-p">{TIPOS_PUNTO[p.tipo] || p.tipo}</span> {p.texto}<span class="suave">{p.pagina ? ` · p. ${p.pagina}` : ''}{p.objetivos?.length ? ` · ${p.objetivos.join(', ').toUpperCase()}` : ''}</span></li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if citaA.length || citadaEn.length}
        <div class="bloque">
          {#if citaA.length}<div class="rotulo">Cita a ({citaA.length})</div>
            <div class="chips">{#each citaA as f (f.id)}<button class="chip-f" onclick={() => (sel = f.id)}>{autorCorto(f)} ({anio(f)})</button>{/each}</div>{/if}
          {#if citadaEn.length}<div class="rotulo">Citada en ({citadaEn.length})</div>
            <div class="chips">{#each citadaEn as f (f.id)}<button class="chip-f" onclick={() => (sel = f.id)}>{autorCorto(f)} ({anio(f)})</button>{/each}</div>{/if}
        </div>
      {/if}

      <div class="bloque">
        <div class="fila entre">
          <div class="rotulo">Referencias del paper{refs.length ? ` (${refs.length})` : ''}</div>
          {#if refs.length && !amplio}<button class="btn chico fantasma" onclick={() => (amplio = true)}>Lista amplia</button>{/if}
        </div>
        {#if refsEstado === 'cargando'}<div class="suave n">Leyendo la bibliografía del documento…</div>
        {:else if refsEstado === 'sin-documento'}<div class="suave n">Adjunta el documento para ver la bibliografía que cita.</div>
        {:else if refsEstado === 'error'}<div class="suave n">No se pudo leer el documento.</div>
        {:else if !refs.length}<div class="suave n">No se encontró la sección de referencias en el documento.</div>
        {:else}
          {#if refs.length > 12}<input class="filtro-refs" type="search" bind:value={filtroRefs} placeholder="Filtrar referencias (autor, año, tema…)" aria-label="Filtrar referencias" />{/if}
          <ol class="refs" class:amplio>
            {#each refsVisibles as r (r.i)}
              <li value={r.i + 1}>
                <span class="ref-txt">{r.texto}</span>
                <span class="ref-acc">
                  {#if r.doi}<a class="btn chico fantasma" href="https://doi.org/{r.doi}" target="_blank" rel="noopener">DOI ↗</a>{/if}
                  {#if r.bib}
                    <button class="chip-f" onclick={() => (sel = r.bib.id)} title="Ir a esta fuente">En biblioteca: {autorCorto(r.bib)} ({anio(r.bib)})</button>
                    {#if !(fuente.referencias_citadas || []).includes(r.bib.id)}<button class="btn chico" onclick={() => conectarExistente(r)}>Conectar</button>{/if}
                  {:else}
                    <button class="btn chico" disabled={preparando === r.i} onclick={() => agregarReferencia(r)}>{preparando === r.i ? 'Buscando…' : '+ Agregar'}</button>
                  {/if}
                </span>
              </li>
            {/each}
          </ol>
        {/if}
      </div>

      {#if fuente.notas_correccion}
        <div class="bloque">
          <div class="rotulo">Notas de corrección</div>
          <div class="suave texto">{fuente.notas_correccion}</div>
        </div>
      {/if}

      <div class="separador"></div>
      <div class="fila">
        <button class="btn crece" onclick={() => (modal = { editar: fuente })}>Editar</button>
        {#if urlFuente(fuente)}<a class="btn crece" href={urlFuente(fuente)} target="_blank" rel="noopener">Ver fuente ↗</a>{/if}
      </div>
      <button class="btn peligro" onclick={borrar}>Eliminar fuente</button>
    </aside>
  {/if}
</div>

{#if modal === 'agregar'}
  <AgregarFuente proyectoId={proyecto} onclose={() => (modal = null)} />
{:else if modal === 'nueva'}
  <Modal titulo="Nueva fuente en la biblioteca" onclose={() => (modal = null)} ancho={680}>
    <FuenteForm onguardar={d => { sel = guardarFuente(d).id; modal = null }} />
  </Modal>
{:else if modal?.referencia}
  <Modal titulo="Agregar referencia citada por {autorCorto(modal.paper)} ({anio(modal.paper)})" onclose={() => (modal = null)} ancho={680}>
    <p class="suave n">Revisa los datos antes de guardar{modal.referencia.fuente_verificacion === 'CrossRef' ? ' (completados con CrossRef)' : ' (extraídos del texto: pueden necesitar corrección)'}. Quedará conectada al paper y vinculada a sus proyectos.</p>
    <FuenteForm fuente={modal.referencia} textoBoton="Guardar y conectar" oncancelar={() => (modal = null)}
      onguardar={d => { const paper = modal.paper; const ref = guardarFuente(d); conectarReferencia(paper, ref); modal = null; avisar(`${autorCorto(ref)} (${anio(ref)}) agregada y conectada`) }} />
  </Modal>
{:else if modal?.editar}
  <Modal titulo="Editar fuente" onclose={() => (modal = null)} ancho={680}>
    <FuenteForm fuente={modal.editar} onguardar={d => { guardarFuente({ ...d, id: modal.editar.id }); modal = null }} oncancelar={() => (modal = null)} />
  </Modal>
{/if}

<style>
  .contexto { font-size: 13px; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .busca { flex-grow: 1; max-width: 480px; position: relative; min-width: 0; }
  .busca input { padding-left: 36px; }
  .lupa { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-soft); display: flex; }
  .filtros { gap: 22px; }
  .grupo-f { display: flex; flex-direction: column; gap: 10px; }
  .opcion { font-size: 14px; cursor: pointer; }
  .opcion input { accent-color: var(--accent); margin: 0; }
  .opcion .punto { width: 9px; height: 9px; }
  .n { font-size: 12px; margin: 0; }
  .grupo { font: 600 34px var(--serif); fill: var(--ink); opacity: .09; letter-spacing: .02em; }
  .arista { stroke: var(--ink-soft); stroke-opacity: .25; stroke-width: 1; }
  .vacio { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); text-align: center; background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 18px 24px; }
  .vacio p { margin: 0 0 8px; }
  .detalle { gap: 18px; }
  .titulo-d { font-size: 19px; line-height: 1.3; }
  .meta { font-size: 13px; margin-top: 6px; line-height: 1.5; }
  .bloque { display: flex; flex-direction: column; gap: 8px; }
  .cita-d { display: flex; flex-direction: column; gap: 4px; }
  .cita-d .caja-cita { flex-grow: 1; background: var(--paper); }
  .bib { font-size: 13px; background: var(--paper); }
  .texto { font-size: 13px; line-height: 1.5; }
  .crece { flex-grow: 1; }
  .doc { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); text-align: left; cursor: pointer; color: var(--ink); }
  .doc:hover { border-color: var(--accent); }
  .vacio-doc { border-style: dashed; color: var(--ink-soft); }
  .doc-txt { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; font-size: 13px; line-height: 1.35; }
  .doc-txt b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .doc-txt .suave { font-size: 11.5px; }
  .puntos { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 13px; line-height: 1.45; }
  .chip-p { font-size: 10.5px; font-weight: 600; border-radius: 999px; padding: 1px 7px; background: var(--accent-soft); color: var(--accent); }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip-f { font-size: 12px; border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; background: var(--paper); color: var(--accent); cursor: pointer; }
  .chip-f:hover { border-color: var(--accent); }
  .filtro-refs { padding: 6px 10px; font-size: 13px; }
  .refs { margin: 0; padding-left: 26px; display: flex; flex-direction: column; gap: 10px; font-size: 12.5px; line-height: 1.5; max-height: 46vh; overflow-y: auto; }
  .refs.amplio { max-height: none; font-size: 13.5px; }
  .refs li::marker { color: var(--ink-soft); font-size: 11px; }
  .ref-txt { display: block; }
  .ref-acc { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; align-items: center; }
  @media (max-width: 820px) {
    .busca { max-width: none; }
    .detalle { top: auto !important; height: 70%; width: 100% !important; transform: none; border-left: none; border-top: 1px solid var(--line); border-radius: 16px 16px 0 0; }
  }
</style>
