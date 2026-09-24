<script>
  // Chinchetas del tablero de corcho: van por encima de las tarjetas y de los hilos.
  let { cajas = [] } = $props()
  const COLORES = ['#C0392B', '#2F4FB5', '#E0A526', '#2B2B2B', '#2E7D4F']
  const color = id => COLORES[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES.length]
</script>

<g class="chinchetas">
  {#each cajas as c (c.id)}
    {@const x = c.x + c.w / 2}
    <circle cx={x + 1.6} cy={c.y + 11.5} r="7" fill="rgba(0,0,0,.28)" />
    <circle cx={x} cy={c.y + 9} r="7" fill={color(c.id)} />
    <circle cx={x - 2.3} cy={c.y + 6.7} r="2.1" fill="rgba(255,255,255,.6)" />
  {/each}
</g>

<style>
  .chinchetas { pointer-events: none; }
</style>
