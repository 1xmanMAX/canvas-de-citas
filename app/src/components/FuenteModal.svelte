<script>
  // Ventana "Citas extraídas de esta fuente" (mockup 3-fuente-citas).
  import Modal from './Modal.svelte'
  import Icono from './Icono.svelte'
  import CitaForm from './CitaForm.svelte'
  import FuenteForm from './FuenteForm.svelte'
  import { abrirDocumentoFuente, V } from '../lib/visor.svelte.js'
  import { S, copiar, guardarCita, agregarCita, eliminarCita, guardarFuente, quitarFuenteDeProyecto, adjuntarDocumento, quitarDocumento, leerDocumento, avisar } from '../lib/store.svelte.js'
  import { ESTADOS_USO, ESTADOS_VERIF, estadoDeCitas, esMarcador, autorCorto, anio, urlFuente, sugerirBibliografia, paginaTexto } from '../lib/citas.js'

  let { fuente, proyectoId, onclose } = $props()

  // Puntos clave y referencias que registra la skill de Claude Code (canvas-de-citas).
  const TIPOS_PUNTO = { hallazgo: 'Hallazgo', dato: 'Dato', metodo: 'Método', definicion: 'Definición', marco: 'Marco teórico', vacio: 'Vacío', limitacion: 'Limitación', cita: 'Cita textual' }
  const citaA = $derived((fuente.referencias_citadas || []).map(id => S.fuentePorId.get(id)).filter(Boolean))
  const citadaEn = $derived((fuente.citada_en || []).map(id => S.fuentePorId.get(id)).filter(Boolean))

  const citas = $derived(
    (S.citasPorFuente.get(fuente.id) || [])
      .filter(c => c.proyecto_id === proyectoId)
      .sort((a, b) => (parseInt(a.pagina) || 0) - (parseInt(b.pagina) || 0))
  )
  const reales = $derived(citas.filter(c => !esMarcador(c)))
  const marcador = $derived(citas.find(esMarcador))
  const estado = $derived(estadoDeCitas(citas))
  const bib = $derived(fuente.entrada_bibliografia || sugerirBibliografia(fuente))
  const url = $derived(urlFuente(fuente))
  const icono = { libro: 'libro', capitulo_libro: 'libro', normativa_tecnica: 'norma', otro: 'etiqueta' }

  let editando = $state(null) // id de cita o 'nueva'
  let editandoFuente = $state(false)
  let archivo = $state()

  function guardar(datos) {
    if (editando === 'nueva') agregarCita({ ...datos, proyecto_id: proyectoId, fuente_id: fuente.id })
    else guardarCita({ ...datos, id: editando })
    editando = null
  }

  function borrar(c) {
    if (!confirm(`¿Eliminar la cita ${c.cita_en_texto || c.id}?`)) return
    // Si es la última cita, se deja un marcador para no desvincular la fuente del proyecto.
    const ultima = citas.length === 1
    eliminarCita(c.id)
    if (ultima) guardarCita({ proyecto_id: proyectoId, fuente_id: fuente.id, estado_uso: 'revisado_no_usado', cita_textual_o_parafraseo: 'parafraseo', pagina: null, cita_en_texto: '', contexto: '' })
  }

  function quitar() {
    if (!confirm('¿Quitar esta fuente del proyecto? Se eliminan sus citas en este proyecto; la fuente sigue en la biblioteca.')) return
    quitarFuenteDeProyecto(proyectoId, fuente.id)
    onclose()
  }

  /** Abre el documento en el visor de la app (panel lateral) y cierra la ficha. */
  async function abrirDocumento() {
    await abrirDocumentoFuente(fuente, proyectoId)
    if (V.archivo) onclose()
  }

  // --- Documento original: zona de arrastrar y soltar ---
  let encima = $state(false)
  let nombreDoc = $state('')
  $effect(() => {
    fuente.documento_original
    leerDocumento(fuente.id).then(d => (nombreDoc = d?.nombre || ''))
  })

  const ACEPTADOS = /\.(pdf|html?|md|txt)$/i

  async function guardarDoc(a) {
    if (!a) return
    if (!ACEPTADOS.test(a.name)) return avisar('Solo se aceptan archivos PDF, HTML, MD o TXT')
    await adjuntarDocumento(fuente, a)
    nombreDoc = a.name
    avisar('Documento adjuntado')
  }

  async function adjuntar(e) {
    const input = e.currentTarget
    await guardarDoc(input.files?.[0])
    input.value = ''
  }

  function soltar(e) {
    e.preventDefault()
    e.stopPropagation()
    encima = false
    guardarDoc(e.dataTransfer?.files?.[0])
  }
