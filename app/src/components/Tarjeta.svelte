<script>
  // Tarjeta libre del lienzo (nota, lista de tareas, tabla, nota de voz o foto) dibujada en SVG.
  import { getContext } from 'svelte'
  import Arrastrable from './Arrastrable.svelte'
  import { medir, COLORES, TINTAS, colorTrazo, esResaltado, fechaCorta, duracionTexto } from '../lib/tarjetas.js'
  import { sonando, reproducir } from '../lib/audio.svelte.js'

  let { lista, o, origen = false, resaltado = false, atenuado = false, alTocar, alternar, alVinculo = null, inicio, mover, fin, redimensionar = null,
    clavar = null, procedencia = null, pos = null } = $props()
  // clavar: en el lienzo de lectura de una fuente, la chincheta que la muestra también en el general.
  // procedencia: { texto, alTocar } en el general, la fuente de la que viene una tarjeta clavada.
  // pos: lugar donde se dibuja si no es el suyo (la tarjeta clavada, en el general).

  const d = $derived(medir(lista, o))
  const giro = $derived(lista === 'notas' ? (o.estilo === 'rayada' ? 1 : o.estilo === 'tarjeta' ? 0 : -2) : lista === 'fotos' ? 1.5 : 0)

  const papel = $derived(o.estilo === 'adhesiva' || !o.estilo ? COLORES[o.color] || COLORES.amarillo : '#FFFDF8')
  const suena = $derived(sonando.id === o.id)
  const parar = e => e.stopPropagation()
  const clase = $derived(`tarjeta ${lista} ${origen ? 'origen' : ''} ${atenuado ? 'atenuada' : ''}`)
  const etiqueta = { notas: 'Nota', listas: 'Lista de tareas', tablas: 'Tabla', audios: 'Nota de voz', fotos: 'Foto' }
  const teclaCasilla = (e, i) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alternar?.(i) } }
  const tocarPlay = () => o.audio && reproducir(o.id, o.audio)

  // Nivel de detalle: lejos, barras en lugar de texto (el texto sería ilegible y es lo más caro de dibujar).
  const L = getContext('lienzo')
  const simple = $derived(!!L?.vista?.simple)
  const barra = (x, y, texto, max, px = 6.4, h = 8) => ({ x, y, w: Math.max(12, Math.min(max, String(texto).length * px)), h })
  const barras = $derived.by(() => {
    if (!simple) return []
    if (lista === 'notas') return [
      ...d.titulo.map((t, i) => barra(16, d.tituloY[i] - 8, t, d.w - 32, 7)),
      ...d.lineas.map((t, i) => barra(16, d.y0 + i * d.L.lh - 9, txt(t), d.w - 32, d.L.lh > 20 ? 7 : 6.4, 9))
    ]
    if (lista === 'listas') return [
      ...d.titulo.map((t, i) => barra(14, 30 + i * 19 - 11, t, d.w - 60, 8, 11)),
      ...d.items.flatMap(it => [{ x: 14, y: it.y + 1, w: 13, h: 13 }, ...it.lineas.map((t, j) => barra(36, it.y + 3 + j * 17, txt(t), d.w - 50, 6.4, 9))])
    ]
    if (lista === 'tablas') return [
      ...d.titulo.map((t, i) => barra(12, 28 + i * 19 - 11, t, d.w - 24, 8, 11)),
      ...d.celdas.map(c => barra(c.x + 8, c.y + 8, txt(c.lineas[0] || ''), c.w - 16, 6.4, 9))
    ]
    if (lista === 'audios') return [{ x: 16, y: 50, w: d.w - 32, h: 24 }, ...d.lineas.map((t, i) => barra(16, d.y0 + i * 16 - 9, txt(t), d.w - 32, 6, 9))]
    return [...d.titulo.map((t, i) => barra(8, d.tituloY[i] - 9, t, d.iw, 6.8, 9)), ...d.texto.map((t, i) => barra(8, d.textoY[i] - 8, txt(t), d.iw, 6, 8)), ...d.anotacion.map((t, i) => barra(8, d.anotacionY[i] - 12, t, d.iw, 7, 12))]
  })
  // Renglones con formato (lib/formato.js): { texto, tramos }; los simples son texto.
  const txt = l => (typeof l === 'string' ? l : l.texto)
  const px = f => +(/(\d+(?:\.\d+)?)px/.exec(f || '')?.[1] || 12.5)
  const fondoSimple = $derived(lista === 'notas' ? papel : lista === 'audios' ? '#2F4FB5' : '#FFFDF8')
