<script>
  // "Sincronizar con la PC": se pega (o, en Android, se escanea) el código de vinculación de la PC
  // y se sincroniza por la red local. El código queda guardado en este aparato.
  import Icono from './Icono.svelte'
  import { SA, cargarSincro, guardarCodigo, sincronizarAhora, renombrarAparato } from '../lib/sincro-app.svelte.js'
  import { haceCuanto } from '../lib/citas.js'
  import { esAndroid, nativo } from '../lib/plataforma.js'

  let { primera = false } = $props()
  cargarSincro()

  // Resumen de la última sincronización: cuántos cambios llegaron y se enviaron.
  const resumen = $derived.by(() => {
    const u = SA.ultima
    if (!u) return 'Aún no se sincronizó'
    const partes = [`Última: ${haceCuanto(u.fecha)}`]
    if (u.recibidos != null) partes.push(`↓ ${u.recibidos} · ↑ ${u.enviados} cambios`)
    else if (u.enviados != null) partes.push(`primera vez (todo) · ↑ ${u.enviados} cambios`)
    if (u.bajados || u.subidos) partes.push(`docs ↓${u.bajados} ↑${u.subidos}`)
    if (u.conflictos) partes.push(`${u.conflictos} choques (ganó este aparato)`)
    return partes.join(' · ')
  })
  const otros = $derived(SA.grupo.filter(a => a.id !== SA.aparato?.id))

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
  {#if SA.aparato}
    <label class="campo"><span>Nombre de este aparato en el grupo</span>
      <input type="text" value={SA.aparato.nombre} maxlength="60" onchange={e => renombrarAparato(e.currentTarget.value)} /></label>
  {/if}
  <div class="fila entre">
    <span class="suave estado">{SA.trabajando ? SA.progreso || 'Sincronizando…' : resumen}</span>
    <button class="btn primario" disabled={SA.trabajando || !SA.codigo.trim()} onclick={() => sincronizarAhora()}>Sincronizar</button>
  </div>
  {#if SA.error}<p class="error" role="alert">{SA.error}</p>{/if}
  {#if SA.grupo.length}
    <div class="grupo">
      <div class="rotulo">Grupo de sincronización</div>
      <ul>
        <li><b>PC</b> <span class="suave">· guarda la versión común</span></li>
        <li><b>{SA.aparato?.nombre}</b> <span class="suave">· este aparato</span></li>
        {#each otros as a (a.id)}
          <li><b>{a.nombre || 'Aparato sin nombre'}</b> <span class="suave">· {a.sincronizado ? `sincronizó ${haceCuanto(new Date(a.sincronizado).toISOString())}` : 'aún no sincroniza'}</span></li>
        {/each}
      </ul>
      <p class="suave">Solo viaja lo que cambió. Cada aparato se pone al día solo (al abrir la app, cada 5 min y poco después de cada cambio) y todos quedan con la misma versión.</p>
    </div>
  {/if}
</section>

<style>
  .sincro { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--line); padding-top: 16px; }
  .primera { border-top: none; padding-top: 0; }
  h3 { margin: 0; font-size: 16px; }
  p { margin: 0; font-size: 13px; }
  .estado { font-size: 12px; }
  .error { color: var(--unreviewed); }
  .grupo { display: flex; flex-direction: column; gap: 6px; }
  .grupo ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.7; }
  .grupo p { font-size: 12px; }
</style>
