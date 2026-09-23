<script>
  import { untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import { S, guardarProyecto, eliminarProyecto } from '../lib/store.svelte.js'
  import { TIPOS_PROYECTO } from '../lib/citas.js'

  let { proyecto = null, onclose, oncreado } = $props()
  const base = untrack(() => (proyecto ? $state.snapshot(proyecto) : { tipo: 'tesis' }))
  let p = $state({ ...base })
  let objetivos = $state((base.objetivos_especificos || []).join('\n'))
  let indicadores = $state((base.indicadores || []).join('\n'))
  const lineas = t => t.split('\n').map(s => s.trim()).filter(Boolean)

  function enviar(e) {
    e.preventDefault()
    if (!p.titulo?.trim()) return
    const item = guardarProyecto({ ...p, objetivos_especificos: lineas(objetivos), indicadores: lineas(indicadores) })
    if (!proyecto) oncreado?.(item.id)
    onclose()
  }

  function borrar() {
    const n = (S.citasPorProyecto.get(proyecto.id) || []).length
    if (!confirm(`¿Eliminar "${proyecto.titulo}" y sus ${n} citas? Las fuentes quedan en la biblioteca.`)) return
    eliminarProyecto(proyecto.id)
    location.hash = '#/'
  }
</script>

<Modal titulo={proyecto ? 'Editar ficha del proyecto' : 'Nuevo proyecto'} {onclose} ancho={620}>
  <form class="rejilla" onsubmit={enviar}>
    <label class="campo ancho"><span>Título *</span><input type="text" bind:value={p.titulo} required /></label>
    <label class="campo">
      <span>Tipo</span>
      <select bind:value={p.tipo}>{#each Object.entries(TIPOS_PROYECTO) as [v, t]}<option value={v}>{t}</option>{/each}</select>
    </label>
    <label class="campo"><span>Área</span><input type="text" bind:value={p.area} placeholder="Ingeniería Civil" /></label>
    <label class="campo ancho"><span>Objetivo general</span><textarea rows="2" bind:value={p.objetivo_general}></textarea></label>
    <label class="campo ancho"><span>Objetivos específicos (uno por línea)</span><textarea rows="3" bind:value={objetivos}></textarea></label>
    <label class="campo ancho"><span>Indicadores (uno por línea)</span><textarea rows="2" bind:value={indicadores}></textarea></label>
    <div class="fila entre ancho">
      {#if proyecto}<button type="button" class="btn peligro" onclick={borrar}>Eliminar proyecto</button>{:else}<span></span>{/if}
      <button class="btn primario">{proyecto ? 'Guardar' : 'Crear proyecto'}</button>
    </div>
  </form>
</Modal>
