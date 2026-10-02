<script>
  // Elegir la letra de una tarjeta. Cerrado: la letra actual con una muestra del propio texto.
  // Abierto: las letras agrupadas por uso; al pasar sobre una, la muestra cambia a esa letra.
  // `original`: primero "Original" (sin letra elegida: el estilo de siempre de esa tarjeta).
  import { LETRAS } from '../lib/tarjetas.js'
  import { sinFormato } from '../lib/formato.js'

  let { valor = $bindable(), original = false, muestra = '' } = $props()
  const GRUPOS = [
    ['Para leer y escribir', ['sans', 'libro', 'moderna', 'redonda']],
    ['Con carácter', ['serif', 'elegante', 'plumon']],
    ['A mano', ['mano', 'escolar', 'lapicero']],
    ['Máquina y código', ['mono', 'antigua', 'codigo']]
  ]
  let abierto = $state(false)
  let vista = $state(null) // letra bajo el mouse (vista previa)
  const elegida = $derived(valor || (original ? null : 'sans'))
  const previa = $derived(sinFormato(muestra).replace(/\s+/g, ' ').trim().slice(0, 70) || 'Así se verá tu texto')
  const estilo = k => {
    const L = LETRAS[k || 'sans']
    return `font-family:${L.css};font-weight:${L.normal};font-size:${Math.round(14 * Math.min(L.escala, 1.3))}px`
  }
  function elegir(k) {
    valor = k
    abierto = false
    vista = null
  }
</script>

<div class="selector-letra">
  <div class="fila-letra">
    <span class="rotulo">Letra</span>
    <button type="button" class="actual" aria-expanded={abierto} aria-label="Letra: {elegida ? LETRAS[elegida].nombre : 'Original'}" onclick={() => (abierto = !abierto)}>
      <b style={estilo(elegida)}>{elegida ? LETRAS[elegida].nombre : 'Original'}</b>
      <span class="muestra" style={estilo(elegida)}>{previa}</span>
      <span class="flecha" aria-hidden="true">{abierto ? '▴' : '▾'}</span>
    </button>
  </div>
  {#if abierto}
    <div class="panel-letras">
      <p class="vista" style={estilo(vista || elegida)}>{previa}</p>
      <div class="letras" role="radiogroup" aria-label="Letra">
        {#if original}
          <div class="grupo">
            <button role="radio" aria-checked={!elegida} class:activa={!elegida} onclick={() => elegir(undefined)}
              onpointerenter={() => (vista = null)}>Original</button>
          </div>
        {/if}
        {#each GRUPOS as [titulo, claves] (titulo)}
          <div class="grupo">
            <span class="rotulo-grupo">{titulo}</span>
            {#each claves as k (k)}
              <button role="radio" aria-checked={elegida === k} class:activa={elegida === k} title={LETRAS[k].nombre} style={estilo(k)}
                onclick={() => elegir(k)} onpointerenter={() => (vista = k)} onpointerleave={() => (vista = null)}>{LETRAS[k].nombre}</button>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .selector-letra { display: flex; flex-direction: column; gap: 8px; }
  .fila-letra { display: flex; align-items: center; gap: 12px; }
  .rotulo { width: 48px; flex-shrink: 0; }
  .actual { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; border: 1px solid var(--line); background: var(--paper); border-radius: 8px; padding: 6px 10px; text-align: left; color: var(--ink); }
  .actual:hover { border-color: var(--ink-soft); }
  .actual b { flex-shrink: 0; color: var(--accent); }
  .muestra { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-soft); }
  .flecha { color: var(--ink-soft); font-size: 12px; }
  .panel-letras { border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: var(--paper-dim); display: flex; flex-direction: column; gap: 8px; }
  .vista { margin: 0; padding: 8px 10px; background: var(--paper); border-radius: 6px; min-height: 22px; overflow-wrap: anywhere; }
  .letras { display: flex; flex-direction: column; gap: 6px; }
  .grupo { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .rotulo-grupo { width: 100%; font: 600 10.5px var(--sans); letter-spacing: .05em; text-transform: uppercase; color: var(--ink-soft); }
  .letras button { border: 1px solid var(--line); background: var(--paper); border-radius: 7px; padding: 4px 10px; line-height: 1.25; color: var(--ink); white-space: nowrap; }
  .letras button:hover { border-color: var(--ink-soft); }
  .letras button.activa { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
</style>
