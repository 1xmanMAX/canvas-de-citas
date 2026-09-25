<!-- app/src/components/Sincronizar.svelte -->
<script>
  // "Sincronizar con la PC": se pega (o escanea, en Android) el código de vinculación de la PC y
  // se sincroniza por la red local. El código queda guardado en este aparato.
  import { leerMeta, ponerMeta, avisar } from '../lib/store.svelte.js'
  import { leerCodigo, crearConexion } from '../lib/sincro-http.js'
  import { sincronizar } from '../lib/sincro-cliente.js'
  import { almacenApp } from '../lib/sincro-almacen.js'

  let codigo = $state('')
  let ultima = $state(null)
  let trabajando = $state(false)
  let progreso = $state('')
  let error = $state('')
  leerMeta('sincroCodigo').then(c => (codigo = c || ''))
  leerMeta('sincroUltima').then(u => (ultima = u || null))

  async function sincronizarAhora() {
    error = ''
    trabajando = true
    try {
      const { url, clave } = leerCodigo(codigo)
      await ponerMeta('sincroCodigo', codigo.trim())
      const r = await sincronizar({ conexion: await crearConexion({ url, clave }), almacen: almacenApp, alProgreso: t => (progreso = t) })
      ultima = { fecha: new Date().toISOString(), ...r }
      await ponerMeta('sincroUltima', ultima)
      avisar(`Sincronizado${r.conflictos ? ` · ${r.conflictos} cambios en ambos lados (ganó este aparato)` : ''}`)
    } catch (e) {
      error = e.message
    } finally {
      trabajando = false
      progreso = ''
    }
  }
</script>

<section class="sincro">
  <h3 class="serif">Sincronizar con la PC</h3>
  <p class="suave">En la PC: Configuración → Vincular celular. Copia aquí su código (o escanea el QR en la app Android). Deben estar en el mismo Wi-Fi.</p>
  <label class="campo"><span>Código de vinculación</span>
    <input type="text" bind:value={codigo} placeholder="canvas-sync://192.168.1.10:47481/#…" autocomplete="off" spellcheck="false" /></label>
  <div class="fila entre">
    <span class="suave estado">{trabajando ? progreso || 'Sincronizando…' : ultima ? `Última: ${new Date(ultima.fecha).toLocaleString('es-PE')} · ↓${ultima.bajados} ↑${ultima.subidos}` : 'Aún no se sincronizó'}</span>
    <button class="btn primario" disabled={trabajando || !codigo.trim()} onclick={sincronizarAhora}>Sincronizar</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .sincro { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--line); padding-top: 16px; }
  h3 { margin: 0; font-size: 16px; }
  p { margin: 0; font-size: 13px; }
  .estado { font-size: 12px; }
  .error { color: var(--unreviewed); }
</style>
