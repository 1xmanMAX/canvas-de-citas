<script>
  import { untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import FuenteForm from './FuenteForm.svelte'
  import { S, guardarFuente, vincularFuente, avisar } from '../lib/store.svelte.js'
  import { autorCorto, anio, coincide } from '../lib/citas.js'

  let { proyectoId, onclose } = $props()
  let q = $state('')
  const enProyecto = $derived(new Set((S.citasPorProyecto.get(proyectoId) || []).map(c => c.fuente_id)))
  const disponibles = $derived(S.fuentes.filter(f => !enProyecto.has(f.id)))
  const filtradas = $derived(disponibles.filter(f => coincide(f, q)).slice(0, 60))
  let pestana = $state(untrack(() => (S.fuentes.length > enProyecto.size ? 'biblioteca' : 'nueva')))

  function crear(d) {
    const f = guardarFuente(d)
    vincularFuente(proyectoId, f.id)
    avisar('Fuente agregada')
    onclose()
  }

  function vincular(f) {
    vincularFuente(proyectoId, f.id)
    avisar(`${autorCorto(f)} agregada al proyecto`)
  }
</script>

<Modal titulo="Agregar fuente" {onclose} ancho={680}>
  <div class="segmentado">
    <button aria-pressed={pestana === 'biblioteca'} onclick={() => (pestana = 'biblioteca')}>De la biblioteca ({disponibles.length})</button>
    <button aria-pressed={pestana === 'nueva'} onclick={() => (pestana = 'nueva')}>Nueva fuente</button>
  </div>

  {#if pestana === 'nueva'}
    <FuenteForm onguardar={crear} textoBoton="Agregar al proyecto" />
  {:else}
    <input type="search" placeholder="Buscar por autor, año o título…" bind:value={q} aria-label="Buscar en la biblioteca" />
    <div class="lista">
      {#each filtradas as f (f.id)}
        <button class="item" onclick={() => vincular(f)}>
          <span class="serif">{autorCorto(f)} ({anio(f)})</span>
          <span class="suave">{f.titulo}</span>
        </button>
      {:else}
        <p class="suave">{disponibles.length ? 'Sin resultados.' : 'Todas las fuentes de la biblioteca ya están en este proyecto.'}</p>
      {/each}
    </div>
  {/if}
</Modal>

<style>
  .lista { display: flex; flex-direction: column; gap: 6px; }
  .item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper-dim); }
  .item:hover { border-color: var(--accent); }
  .item .serif { font-size: 14px; }
  .item .suave { font-size: 12px; }
</style>
