<script>
  // Elegir la letra de una tarjeta: cada opción se ve escrita con su propia letra.
  // `original`: muestra primero "Original" (sin letra elegida: el estilo de siempre de esa tarjeta).
  import { LETRAS } from '../lib/tarjetas.js'

  let { valor = $bindable(), original = false } = $props()
  const elegida = $derived(valor || (original ? null : 'sans'))
  const tam = k => Math.round(14 * (LETRAS[k].escala > 1.2 ? 1.25 : 1))
</script>

<div class="opcion-letra">
  <span class="rotulo">Letra</span>
  <div class="letras" role="radiogroup" aria-label="Letra">
    {#if original}
      <button role="radio" aria-checked={!elegida} class:activa={!elegida} onclick={() => (valor = undefined)}>Original</button>
    {/if}
    {#each Object.entries(LETRAS) as [k, L] (k)}
      <button role="radio" aria-checked={elegida === k} class:activa={elegida === k} title={L.nombre}
        style="font-family:{L.css};font-weight:{L.normal};font-size:{tam(k)}px" onclick={() => (valor = k)}>{L.nombre}</button>
    {/each}
  </div>
</div>

<style>
  .opcion-letra { display: flex; align-items: flex-start; gap: 12px; }
  .rotulo { width: 48px; flex-shrink: 0; padding-top: 7px; }
  .letras { display: flex; flex-wrap: wrap; gap: 5px; max-height: 92px; overflow-y: auto; padding: 1px; }
  .letras button { border: 1px solid var(--line); background: var(--paper); border-radius: 7px; padding: 4px 10px; line-height: 1.25; color: var(--ink); white-space: nowrap; }
  .letras button:hover { border-color: var(--ink-soft); }
  .letras button.activa { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
</style>
