<script>
  // Android: botón de la cabecera para sincronizar con la PC (sin código aún → Configuración).
  import Icono from './Icono.svelte'
  import { SA, sincronizarAhora } from '../lib/sincro-app.svelte.js'

  let { abrirDatos } = $props()
  const titulo = $derived(SA.trabajando ? SA.progreso || 'Sincronizando…' : SA.error ? `Sincronizar con la PC (último error: ${SA.error})` : 'Sincronizar con la PC')

  function pulsar() {
    if (!SA.codigo.trim() || SA.error) abrirDatos()
    if (SA.codigo.trim()) sincronizarAhora()
  }
</script>

<button class="icono-btn sincro-btn" class:girando={SA.trabajando} aria-label="Sincronizar con la PC" title={titulo} disabled={SA.trabajando} onclick={pulsar}>
  <Icono nombre="sincro" tam={18} />{#if SA.error}<span class="insignia">!</span>{/if}
</button>

<style>
  .sincro-btn { position: relative; }
  .girando :global(svg) { animation: girar 1s linear infinite; }
  @keyframes girar { to { transform: rotate(360deg); } }
  .insignia { position: absolute; top: 2px; right: 2px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--unreviewed); color: #fff; font-size: 10px; font-weight: 600; line-height: 16px; text-align: center; }
</style>
