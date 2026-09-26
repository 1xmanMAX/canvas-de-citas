<script>
  // Ventana para crear o editar una tarjeta libre del lienzo (nota, lista o nota de voz; las fotos usan VisorFoto).
  import { untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import Icono from './Icono.svelte'
  import Grabador from './Grabador.svelte'
  import { LETRAS, PAPELES, COLORES, fechaCorta, duracionTexto } from '../lib/tarjetas.js'
  import { esAndroid } from '../lib/plataforma.js'
  import { transcribirAudio } from '../lib/voz.js'

  /** `o` es una copia editable; `vinculos` los nombres de lo que está conectado a la tarjeta. */
  let { lista, o = $bindable(), nueva = false, vinculos = [], onguardar, oneliminar, onduplicar, onvinculo = null, onclose } = $props()

  const TITULOS = { notas: ['Nueva nota', 'Nota'], listas: ['Nueva lista de tareas', 'Lista de tareas'], audios: ['Nueva nota de voz', 'Nota de voz'], fotos: ['Nueva foto', 'Foto'] }
  const titulo = $derived(TITULOS[lista][nueva ? 0 : 1])
  let nuevaTarea = $state('')
  let entradaTarea = $state()

  // --- Listas ---
  // Tarjetas antiguas pueden no tener estos campos (el editor se recrea por tarjeta: {#key}).
  untrack(() => {
    if (lista === 'listas') o.items ||= []
  })
  function agregarTarea(e) {
    e?.preventDefault()
    for (const t of nuevaTarea.split('\n').map(x => x.trim()).filter(Boolean)) o.items.push({ t, hecho: false })
    nuevaTarea = ''
    entradaTarea?.focus()
  }
  const quitarTarea = i => o.items.splice(i, 1)
  function moverTarea(i, d) {
    const j = i + d
    if (j < 0 || j >= o.items.length) return
    const [x] = o.items.splice(i, 1)
    o.items.splice(j, 0, x)
  }

  // --- Audio ---
  // En Android la transcripción se hace al terminar de grabar (ver lib/voz.js).
  let transcribiendo = $state(false)
  let errorVoz = $state('')
  function grabado(r) {
    Object.assign(o, r)
    if (esAndroid && !o.transcripcion?.trim()) transcribir()
  }
  async function transcribir() {
    if (o.transcripcion?.trim() && !confirm('¿Reemplazar la transcripción actual?')) return
    transcribiendo = true
    errorVoz = ''
    try {
      const texto = await transcribirAudio(o.audio)
      if (texto) o.transcripcion = texto
      else errorVoz = 'No se entendió nada en el audio.'
    } catch (e) {
      errorVoz = e?.message || String(e)
    } finally {
      transcribiendo = false
    }
  }
  const puedeGuardar = $derived(lista !== 'audios' || !!o.audio)

  function guardar() {
    if (lista === 'listas' && nuevaTarea.trim()) agregarTarea()
    onguardar(o)
  }
</script>

<Modal {titulo} {onclose} ancho={480}>
  {#if lista === 'notas'}
    <label class="campo"><span>Título (opcional)</span><input type="text" bind:value={o.titulo} placeholder="Extended Mind, p. 114" /></label>
    <!-- svelte-ignore a11y_autofocus -->
    <textarea rows="6" bind:value={o.texto} autofocus aria-label="Texto de la nota" style="font-family:{LETRAS[o.letra || 'sans'].css};font-size:{o.letra === 'mano' ? 21 : 14}px"
      class="texto-nota" placeholder="Escribe la idea, cita o pendiente…"></textarea>
    <div class="opciones">
      <div class="opcion"><span class="rotulo">Papel</span>
        <div class="segmentado">
          {#each Object.entries(PAPELES) as [k, v]}<button aria-pressed={(o.estilo || 'adhesiva') === k} onclick={() => (o.estilo = k)}>{v.nombre}</button>{/each}
        </div>
      </div>
      <div class="opcion"><span class="rotulo">Letra</span>
        <div class="segmentado">
          {#each Object.entries(LETRAS) as [k, v]}<button aria-pressed={(o.letra || 'sans') === k} style="font-family:{v.css}{k === 'mano' ? ';font-size:17px' : ''}" onclick={() => (o.letra = k)}>{v.nombre}</button>{/each}
        </div>
      </div>
      {#if o.estilo !== 'rayada'}
        <div class="opcion"><span class="rotulo">Color</span>
          <div class="colores">
            {#each Object.entries(COLORES) as [k, v]}
              <button class="color" class:activo={(o.color || (o.estilo === 'tarjeta' ? 'celeste' : 'amarillo')) === k} style="--c:{v}" aria-label="Color {k}" title={k} onclick={() => (o.color = k)}></button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

  {:else if lista === 'listas'}
    <!-- svelte-ignore a11y_autofocus -->
    <label class="campo"><span>Título</span><input type="text" bind:value={o.titulo} placeholder="Pendientes del capítulo 2" autofocus={nueva} /></label>
    <div class="tareas">
      {#each o.items as it, i}
        <div class="tarea">
          <input type="checkbox" bind:checked={it.hecho} aria-label="Hecha" />
          <input type="text" bind:value={it.t} class:hecho={it.hecho} aria-label="Tarea {i + 1}" />
          <button class="icono-btn mini" aria-label="Subir" title="Subir" disabled={i === 0} onclick={() => moverTarea(i, -1)}><span class="flecha">↑</span></button>
          <button class="icono-btn mini" aria-label="Bajar" title="Bajar" disabled={i === o.items.length - 1} onclick={() => moverTarea(i, 1)}><span class="flecha">↓</span></button>
          <button class="icono-btn mini" aria-label="Quitar tarea" title="Quitar" onclick={() => quitarTarea(i)}><Icono nombre="cerrar" tam={14} /></button>
        </div>
      {/each}
      <form class="tarea nueva" onsubmit={agregarTarea}>
        <Icono nombre="mas" tam={14} />
        <input type="text" bind:this={entradaTarea} bind:value={nuevaTarea} placeholder="Nueva tarea y Enter (o pega varias líneas)"
          onpaste={e => { const t = e.clipboardData?.getData('text/plain') || ''; if (t.includes('\n')) { e.preventDefault(); nuevaTarea = t; agregarTarea() } }} />
      </form>
    </div>

  {:else if lista === 'audios'}
    {#if !o.audio}
      <Grabador onlisto={grabado} />
    {:else}
      <audio controls src={o.audio} class="reproductor"></audio>
      <div class="suave meta">{duracionTexto(o.duracion)}{#if o.creado} · {fechaCorta(o.creado)}{/if}</div>
      <label class="campo"><span>Transcripción</span>
        <textarea rows="6" bind:value={o.transcripcion} disabled={transcribiendo} placeholder={transcribiendo ? 'Transcribiendo…' : 'Escribe o corrige lo que se dijo en el audio…'}></textarea></label>
      {#if esAndroid}
        <div class="fila entre">
          <span class="suave pista-voz" class:error={errorVoz} role={errorVoz ? 'alert' : undefined}>{transcribiendo ? 'Transcribiendo en el celular…' : errorVoz || 'Se transcribe en el celular, sin internet.'}</span>
          <button class="btn" disabled={transcribiendo} onclick={transcribir}><Icono nombre="mic" />Transcribir</button>
        </div>
      {/if}
    {/if}

  {/if}

  {#if o.origen && onvinculo}
    <button class="btn vinculo-doc" onclick={onvinculo}>
      <Icono nombre="externo" tam={14} />Vínculo: ir a la cita en el documento{o.origen.pagina ? ` (pág. ${o.origen.pagina})` : ''}
    </button>
  {/if}
  {#if vinculos.length}
    <div class="vinculos">
      <span class="rotulo">Vinculado con · {vinculos.length}</span>
      <ul>{#each vinculos as v}<li>{v}</li>{/each}</ul>
    </div>
  {/if}

  <div class="fila entre">
    <div class="fila">
      {#if !nueva}
        <button class="btn peligro" onclick={oneliminar}>Eliminar</button>
        <button class="btn fantasma" onclick={onduplicar}><Icono nombre="duplicar" tam={14} />Duplicar</button>
      {/if}
    </div>
    <button class="btn primario" disabled={!puedeGuardar} onclick={guardar}>Guardar</button>
  </div>
</Modal>

<style>
  .texto-nota { resize: vertical; line-height: 1.45; }
  .pista-voz { font-size: 12px; }
  .pista-voz.error { color: var(--unreviewed); }
  .opciones { display: flex; flex-direction: column; gap: 10px; }
  .opcion { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .opcion .rotulo { width: 48px; }
  .colores { display: flex; gap: 6px; }
  .color { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--paper); background: var(--c); box-shadow: 0 0 0 1px var(--line); padding: 0; }
  .color.activo { box-shadow: 0 0 0 2px var(--ink); }
  .tareas { display: flex; flex-direction: column; gap: 4px; max-height: 46dvh; overflow-y: auto; }
  .tarea { display: flex; align-items: center; gap: 6px; }
  .tarea input[type='text'] { flex-grow: 1; min-width: 0; padding: 6px 10px; }
  .tarea input.hecho { text-decoration: line-through; color: var(--ink-soft); }
  .tarea input[type='checkbox'] { width: 17px; height: 17px; flex-shrink: 0; accent-color: var(--using); }
  .tarea.nueva { color: var(--ink-soft); padding-left: 1px; }
  .mini { width: 26px; height: 26px; }
  .flecha { font-size: 13px; }
  .reproductor { width: 100%; }
  .meta { font-size: 12px; margin-top: -10px; }
  .mano { font-family: var(--mano); font-size: 20px; color: #C0392B; }
  .vinculos { border-top: 1px solid var(--line); padding-top: 12px; }
  .vinculo-doc { align-self: flex-start; border-color: var(--accent); color: var(--accent); }
  .vinculos ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.6; }
</style>
