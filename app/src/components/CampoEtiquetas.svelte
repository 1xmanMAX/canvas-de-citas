<script>
  // Campo `etiquetas` como chips: temas (#tema, se guardan sin "#") y personas (@Persona).
  import { autocompletar } from '../lib/autocompletar.js'
  import { sugerir } from '../lib/buscador.svelte.js'
  import { normalizar } from '../lib/etiquetas.js'

  let { valor = $bindable(), rotulo = 'Etiquetas y personas' } = $props()
  let texto = $state('')

  function agregar() {
    const nuevas = [...(valor || [])]
    for (let t of texto.split(/[,\s]+/)) {
      t = t.trim().replace(/^#+/, '')
      if (!t || t === '@' || nuevas.some(x => normalizar(x) === normalizar(t))) continue
      nuevas.push(t)
    }
    valor = nuevas
    texto = ''
  }
  const quitar = i => (valor = (valor || []).filter((_, k) => k !== i))

  function tecla(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); agregar() }
    else if (e.key === 'Backspace' && !texto && valor?.length) quitar(valor.length - 1)
  }
</script>

<div class="campo">
  <span>{rotulo}</span>
  <div class="etiquetas">
    {#each valor || [] as t, i (t)}
      <span class="etq" class:persona={t.startsWith('@')}>
        {t.startsWith('@') ? t : '#' + t}
        <button type="button" aria-label="Quitar {t}" onclick={() => quitar(i)}>×</button>
      </span>
    {/each}
    <input type="text" bind:value={texto} onkeydown={tecla} onblur={agregar} use:autocompletar={{ sugerir }}
      placeholder={(valor || []).length ? '' : '#tema o @persona y Enter'} aria-label={rotulo} />
  </div>
</div>

<style>
  .etiquetas { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
  .etiquetas input { flex: 1 1 120px; min-width: 100px; border: none; padding: 4px; background: none; outline: none; box-shadow: none; }
  .etq { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px; border-radius: 999px; background: #E8E1F5; font-size: 12px; font-weight: 600; color: #3A372F; }
  .etq.persona { background: #FFFFFF; color: #2F4FB5; box-shadow: inset 0 0 0 1px #2F4FB5; }
  .etq button { border: none; background: none; padding: 0 4px; font-size: 14px; line-height: 1; color: inherit; cursor: pointer; }
</style>
