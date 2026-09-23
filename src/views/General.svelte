<script>
  import { untrack } from 'svelte'
  // Vista general de fuentes y citas con filtros y panel de detalle (mockup 4-vista-general).
  import Lienzo from '../components/Lienzo.svelte'
  import NodoFuente from '../components/NodoFuente.svelte'
  import Icono from '../components/Icono.svelte'
  import Modal from '../components/Modal.svelte'
  import FuenteForm from '../components/FuenteForm.svelte'
  import AgregarFuente from '../components/AgregarFuente.svelte'
  import { S, copiar, guardarFuente, eliminarFuente } from '../lib/store.svelte.js'
  import { TIPOS_FUENTE, ESTADOS_VERIF, autorCorto, anio, apellido, coincide, urlFuente, sugerirBibliografia, esMarcador, paginaTexto } from '../lib/citas.js'
  import { NODO_W, alturaNodo, enFilas, limitesDe } from '../lib/grafo.js'
  import { descargarBib } from '../lib/io.svelte.js'

  let { pid = null, abrirDatos } = $props()

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
  <button class="icono-btn" aria-label="Datos" title="Datos" onclick={abrirDatos}><Icono nombre="datos" tam={18} /></button>
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
    <aside class="panel derecho detalle abierto" style="width:380px">
      <div class="fila entre">
        <span class="pastilla {verifDe(fuente)}"><span class="punto"></span>{ESTADOS_VERIF[verifDe(fuente)]}{fuente.fuente_verificacion ? ` · ${fuente.fuente_verificacion}` : ''}</span>
        <button class="icono-btn" aria-label="Cerrar detalle" onclick={() => (sel = null)}><Icono nombre="cerrar" tam={18} trazo={2} /></button>
      </div>
      <div>
        <div class="serif titulo-d">{fuente.titulo}</div>
        <div class="suave meta">{(fuente.autores || []).join('; ') || 'Sin autor'} · {anio(fuente)} · {TIPOS_FUENTE[tipoDe(fuente)]}</div>
      </div>
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
  @media (max-width: 820px) {
    .busca { max-width: none; }
    .detalle { top: auto !important; height: 70%; width: 100% !important; transform: none; border-left: none; border-top: 1px solid var(--line); border-radius: 16px 16px 0 0; }
  }
</style>
