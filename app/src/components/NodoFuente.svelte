<script>
  // Tarjeta de fuente dibujada en SVG (sin foreignObject: más rápido y consistente).
  import { getContext } from 'svelte'
  import { S } from '../lib/store.svelte.js'
  import { F, recortar } from '../lib/texto.js'
  import { NODO_W, alturaNodo, anchoChip } from '../lib/grafo.js'

  let {
    x, y, anio, autor, linea2 = '', chips = [], estado, seleccionado = false, resaltado = false,
    atenuado = false, pista = '', alAbrir, inicio, mover, fin,
    lectura = null, alLectura = null // { total, clavadas } de su lienzo de lectura: contador que lo abre
  } = $props()
  const nLectura = $derived(lectura?.total || 0)
  const wLectura = $derived(String(nLectura).length * 7 + 30)

  const L = getContext('lienzo')
  const COLOR = { usando: 'var(--using)', verificado: 'var(--using)', revisado_no_usado: 'var(--reviewed)', dudoso: 'var(--reviewed)', no_revisado: 'var(--unreviewed)', no_verificado: 'var(--unreviewed)' }
  const h = $derived(alturaNodo(!!linea2, chips.length > 0))
  const t = $derived.by(() => {
    S.tipografias
    let cx = 12
    const cs = []
    for (const c of chips.slice(0, 2)) {
      const txt = recortar(c, F.mini, NODO_W - 40 - (cx - 12))
      const w = anchoChip(txt)
      if (cx + w > NODO_W - 8) break
      cs.push({ txt, x: cx, w })
      cx += w + 4
    }
    return { autor: recortar(autor, F.autor, NODO_W - 24), linea2: recortar(linea2, F.chico, NODO_W - 24), chips: cs }
  })

  function abajo(e) {
    L.arrastrar(e, { inicio, mover, fin: (movido, cancelado) => (movido ? fin?.() : !cancelado && alAbrir?.()) })
  }
</script>

<g
  class="nodo"
  class:atenuado
  transform="translate({x} {y})"
  role="button"
  tabindex="0"
  aria-label="{autor} {anio}"
  onpointerdown={abajo}
  onkeydown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), alAbrir?.())}
>
  <rect
    width={NODO_W} height={h} rx="10"
    fill={seleccionado ? 'var(--paper)' : 'var(--paper-dim)'}
    stroke={seleccionado ? 'var(--accent)' : resaltado ? COLOR[estado] : 'var(--line)'}
    stroke-width={seleccionado || resaltado ? 2 : 1}
  />
  <circle cx="16" cy="17" r="4" fill={COLOR[estado]} />
  {#if L.vista?.simple}
    <!-- Lejos: barras en lugar de texto (mucho menos que dibujar) -->
    <rect x="12" y="29" width={Math.min(NODO_W - 24, 12 + t.autor.length * 7)} height="10" rx="3" class="barra" />
  {:else}
    <text x="26" y="21" class="chico">{anio}</text>
    <text x="12" y="39" class="autor">{t.autor}</text>
    {#if linea2}<text x="12" y="55" class="chico">{t.linea2}</text>{/if}
    {#if pista}<text x={NODO_W - 12} y="21" class="pista" text-anchor="end">{pista}</text>{/if}
    {#each t.chips as c}
      <g transform="translate({c.x} {h - 27})">
        <rect width={c.w} height="17" rx="8.5" fill="var(--paper)" stroke="var(--line)" />
        <text x={c.w / 2} y="12" text-anchor="middle" class="mini">{c.txt}</text>
      </g>
    {/each}
  {/if}
  {#if nLectura && alLectura}
    <!-- Contador del lienzo de lectura de la fuente (sus citas, recortes y notas): lo abre -->
    <g class="contador-lectura" transform="translate({NODO_W - wLectura + 8} -9)" role="button" tabindex="0"
      aria-label="Lienzo de lectura: {nLectura} {nLectura === 1 ? 'tarjeta' : 'tarjetas'}"
      onpointerdown={e => e.stopPropagation()} onclick={e => { e.stopPropagation(); alLectura() }}
      onkeydown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.stopPropagation(), alLectura())}>
      <title>Lienzo de lectura: {nLectura} {nLectura === 1 ? 'tarjeta' : 'tarjetas'}{lectura.clavadas ? `, ${lectura.clavadas} en el lienzo general` : ''}</title>
      <rect width={wLectura} height="18" rx="9" />
      <path d="M8 5h5l3 3v6H8z" class="lectura-doc" />
      <text x="21" y="13">{nLectura}</text>
    </g>
  {/if}
</g>

<style>
  .contador-lectura { cursor: pointer; }
  .contador-lectura:focus { outline: none; }
  .contador-lectura rect { fill: var(--accent); stroke: var(--paper); stroke-width: 1.5; }
  .contador-lectura:hover rect, .contador-lectura:focus-visible rect { fill: #C0392B; }
  .lectura-doc { fill: none; stroke: #fff; stroke-width: 1.2; stroke-linejoin: round; pointer-events: none; }
  .contador-lectura text { font: 600 10.5px var(--sans); fill: #fff; }
  .nodo { cursor: pointer; }
  .nodo:focus { outline: none; }
  .nodo:focus-visible rect:first-child { stroke: var(--accent); stroke-width: 2; }
  .nodo:hover rect:first-child { stroke: var(--ink-soft); }
  .atenuado { opacity: .28; }
  text { fill: var(--ink-soft); pointer-events: none; }
  .chico { font: 400 11px var(--sans); }
  .mini { font: 400 10px var(--sans); }
  .autor { font: 600 13px var(--serif); fill: var(--ink); }
  .pista { font: 500 10px var(--sans); fill: var(--using); }
  .barra { fill: var(--ink); opacity: .55; pointer-events: none; }
</style>
