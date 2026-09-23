<script>
  // Ventana "Citas extraídas de esta fuente" (mockup 3-fuente-citas).
  import Modal from './Modal.svelte'
  import Icono from './Icono.svelte'
  import CitaForm from './CitaForm.svelte'
  import FuenteForm from './FuenteForm.svelte'
  import { S, copiar, guardarCita, agregarCita, eliminarCita, guardarFuente, quitarFuenteDeProyecto, adjuntarDocumento, quitarDocumento, leerDocumento, avisar } from '../lib/store.svelte.js'
  import { ESTADOS_USO, ESTADOS_VERIF, estadoDeCitas, esMarcador, autorCorto, anio, urlFuente, sugerirBibliografia, paginaTexto } from '../lib/citas.js'

  let { fuente, proyectoId, onclose } = $props()

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

  async function abrirDocumento() {
    const d = await leerDocumento(fuente.id)
    if (!d?.blob) return avisar('El documento no está en este dispositivo (usa "Cargar desde carpeta")')
    const u = URL.createObjectURL(d.blob)
    window.open(u, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(u), 60000)
  }

  async function adjuntar(e) {
    const input = e.currentTarget
    const a = input.files?.[0]
    if (!a) return
    await adjuntarDocumento(fuente, a)
    avisar('Documento adjuntado')
    input.value = ''
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
      {#if fuente.documento_original}
        <button class="btn chico" onclick={abrirDocumento}><Icono nombre="clip" tam={12} trazo={2} />Documento</button>
        <button class="btn chico fantasma" onclick={() => confirm('¿Quitar el documento adjunto?') && quitarDocumento(fuente)}>Quitar documento</button>
      {:else}
        <button class="btn chico" onclick={() => archivo.click()}><Icono nombre="clip" tam={12} trazo={2} />Adjuntar PDF/HTML/MD</button>
      {/if}
      <input bind:this={archivo} type="file" accept=".pdf,.html,.htm,.md,.txt" hidden onchange={adjuntar} />
      <button class="btn chico" onclick={() => (editandoFuente = true)}>Editar fuente</button>
    </div>
    {#if fuente.notas_correccion}<div class="notas"><span class="rotulo">Notas de corrección</span> {fuente.notas_correccion}</div>{/if}
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
  .cab { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .titulo { gap: 8px; }
  h2 { margin: 0; font-size: 21px; line-height: 1.3; }
  .bib { font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
  .acciones { gap: 6px; }
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
