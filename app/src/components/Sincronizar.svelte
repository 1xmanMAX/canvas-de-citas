<script>
  // "Sincronizar con la PC": se pega (o, en Android, se escanea) el código de vinculación de la PC
  // y se sincroniza por la red local. El código queda guardado en este aparato.
  import Icono from './Icono.svelte'
  import { SA, cargarSincro, guardarCodigo, sincronizarAhora } from '../lib/sincro-app.svelte.js'
  import { esAndroid, nativo } from '../lib/plataforma.js'

  let { primera = false } = $props()
  cargarSincro()

  async function escanear() {
    try {
      const { codigo } = await nativo('Vinculo', 'escanear')
      await guardarCodigo(codigo)
      await sincronizarAhora()
    } catch (e) {
      if (!/cancelado/i.test(e?.message || '')) SA.error = e?.message || String(e)
    }
  }
</script>

<section class="sincro" class:primera>
  <h3 class="serif">Sincronizar con la PC</h3>
  <p class="suave">En la PC: Configuración → Vincular celular. {esAndroid ? 'Escanea su QR' : 'Copia aquí su código'} (o pega el código). Deben estar en el mismo Wi-Fi.</p>
  {#if esAndroid}
    <div class="fila"><button class="btn" disabled={SA.trabajando} onclick={escanear}><Icono nombre="qr" />Escanear QR de la PC</button></div>
  {/if}
  <label class="campo"><span>Código de vinculación</span>
    <input type="text" bind:value={SA.codigo} placeholder="canvas-sync://192.168.1.10:47481/#…" autocomplete="off" spellcheck="false" /></label>
  <div class="fila entre">
    <span class="suave estado">{SA.trabajando ? SA.progreso || 'Sincronizando…' : SA.ultima ? `Última: ${new Date(SA.ultima.fecha).toLocaleString('es-PE')} · ↓${SA.ultima.bajados} ↑${SA.ultima.subidos}` : 'Aún no se sincronizó'}</span>
    <button class="btn primario" disabled={SA.trabajando || !SA.codigo.trim()} onclick={() => sincronizarAhora()}>Sincronizar</button>
  </div>
  {#if SA.error}<p class="error" role="alert">{SA.error}</p>{/if}
</section>

<style>
  .sincro { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--line); padding-top: 16px; }
  .primera { border-top: none; padding-top: 0; }
  h3 { margin: 0; font-size: 16px; }
  p { margin: 0; font-size: 13px; }
  .estado { font-size: 12px; }
  .error { color: var(--unreviewed); }
</style>
