<script>
  // Crear o editar un agrupador: nombre, color y qué elementos del lienzo van dentro.
  import Modal from './Modal.svelte'
  import { COLORES_GRUPO } from '../lib/agrupadores.js'

  /** `elementos`: [{ id, nombre, tipo }]; `dentro`: ids que ya están en el recuadro. */
  let { nuevo = false, titulo = '', color = 'azul', elementos = [], dentro = [], onguardar, oneliminar, onacomodar, onclose } = $props()

  let nombre = $state(titulo)
  let tinta = $state(color)
  let marcados = $state(new Set(dentro))
  let filtro = $state('')
  const TIPOS = { fuente: 'Fuentes', nota: 'Notas', lista: 'Listas', audio: 'Notas de voz', foto: 'Fotos', indicador: 'Indicadores' }
  const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const visibles = $derived(filtro.trim() ? elementos.filter(e => norm(e.nombre).includes(norm(filtro.trim()))) : elementos)
  const porTipo = $derived(Object.entries(TIPOS).map(([t, rotulo]) => ({ t, rotulo, els: visibles.filter(e => e.tipo === t) })).filter(x => x.els.length))

  function alternar(id) {
    const s = new Set(marcados)
    s.has(id) ? s.delete(id) : s.add(id)
    marcados = s
  }
  const guardar = () => onguardar({ titulo: nombre, color: tinta, ids: [...marcados] })
</script>

<Modal titulo={nuevo ? 'Nuevo agrupador' : 'Agrupador'} {onclose} ancho={520}>
  <!-- svelte-ignore a11y_autofocus -->
  <label class="campo"><span>Nombre</span><input type="text" bind:value={nombre} placeholder="Marco teórico, Antecedentes, Pendientes…" autofocus /></label>
  <div class="fila colores" role="radiogroup" aria-label="Color">
    {#each Object.entries(COLORES_GRUPO) as [k, v]}
      <button class="color" role="radio" aria-checked={tinta === k} aria-label={k} style="--c:{v}" onclick={() => (tinta = k)}></button>
    {/each}
  </div>
  <div class="elegir">
    <div class="fila entre">
      <span class="rotulo">Elementos dentro · {marcados.size}</span>
      {#if elementos.length > 8}<input class="filtro" type="search" bind:value={filtro} placeholder="Buscar…" aria-label="Buscar elementos" />{/if}
    </div>
    {#if !elementos.length}
      <p class="suave">Este lienzo aún no tiene elementos. Crea el agrupador y arrastra cosas dentro.</p>
    {/if}
    <div class="lista">
      {#each porTipo as grupo (grupo.t)}
        <div class="tipo">{grupo.rotulo}</div>
        {#each grupo.els as e (e.id)}
          <label class="opcion"><input type="checkbox" checked={marcados.has(e.id)} onchange={() => alternar(e.id)} /><span>{e.nombre}</span></label>
        {/each}
      {/each}
    </div>
    <p class="suave pista">Lo marcado se acomoda dentro del recuadro; lo desmarcado sale a su derecha. También puedes arrastrar elementos adentro o afuera.</p>
  </div>
  <div class="fila entre">
    {#if !nuevo}
      <span class="fila">
        <button class="btn peligro" onclick={oneliminar} title="Quita el recuadro; los elementos se quedan">Quitar recuadro</button>
        <button class="btn" onclick={onacomodar}>Acomodar</button>
      </span>
    {:else}<span></span>{/if}
    <button class="btn primario" onclick={guardar}>{nuevo ? 'Crear agrupador' : 'Guardar'}</button>
  </div>
</Modal>

<style>
  .colores { gap: 8px; }
  .color { width: 26px; height: 26px; border-radius: 50%; border: 2px dashed var(--c); background: color-mix(in srgb, var(--c) 14%, var(--paper)); cursor: pointer; padding: 0; }
  .color[aria-checked='true'] { border-style: solid; box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px var(--c); }
  .elegir { display: flex; flex-direction: column; gap: 8px; }
  .filtro { width: 160px; padding: 5px 10px; font-size: 13px; }
  .lista { max-height: 300px; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; background: var(--paper-hi); }
  .tipo { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft); margin: 8px 0 2px; }
  .opcion { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13.5px; cursor: pointer; }
  .opcion span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pista { margin: 0; font-size: 12px; }
</style>
