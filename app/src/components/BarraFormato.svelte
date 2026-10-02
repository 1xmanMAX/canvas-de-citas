<script>
  // Botones de formato para el campo de texto que se está escribiendo (lib/campo-formato.js).
  // No roban el foco: actúan sobre lo seleccionado en ese campo.
  import { marcar } from '../lib/campo-formato.js'

  const BOTONES = [
    { k: 'b', nombre: 'Negrita', atajo: 'Ctrl+B', letra: 'N' },
    { k: 'i', nombre: 'Cursiva', atajo: 'Ctrl+I', letra: 'C' },
    { k: 'u', nombre: 'Subrayado', atajo: 'Ctrl+U', letra: 'S' },
    { k: 'h', nombre: 'Resaltado', atajo: 'Ctrl+Shift+H', letra: 'R' }
  ]
</script>

<div class="barra-formato" role="toolbar" aria-label="Formato del texto">
  {#each BOTONES as b (b.k)}
    <button type="button" class="fmt {b.k}" title="{b.nombre} ({b.atajo})" aria-label={b.nombre}
      onpointerdown={e => e.preventDefault()} onclick={() => marcar(null, b.k)}><span>{b.letra}</span></button>
  {/each}
  <span class="suave ayuda">Selecciona texto y elige el formato</span>
</div>

<style>
  .barra-formato { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }
  .fmt { width: 30px; height: 28px; border: 1px solid var(--line); background: var(--paper); border-radius: 6px; padding: 0; color: var(--ink); font: 400 14px var(--serif); }
  .fmt:hover { border-color: var(--ink-soft); background: var(--paper-dim); }
  .fmt.b span { font-weight: 700; }
  .fmt.i span { font-style: italic; }
  .fmt.u span { text-decoration: underline; }
  .fmt.h span { background: #FBE38A; padding: 0 4px; border-radius: 3px; }
  .ayuda { font-size: 11.5px; margin-left: 6px; }
</style>
