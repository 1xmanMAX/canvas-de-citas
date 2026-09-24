<script>
  // Lápiz para anotar sobre una foto: trazos en coordenadas 0..1000 (se ven igual a cualquier tamaño).
  import Icono from './Icono.svelte'
  import { TINTAS } from '../lib/tarjetas.js'

  let { imagen, proporcion = 4 / 3, trazos = $bindable([]) } = $props()
  let color = $state('rojo')
  let grosor = $state(7)
  let W = $state(0)
  let svg
  let actual = null

  const punto = e => {
    const r = svg.getBoundingClientRect()
    const x = Math.round(Math.min(1000, Math.max(0, ((e.clientX - r.left) / r.width) * 1000)))
    const y = Math.round(Math.min(1000, Math.max(0, ((e.clientY - r.top) / r.height) * 1000)))
    return [x, y]
  }

  function abajo(e) {
    if (e.button === 2) return
    svg.setPointerCapture(e.pointerId)
    const [x, y] = punto(e)
    actual = { c: color, g: color === 'amarillo' ? 28 : grosor, p: [`${x},${y}`], x, y }
    trazos = [...trazos, actual]
  }

  function mover(e) {
    if (!actual) return
    const [x, y] = punto(e)
    if (Math.hypot(x - actual.x, y - actual.y) < 4) return
    actual.x = x
    actual.y = y
    const t = trazos.at(-1)
    trazos = [...trazos.slice(0, -1), { ...t, p: [...t.p, `${x},${y}`] }]
  }

  function arriba() {
    if (!actual) return
    // Un toque sin mover deja un punto visible.
    const t = trazos.at(-1)
    trazos = [...trazos.slice(0, -1), { c: t.c, g: t.g, p: t.p.length === 1 ? [t.p[0], t.p[0]] : t.p }]
    actual = null
  }
</script>

<div class="dibujo">
  <div class="herramientas">
    {#each Object.entries(TINTAS) as [nombre, valor]}
      <button class="tinta" class:activa={color === nombre} style="--c:{valor}" aria-label={nombre === 'amarillo' ? 'Resaltador' : `Tinta ${nombre}`} title={nombre === 'amarillo' ? 'Resaltador' : nombre} onclick={() => (color = nombre)}></button>
    {/each}
    <span class="div"></span>
    <button class="btn chico fantasma" aria-pressed={grosor === 4} onclick={() => (grosor = 4)}>Fino</button>
    <button class="btn chico fantasma" aria-pressed={grosor === 10} onclick={() => (grosor = 10)}>Grueso</button>
    <span class="espacio"></span>
    <button class="icono-btn" aria-label="Deshacer trazo" title="Deshacer" disabled={!trazos.length} onclick={() => (trazos = trazos.slice(0, -1))}><Icono nombre="deshacer" /></button>
    <button class="btn chico peligro" disabled={!trazos.length} onclick={() => (trazos = [])}>Borrar todo</button>
  </div>
  <div class="hoja" bind:clientWidth={W} style="aspect-ratio:{proporcion};max-width:calc(58dvh * {proporcion})">
    <img src={imagen} alt="" draggable="false" />
    <svg bind:this={svg} viewBox="0 0 1000 1000" preserveAspectRatio="none" role="img" aria-label="Área para dibujar sobre la foto"
      onpointerdown={abajo} onpointermove={mover} onpointerup={arriba} onpointercancel={arriba}>
      {#each trazos as t}
        <polyline points={t.p.join(' ')} stroke={TINTAS[t.c] || t.c} stroke-width={((t.g || 8) * W) / 1000} opacity={t.c === 'amarillo' ? 0.45 : 1} vector-effect="non-scaling-stroke" />
      {/each}
    </svg>
  </div>
  <p class="suave pista">Dibuja con el dedo o el ratón: subraya, encierra en un círculo o señala con flechas.</p>
</div>

<style>
  .dibujo { display: flex; flex-direction: column; gap: 8px; }
  .herramientas { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .tinta { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--paper); background: var(--c); box-shadow: 0 0 0 1px var(--line); padding: 0; }
  .tinta.activa { box-shadow: 0 0 0 2px var(--ink); }
  .div { width: 1px; height: 20px; background: var(--line); margin: 0 2px; }
  .espacio { flex-grow: 1; }
  .hoja { position: relative; border-radius: 8px; overflow: hidden; background: var(--paper-dim); line-height: 0; }
  .hoja { width: 100%; margin: 0 auto; }
  .hoja img { width: 100%; height: 100%; object-fit: cover; user-select: none; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
  polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .pista { margin: 0; font-size: 12px; }
</style>