</script>

{#snippet tramos(l)}{#if typeof l === 'string'}{l}{:else}{#each l.tramos as s}<tspan font-weight={s.b ? 700 : null} font-style={s.i ? 'italic' : null} text-decoration={s.u ? 'underline' : null}>{s.t}</tspan>{/each}{/if}{/snippet}
{#snippet resalte(l, x, y, font)}{#if typeof l !== 'string'}{#each l.tramos as s}{#if s.h}<rect x={x + s.x - 1.5} y={y - px(font) * 0.95} width={s.w + 3} height={px(font) * 1.3} rx="2.5" class="resalte" />{/if}{/each}{/if}{/snippet}

<Arrastrable transform="translate({pos?.x ?? o.x} {pos?.y ?? o.y}) rotate({giro} {d.w / 2} {d.h / 2})" clase={clase} etiqueta={etiqueta[lista]} {alTocar} {inicio} {mover} {fin}>
  <rect x="2" y="5" width={d.w} height={d.h} rx="5" class="sombra" />

  {#if simple && lista !== 'fotos'}
    <rect width={d.w} height={d.h} rx="6" fill={fondoSimple} class:borde={lista !== 'audios'} />
    {#each barras as b}<rect x={b.x} y={b.y} width={b.w} height={b.h} rx="3" class="s-barra" class:clara={lista === 'audios'} />{/each}

  {:else if lista === 'notas'}
    <rect width={d.w} height={d.h} rx={o.estilo === 'tarjeta' ? 8 : 3} fill={papel} class:borde={o.estilo && o.estilo !== 'adhesiva'} />
    {#if o.estilo === 'tarjeta'}<rect width={d.w} height="6" rx="3" fill={COLORES[o.color] || COLORES.celeste} />{/if}
    {#if o.estilo === 'rayada'}
      {#each d.lineas as _, i}<line x1="0" x2={d.w} y1={d.y0 + i * d.L.lh + 5} y2={d.y0 + i * d.L.lh + 5} class="renglon" />{/each}
      {#if d.titulo.length}<line x1="0" x2={d.w} y1={d.tituloY.at(-1) + 8} y2={d.tituloY.at(-1) + 8} class="margen" />
      {:else}<line x1="10" x2="10" y1="0" y2={d.h} class="margen" />{/if}
    {/if}
    {#each d.titulo as l, i}<text x="16" y={d.tituloY[i]} class="n-titulo">{l}</text>{/each}
    {#each d.lineas as l, i}{@render resalte(l, 16, d.y0 + i * d.L.lh, d.L.font)}<text x="16" y={d.y0 + i * d.L.lh} style="font:{d.L.font}" class="n-texto" class:adh={o.estilo === 'adhesiva' || !o.estilo} class:vacia={!o.texto && !d.titulo.length}>{@render tramos(l)}</text>{/each}
    {#if o.creado}<text x={d.w - 12} y={d.fechaY} text-anchor="end" class="fecha">{fechaCorta(o.creado)}</text>{/if}

  {:else if lista === 'listas'}
    <rect width={d.w} height={d.h} rx="10" class="l-caja" />
    {#each d.titulo as l, i}<text x="14" y={d.tituloY[i]} class="l-titulo" style={o.letra ? `font:${d.fT}` : null}>{l}</text>{/each}
    <text x={d.w - 12} y="28" text-anchor="end" class="l-avance">{(o.items || []).filter(x => x.hecho).length}/{(o.items || []).length}</text>
    {#each d.items as it, i}
      <g class="casilla" role="checkbox" aria-checked={!!it.hecho} tabindex="0" aria-label={it.t}
        onpointerdown={parar} onclick={() => alternar?.(i)} onkeydown={e => teclaCasilla(e, i)}>
        <rect x="4" y={it.y - 4} width="30" height={it.lineas.length * 17 + 8} fill="transparent" />
        <rect x="14" y={it.y + 1} width="13" height="13" rx="3" class="c-caja" class:hecho={it.hecho} />
        {#if it.hecho}<path d="M16.5 {it.y + 7.5}l3 3 5-6" class="c-check" />{/if}
      </g>
      {#each it.lineas as l, j}{@render resalte(l, 36, it.y + d.baseI + j * d.lhI, d.fI)}<text x="36" y={it.y + d.baseI + j * d.lhI} class="l-item" class:hecho={it.hecho} style={o.letra ? `font:${d.fI}` : null}>{@render tramos(l)}</text>{/each}
    {/each}
    {#if o.creado}<text x={d.w - 12} y={d.fechaY} text-anchor="end" class="fecha">{fechaCorta(o.creado)}</text>{/if}

  {:else if lista === 'tablas'}
    <rect width={d.w} height={d.h} rx="8" class="l-caja" />
    {#each d.titulo as l, i}<text x="12" y={28 + i * 19} class="l-titulo" style={o.letra ? `font:${d.fTit}` : null}>{l}</text>{/each}
    {#each d.celdas as c}
      <rect x={c.x} y={c.y} width={c.w} height={c.h} class="t-celda-caja" class:cab={c.cab} style={c.fondo ? `fill:${c.fondo}` : ''} />
      {#each c.lineas as l, k}{@render resalte(l, c.x + 8, c.y + d.base + k * d.lh, d.fC)}<text x={c.x + 8} y={c.y + d.base + k * d.lh} class="t-celda" class:cab={c.cab} style={o.letra ? `font:${c.cab ? d.fCab : d.fC}` : null}>{@render tramos(l)}</text>{/each}
    {/each}
    <rect x={d.x0} y={d.ty} width={d.ancho} height={d.alto} rx="3" class="t-borde" />
    {#if d.mas}<text x={d.x0} y={d.masY} class="fecha">+{d.mas} filas más</text>{/if}

  {:else if lista === 'audios'}
    <rect width={d.w} height={d.h} rx="8" class="a-caja" />
    <text x="16" y="25" class="a-rotulo">NOTA DE VOZ</text>
    <text x={d.w - 16} y="25" text-anchor="end" class="a-rotulo">{duracionTexto(o.duracion)}</text>
    <g class="a-play" role="button" tabindex="0" aria-label={suena ? 'Pausar' : 'Reproducir'}
      onpointerdown={parar} onclick={tocarPlay} onkeydown={e => e.key === 'Enter' && tocarPlay()}>
      <circle cx="34" cy="62" r="17" />
      {#if suena}<path d="M28 55h4v14h-4zM36 55h4v14h-4z" class="a-icono" />{:else}<path d="M29 53l14 9-14 9z" class="a-icono" />{/if}
    </g>
    {#each o.onda || [] as v, i}
      {@const h = 3 + v * 34}
      <rect x={64 + i * ((d.w - 80) / o.onda.length)} y={62 - h / 2} width="2" height={h} rx="1" class="a-barra" class:suena />
    {/each}
    {#each d.lineas as l, i}{@render resalte(l, 16, d.y0 + i * d.lh, d.fA)}<text x="16" y={d.y0 + i * d.lh} class="a-texto" class:vacia={!o.transcripcion} style={o.letra ? `font:${d.fA}` : null}>{@render tramos(l)}</text>{/each}
    {#if o.creado}<text x="16" y={d.fechaY} class="a-fecha">{fechaCorta(o.creado)}</text>{/if}

  {:else}
    <rect width={d.w} height={d.h} rx="4" class="f-marco" />
    <clipPath id="clip-{o.id}"><rect x="8" y="8" width={d.iw} height={d.ih} rx="2" /></clipPath>
    <rect x="8" y="8" width={d.iw} height={d.ih} fill="#E4E0D4" />
    <image href={o.imagen} x="8" y="8" width={d.iw} height={d.ih} preserveAspectRatio="xMidYMid meet" clip-path="url(#clip-{o.id})" />
    {#if simple}
      {#each barras as b}<rect x={b.x} y={b.y} width={b.w} height={b.h} rx="3" class="s-barra" />{/each}
    {:else}
    {#if o.trazos?.length}
      <svg x="8" y="8" width={d.iw} height={d.ih} viewBox="0 0 1000 1000" preserveAspectRatio="none" class="trazos">
        {#each o.trazos as t}
          <polyline points={t.p.join(' ')} stroke={colorTrazo(t)} stroke-width={((t.g || 8) * d.iw) / 1000} opacity={esResaltado(t) ? 0.45 : 1} vector-effect="non-scaling-stroke" />
        {/each}
      </svg>
    {/if}
    {#each d.titulo as l, i}<text x="8" y={d.tituloY[i]} class="f-titulo" style={o.letra ? `font:${d.fT}` : null}>{l}</text>{/each}
    {#each d.texto as l, i}{@render resalte(l, 8, d.textoY[i], d.fX)}<text x="8" y={d.textoY[i]} class="f-texto" style={o.letra ? `font:${d.fX}` : null}>{@render tramos(l)}</text>{/each}
    {#each d.anotacion as l, i}<text x="8" y={d.anotacionY[i]} class="f-mano">{l}</text>{/each}
    {#if redimensionar}
      <rect x={d.w - 18} y={d.h - 18} width="20" height="20" rx="4" class="esquina" role="button" tabindex="-1" aria-label="Cambiar tamaño de la foto"
        onpointerdown={e => L.arrastrar(e, redimensionar)} />
    {/if}
    {/if}
  {/if}

  {#if !simple && d.chips}
    {#each d.chips as c}
      <g transform="translate({c.x} {d.chipsY})" class="etq" class:persona={c.persona}>
        <rect width={c.w} height="17" rx="8.5" fill={c.color} />
        <text x={c.w / 2} y="12" text-anchor="middle">{c.t}</text>
      </g>
    {/each}
  {/if}

  {#if origen || resaltado}<rect x="-4" y="-4" width={d.w + 8} height={d.h + 8} rx="10" class="marca" />{/if}
  {#if o.origen && alVinculo}
    <!-- Vínculo: abre el documento en el punto exacto de donde salió esta cita -->
    <g class="vinculo" transform="translate({d.w - 70} -10)" role="button" tabindex="0" aria-label="Ir a la cita en el documento"
      onpointerdown={parar} onclick={alVinculo} onkeydown={e => e.key === 'Enter' && alVinculo()}>
      <title>Ir a la cita en el documento</title>
      <rect width="66" height="20" rx="10" />
      <text x="33" y="14" text-anchor="middle">↗ Vínculo</text>
    </g>
  {/if}
  {#if clavar}
    <!-- Chincheta: clavada (roja), la tarjeta también se ve en el lienzo general del proyecto -->
    {@const puesta = !!o.en_general}
    <g class="clavar" class:puesta transform="translate(-8 -8)" role="switch" tabindex="0" aria-checked={puesta}
      aria-label={puesta ? 'Quitar del lienzo general' : 'Clavar en el lienzo general'}
      onpointerdown={parar} onclick={e => { parar(e); clavar() }} onkeydown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), clavar())}>
      <title>{puesta ? 'Clavada en el lienzo general (toca para quitarla)' : 'Clavar en el lienzo general'}</title>
      <circle cx="10" cy="10" r="13" class="clavar-area" />
      {#if puesta}<circle cx="11.6" cy="12.5" r="8" class="clavar-sombra" />{/if}
      <circle cx="10" cy="10" r="8" class="clavar-cabeza" />
      <circle cx="7.6" cy="7.6" r="2.3" class="clavar-brillo" />
    </g>
  {/if}
  {#if procedencia && !simple}
    <!-- En el general: de qué fuente viene la tarjeta clavada (abre su lienzo de lectura) -->
    {@const w = Math.min(d.w - 8, procedencia.texto.length * 6.2 + 26)}
    <g class="procedencia" transform="translate(4 {d.h + 5})" role="button" tabindex="0" aria-label="Abrir el lienzo de lectura de {procedencia.texto}"
      onpointerdown={parar} onclick={e => { parar(e); procedencia.alTocar() }} onkeydown={e => e.key === 'Enter' && procedencia.alTocar()}>
      <title>Clavada desde el lienzo de lectura de {procedencia.texto}</title>
      <rect width={w} height="18" rx="4" />
      <circle cx="10" cy="9" r="3.6" class="procedencia-pin" />
      <text x="19" y="12.6">{procedencia.texto}</text>
    </g>
  {/if}

</Arrastrable>

<style>
  :global(.tarjeta) { cursor: grab; }
  .etq text { font: 600 10.5px 'Work Sans', system-ui, sans-serif; fill: #3A372F; }
  .etq.persona rect { stroke: #2F4FB5; stroke-width: 1; }
  .etq.persona text { fill: #2F4FB5; }
  .esquina { fill: var(--ink); opacity: 0; cursor: nwse-resize; }
  :global(.tarjeta:hover) .esquina { opacity: .3; }
  :global(.tarjeta.atenuada) { opacity: .28; }
  text { user-select: none; pointer-events: none; }
  .sombra { fill: rgba(33, 31, 26, .12); }
  .s-barra { fill: var(--ink); opacity: .45; pointer-events: none; }
  .vinculo { cursor: pointer; }
  .vinculo rect { fill: var(--accent); stroke: var(--paper); stroke-width: 1.5; }
  .vinculo:hover rect, .vinculo:focus-visible rect { fill: #C0392B; }
  .vinculo:focus { outline: none; }
  .vinculo text { font: 600 10.5px var(--sans); fill: #fff; }
  .clavar { cursor: pointer; }
  .clavar:focus { outline: none; }
  .clavar-area { fill: transparent; }
  .clavar-cabeza { fill: var(--paper); stroke: var(--ink-soft); stroke-width: 1.6; stroke-dasharray: 3 2.4; }
  .clavar-brillo { fill: none; }
  .clavar:hover .clavar-cabeza, .clavar:focus-visible .clavar-cabeza { stroke: #C0392B; stroke-dasharray: none; }
  .clavar.puesta .clavar-cabeza { fill: #C0392B; stroke: #8E1B14; stroke-dasharray: none; }
  .clavar.puesta .clavar-brillo { fill: rgba(255, 255, 255, .6); }
  .clavar-sombra { fill: rgba(0, 0, 0, .25); }
  .procedencia { cursor: pointer; }
  .procedencia:focus { outline: none; }
  .procedencia rect { fill: var(--paper); stroke: var(--line); }
  .procedencia:hover rect, .procedencia:focus-visible rect { stroke: var(--accent); }
  .procedencia-pin { fill: #C0392B; }
  .procedencia text { font: 600 10px var(--sans); fill: var(--ink-soft); }
  .s-barra.clara { fill: #fff; opacity: .6; }
  .borde { stroke: var(--line); }
  .marca { fill: none; stroke: var(--accent); stroke-width: 2.5; }
  .renglon { stroke: #BCD0E2; stroke-width: 1; }
  .margen { stroke: #D98C8C; stroke-width: 1.2; }
  .n-titulo { font: 600 10.5px var(--sans); letter-spacing: .06em; fill: var(--ink); }
  .n-texto { fill: var(--ink); }
  .n-texto.adh { fill: var(--nota-ink); }
  .vacia { opacity: .5; }
  .fecha { font: 400 10px var(--sans); fill: var(--ink-soft); opacity: .8; }
  .l-caja { fill: #FFFDF8; stroke: var(--line); }
  .l-titulo { font: 600 14px var(--serif); fill: var(--ink); }
  .l-avance { font: 600 10.5px var(--sans); fill: var(--using); }
  .l-item { font: 400 12.5px var(--sans); fill: var(--ink); }
  .l-item.hecho { fill: var(--ink-soft); text-decoration: line-through; }
  .casilla { cursor: pointer; }
  .casilla:focus { outline: none; }
  .casilla:focus-visible .c-caja { stroke: var(--accent); stroke-width: 2; }
  .c-caja { fill: var(--paper); stroke: var(--ink-soft); stroke-width: 1.3; }
  .c-caja.hecho { fill: var(--using); stroke: var(--using); }
  .c-check { fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  .resalte { fill: #FBE38A; opacity: .85; pointer-events: none; }
  .t-celda-caja { fill: #FFFDF8; stroke: var(--line); stroke-width: 1; }
  .t-celda-caja.cab { fill: #EFEADF; }
  .t-borde { fill: none; stroke: #CFC8B8; stroke-width: 1; }
  .t-celda { font: 400 12px var(--sans); fill: var(--ink); }
  .t-celda.cab { font-weight: 600; }
  .a-caja { fill: #2F4FB5; }
  .a-rotulo { font: 600 10.5px var(--sans); letter-spacing: .08em; fill: rgba(255, 255, 255, .85); }
  .a-play { cursor: pointer; }
  .a-play:focus { outline: none; }
  .a-play circle { fill: #fff; }
  .a-play:hover circle, .a-play:focus-visible circle { fill: #F2C230; }
  .a-icono { fill: #2F4FB5; pointer-events: none; }
  .a-barra { fill: rgba(255, 255, 255, .8); pointer-events: none; }
  .a-barra.suena { fill: #F2C230; }
  .a-texto { font: italic 400 12px var(--sans); fill: #fff; }
  .a-fecha { font: 400 10px var(--sans); fill: rgba(255, 255, 255, .7); }
  .f-marco { fill: #FFFEFA; stroke: var(--line); }
  .trazos { pointer-events: none; overflow: hidden; }
  .trazos polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .f-titulo { font: 600 11.5px var(--sans); fill: var(--ink); }
  .f-texto { font: 400 11px var(--sans); fill: var(--ink-soft); }
  .f-mano { font: 500 19px var(--mano); fill: #C0392B; }
</style>
