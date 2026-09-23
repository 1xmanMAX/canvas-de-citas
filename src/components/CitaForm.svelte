<script>
  import { untrack } from 'svelte'
  import { ESTADOS_USO, sugerirCitaEnTexto } from '../lib/citas.js'
  let { fuente, cita = {}, onguardar, oncancelar } = $props()

  const base = untrack(() => $state.snapshot(cita))
  let c = $state({ estado_uso: 'usando', cita_textual_o_parafraseo: 'textual', pagina: '', cita_en_texto: '', contexto: '', ...base, pagina: base.pagina ?? '' })
  // La cita en texto se sugiere sola hasta que el usuario la edita a mano.
  let manual = $state(!!base.cita_en_texto)
  const sugerida = $derived(sugerirCitaEnTexto(fuente, c))
  $effect(() => { if (!manual) c.cita_en_texto = sugerida })

  function enviar(e) {
    e.preventDefault()
    const pag = String(c.pagina ?? '').trim()
    onguardar({ ...c, pagina: pag === '' ? null : /^\d+$/.test(pag) ? +pag : pag })
  }
</script>

<form class="rejilla forma" onsubmit={enviar}>
  <label class="campo">
    <span>Estado de uso</span>
    <select bind:value={c.estado_uso}>{#each Object.entries(ESTADOS_USO) as [v, t]}<option value={v}>{t}</option>{/each}</select>
  </label>
  <div class="campo">
    <span>Tipo de cita</span>
    <div class="segmentado">
      <button type="button" aria-pressed={c.cita_textual_o_parafraseo === 'textual'} onclick={() => (c.cita_textual_o_parafraseo = 'textual')}>Cita textual</button>
      <button type="button" aria-pressed={c.cita_textual_o_parafraseo === 'parafraseo'} onclick={() => (c.cita_textual_o_parafraseo = 'parafraseo')}>Paráfrasis</button>
    </div>
  </div>
  <label class="campo"><span>Página</span><input type="text" inputmode="numeric" bind:value={c.pagina} placeholder="45 o 45-46" /></label>
  <div class="campo">
    <span class="fila entre">Cita en texto
      {#if manual}<button type="button" class="btn chico fantasma" onclick={() => (manual = false)}>Sugerir</button>{/if}
    </span>
    <input type="text" aria-label="Cita en texto" bind:value={c.cita_en_texto} oninput={() => (manual = true)} />
  </div>
  <label class="campo ancho"><span>Contexto (dónde se usa)</span><input type="text" bind:value={c.contexto} placeholder="Antecedentes, capítulo 2" /></label>
  <div class="fila fin ancho">
    <button type="button" class="btn fantasma" onclick={oncancelar}>Cancelar</button>
    <button class="btn primario">Guardar cita</button>
  </div>
</form>

<style>
  .forma { border: 1px solid var(--accent); border-radius: 10px; padding: 14px 16px; background: var(--paper-hi); }
</style>
