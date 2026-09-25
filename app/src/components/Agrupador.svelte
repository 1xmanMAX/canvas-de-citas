<script>
  // Recuadro punteado con nombre que agrupa elementos del lienzo (lib/agrupadores.js). Siempre
  // se ajusta a su contenido (`caja`); se arrastra por el nombre o por el borde y se lleva a sus
  // miembros. El interior no captura toques: se puede desplazar el lienzo y usar lo de dentro.
  // Se dibuja en dos capas: `fondo` (recuadro, debajo de todo) y `frente` (el nombre, encima de
  // las tarjetas para que nunca quede tapado).
  import { getContext } from 'svelte'
  import { S } from '../lib/store.svelte.js'
  import { ancho } from '../lib/texto.js'
  import { COLORES_GRUPO } from '../lib/agrupadores.js'

  let { g, caja, capa = 'fondo', n = 0, lejos = false, resaltado = false, alTocar, arrastre } = $props()
  const L = getContext('lienzo')
  const FUENTE = '600 14px "Work Sans", system-ui, sans-serif'
  const color = $derived(COLORES_GRUPO[g.color] || COLORES_GRUPO.azul)
  const texto = $derived(g.titulo + (n ? `  · ${n}` : ''))
  const wTitulo = $derived((S.tipografias, Math.min(caja.w - 16, ancho(texto, FUENTE) + 28)))

  const tocarOArrastrar = e => L.arrastrar(e, { ...arrastre, fin: (movido, cancelado) => (movido ? arrastre.fin?.() : !cancelado && alTocar?.()) })
</script>

<g class="agrupador {capa}" class:resaltado style="--c:{color}">
{#if capa === 'fondo'}
  <rect class="relleno" x={caja.x} y={caja.y} width={caja.w} height={caja.h} rx="16" />
  <rect class="marco" x={caja.x} y={caja.y} width={caja.w} height={caja.h} rx="16" />
  <!-- Borde ancho e invisible: se puede tomar el recuadro por cualquier lado. -->
  <rect class="agarre" x={caja.x} y={caja.y} width={caja.w} height={caja.h} rx="16" role="presentation" onpointerdown={tocarOArrastrar} />
{:else}
  <g class="titulo" transform="translate({caja.x + 10} {caja.y + 10})" role="button" tabindex="0" aria-label="Agrupador: {g.titulo}"
    onpointerdown={tocarOArrastrar} onkeydown={e => e.key === 'Enter' && alTocar?.()}>
    <rect width={wTitulo} height={lejos ? 30 : 26} rx="13" />
    <text x="14" y={lejos ? 20 : 17.5} class:grande={lejos}>{texto}</text>
  </g>
{/if}
</g>

<style>
  .relleno { fill: var(--c); fill-opacity: .045; pointer-events: none; }
  .marco { fill: none; stroke: var(--c); stroke-width: 2; stroke-dasharray: 9 7; stroke-opacity: .75; pointer-events: none; }
  .resaltado .marco { stroke-width: 3.5; stroke-opacity: 1; }
  .agarre { fill: none; stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: move; }
  .titulo { cursor: grab; }
  .titulo rect { fill: var(--paper); stroke: var(--c); stroke-width: 1.5; }
  .titulo:hover rect, .titulo:focus-visible rect { fill: var(--c); fill-opacity: .12; }
  .titulo:focus { outline: none; }
  .titulo text { font: 600 14px var(--sans); fill: var(--c); letter-spacing: .01em; user-select: none; white-space: pre; }
  .titulo text.grande { font-size: 16px; }
</style>
