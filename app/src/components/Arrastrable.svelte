<script>
  // Grupo SVG que se puede tocar (abrir) o arrastrar dentro del Lienzo.
  import { getContext } from 'svelte'
  let { transform, clase = '', etiqueta, alTocar, inicio, mover, fin, children } = $props()
  const L = getContext('lienzo')
</script>

<g
  class={clase}
  {transform}
  role="button"
  tabindex="0"
  aria-label={etiqueta}
  onpointerdown={e => L.arrastrar(e, { inicio, mover, fin: (movido, cancelado) => (movido ? fin?.() : !cancelado && alTocar?.()) })}
  onkeydown={e => e.key === 'Enter' && alTocar?.()}
>{@render children()}</g>
