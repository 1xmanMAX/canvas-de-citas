<script>
  // Diálogo nativo (<dialog>): foco atrapado y Esc sin código extra.
  import Icono from './Icono.svelte'
  let { titulo = '', ancho = 560, onclose, children, cabecera } = $props()
  let dialogo
  let activo = true

  $effect(() => {
    dialogo.showModal()
    return () => { activo = false; if (dialogo.open) dialogo.close() }
  })

  const cerrar = () => dialogo.close()
</script>

<dialog
  bind:this={dialogo}
  style="--ancho:{ancho}px"
  onclose={() => activo && onclose?.()}
  onclick={e => e.target === dialogo && cerrar()}
>
  <div class="modal">
    <div class="arriba">
      {#if cabecera}{@render cabecera()}{:else}<h2 class="serif">{titulo}</h2>{/if}
      <button class="icono-btn" aria-label="Cerrar" onclick={cerrar}><Icono nombre="cerrar" tam={20} trazo={2} /></button>
    </div>
    {@render children()}
  </div>
</dialog>

<style>
  dialog {
    width: min(var(--ancho), calc(100vw - 24px));
    max-height: min(820px, calc(100dvh - 24px - var(--sa-arriba) - var(--sa-abajo)));
    padding: 0; border: none; border-radius: 16px;
    background: var(--paper); color: var(--ink);
    box-shadow: 0 20px 50px rgba(0, 0, 0, .35);
    overflow: hidden;
  }
  dialog::backdrop { background: rgba(33, 31, 26, .55); }
  .modal { padding: 28px 32px; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; max-height: inherit; }
  .modal > :global(*) { flex-shrink: 0; }
  .arriba { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  h2 { margin: 0; font-size: 21px; line-height: 1.3; }
  @media (max-width: 820px) {
    dialog { width: 100vw; max-width: 100vw; max-height: calc(92dvh - var(--sa-arriba)); margin: auto 0 0; border-radius: 16px 16px 0 0; }
    .modal { padding: 20px calc(18px + var(--sa-der)) calc(20px + var(--sa-abajo)) calc(18px + var(--sa-izq)); }
  }
</style>