</script>

<Modal {onclose} ancho={760}>
  {#snippet cabecera()}
    <div class="cab">
      <div class="fila envolver">
        <span class="pastilla {estado}"><span class="punto"></span>{ESTADOS_USO[estado]}</span>
        <span class="pastilla {fuente.estado_verificacion || 'no_verificado'}">
          {ESTADOS_VERIF[fuente.estado_verificacion] || 'No verificado'}{fuente.fuente_verificacion ? ` (${fuente.fuente_verificacion})` : ''}
        </span>
      </div>
      <div class="fila titulo">
        <span class="suave"><Icono nombre={icono[fuente.tipo_fuente] || 'doc'} /></span>
        <h2 class="serif">{autorCorto(fuente)} ({anio(fuente)})</h2>
      </div>
      <div class="bib suave">{bib}</div>
    </div>
  {/snippet}

  {#if editandoFuente}
    <FuenteForm {fuente} oncancelar={() => (editandoFuente = false)} onguardar={d => { guardarFuente({ ...d, id: fuente.id }); editandoFuente = false }} />
  {:else}
    <div class="fila envolver acciones">
      <button class="btn chico" onclick={() => copiar(bib)}><Icono nombre="copiar" tam={12} trazo={2} />Copiar bibliografía</button>
      {#if url}<a class="btn chico" href={url} target="_blank" rel="noopener">Ver fuente ↗</a>{/if}
      <button class="btn chico" onclick={() => (editandoFuente = true)}>Editar fuente</button>
    </div>

    <!-- Zona para arrastrar y soltar el documento original (o tocar para elegirlo) -->
    <div
      class="zona" class:encima class:con-doc={!!fuente.documento_original}
      role="button" tabindex="0" aria-label="Adjuntar documento original: arrastra aquí o haz clic"
      onclick={() => archivo.click()}
      onkeydown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), archivo.click())}
      ondragover={e => { e.preventDefault(); e.stopPropagation(); encima = true }}
      ondragleave={e => !e.currentTarget.contains(e.relatedTarget) && (encima = false)}
      ondrop={soltar}
    >
      <Icono nombre="clip" tam={20} />
      {#if fuente.documento_original}
        <div class="zona-txt">
          <b>{fuente.documento_nombre || nombreDoc || fuente.documento_original.split('/').pop()}</b>
          <span class="suave">Suelta otro archivo aquí para reemplazarlo</span>
        </div>
        <span class="fila">
          <button class="btn chico" onclick={e => { e.stopPropagation(); abrirDocumento() }}>Abrir</button>
          <button class="btn chico fantasma" onclick={e => { e.stopPropagation(); confirm('¿Quitar el documento adjunto?') && quitarDocumento(fuente) }}>Quitar</button>
        </span>
      {:else}
        <div class="zona-txt">
          <b>Arrastra aquí el documento original</b>
          <span class="suave">PDF, HTML o MD · o haz clic para elegirlo</span>
        </div>
      {/if}
    </div>
    <input bind:this={archivo} type="file" accept=".pdf,.html,.htm,.md,.txt" hidden onchange={adjuntar} />
    {#if fuente.notas_correccion}<div class="notas"><span class="rotulo">Notas de corrección</span> {fuente.notas_correccion}</div>{/if}
  {/if}

  {#if fuente.puntos?.length}
    <div class="separador"></div>
    <div class="rotulo">Puntos clave para la tesis ({fuente.puntos.length})</div>
    <ul class="puntos">
      {#each fuente.puntos as p (p.id)}
        <li>
          <span class="chip-punto {p.tipo}">{TIPOS_PUNTO[p.tipo] || p.tipo}</span>
          {p.texto}
          <span class="suave">{p.pagina ? ` · p. ${p.pagina}` : ''}{p.objetivos?.length ? ` · ${p.objetivos.join(', ').toUpperCase()}` : ''}</span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if citaA.length || citadaEn.length}
    <div class="relaciones">
      {#if citaA.length}<div><span class="rotulo">Cita a</span> {citaA.map(f => `${autorCorto(f)} (${anio(f)})`).join(' · ')}</div>{/if}
      {#if citadaEn.length}<div><span class="rotulo">Citada en</span> {citadaEn.map(f => `${autorCorto(f)} (${anio(f)})`).join(' · ')}</div>{/if}
    </div>
  {/if}

  <div class="separador"></div>
  <div class="rotulo">Citas extraídas de esta fuente ({reales.length})</div>

  <div class="lista">
    {#each reales as c (c.id)}
      {#if editando === c.id}
        <CitaForm {fuente} cita={c} onguardar={guardar} oncancelar={() => (editando = null)} />
      {:else}
        <div class="cita">
          <div class="fila entre">
            <div class="fila">
              <span class="pag">{paginaTexto(c.pagina) || 's. p.'}</span>
              <span class="tipo">{c.cita_textual_o_parafraseo === 'textual' ? 'Cita textual' : 'Paráfrasis'}</span>
              <span class="punto {c.estado_uso}" title={ESTADOS_USO[c.estado_uso]}></span>
            </div>
            <button class="btn chico" onclick={() => copiar(c.cita_en_texto)}><Icono nombre="copiar" tam={12} trazo={2} />Copiar</button>
          </div>
          <div class="caja-cita">{c.cita_en_texto || '—'}</div>
          <div class="fila entre">
            <span class="contexto">{c.contexto ? `Usada en ${c.contexto}.` : ESTADOS_USO[c.estado_uso]}</span>
            <span class="fila">
              <button class="btn chico fantasma" onclick={() => (editando = c.id)}>Editar</button>
              <button class="btn chico peligro" onclick={() => borrar(c)}>Eliminar</button>
            </span>
          </div>
        </div>
      {/if}
    {:else}
      {#if marcador}
        <div class="vacio fila entre envolver">
          <span class="suave">Aún no hay citas extraídas de esta fuente.</span>
          <select class="estado" aria-label="Estado de uso" value={marcador.estado_uso} onchange={e => guardarCita({ ...$state.snapshot(marcador), estado_uso: e.currentTarget.value })}>
            <option value="no_revisado">Sin revisar</option>
            <option value="revisado_no_usado">Revisado, no usado</option>
          </select>
        </div>
      {/if}
    {/each}
  </div>

  {#if editando === 'nueva'}
    <CitaForm {fuente} onguardar={guardar} oncancelar={() => (editando = null)} />
  {:else}
    <button class="agregar" onclick={() => (editando = 'nueva')}>+ Agregar cita desde esta fuente</button>
  {/if}

  <button class="btn peligro quitar" onclick={quitar}>Quitar fuente del proyecto</button>
</Modal>

<style>
  .puntos { margin: 6px 0 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; line-height: 1.5; }
  .chip-punto { display: inline-block; font-size: 10.5px; font-weight: 600; border-radius: 999px; padding: 1px 8px; margin-right: 4px; background: var(--paper-dim); color: var(--ink-soft); }
  .chip-punto.hallazgo { background: #DCEBD5; color: #2E6B3E; }
  .chip-punto.dato, .chip-punto.cita { background: #D6E6F2; color: #2A5575; }
  .chip-punto.metodo { background: #E5DAF0; color: #5B3F80; }
  .chip-punto.vacio { background: #F7D6D9; color: #8A2F3A; }
  .chip-punto.limitacion { background: #F8DCB8; color: #8A5217; }
  .chip-punto.definicion, .chip-punto.marco { background: #FBEFC0; color: #6B5516; }
  .relaciones { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 13px; }
  .cab { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .titulo { gap: 8px; }
  h2 { margin: 0; font-size: 21px; line-height: 1.3; }
  .bib { font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
  .acciones { gap: 6px; }
  .zona {
    display: flex; align-items: center; gap: 14px; padding: 18px 20px; cursor: pointer;
    border: 2px dashed var(--line); border-radius: 12px; background: var(--paper-hi); color: var(--ink-soft);
    transition: border-color .12s, background .12s;
  }
  .zona:hover, .zona:focus-visible { border-color: var(--ink-soft); }
  .zona.encima { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .zona.con-doc { border-style: solid; }
  .zona-txt { display: flex; flex-direction: column; gap: 3px; flex-grow: 1; min-width: 0; font-size: 13px; }
  .zona-txt b { color: var(--ink); font-weight: 500; overflow-wrap: anywhere; }
  .zona-txt .suave { font-size: 12px; }
  .notas { font-size: 13px; line-height: 1.5; color: var(--ink-soft); }
  .lista { display: flex; flex-direction: column; gap: 12px; }
  .cita { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
  .pag { font-size: 12px; font-weight: 600; }
  .tipo { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
  .contexto { font-size: 12px; color: var(--ink-soft); }
  .vacio { border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; font-size: 13px; }
  .estado { width: auto; font-size: 13px; padding: 5px 8px; }
  .agregar { padding: 11px 0; border-radius: 8px; border: 1px dashed var(--line); background: none; color: var(--ink-soft); font-size: 13px; }
  .agregar:hover { border-color: var(--ink-soft); color: var(--ink); }
  .quitar { align-self: center; font-size: 12px; }
</style>
