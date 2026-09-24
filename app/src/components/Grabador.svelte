<script>
  // Grabación de una nota de voz con transcripción en vivo.
  import { onDestroy } from 'svelte'
  import Icono from './Icono.svelte'
  import { grabar, aDataURL, puedeGrabar, puedeTranscribir, MAX_SEG } from '../lib/audio.svelte.js'
  import { duracionTexto } from '../lib/tarjetas.js'

  let { onlisto } = $props()
  let estado = $state('listo') // 'listo' | 'grabando' | 'procesando'
  let error = $state('')
  let final = $state('')
  let parcial = $state('')
  let niveles = $state(Array(40).fill(0))
  let seg = $state(0)
  let control = null
  let reloj

  async function empezar() {
    error = ''
    final = parcial = ''
    try {
      control = await grabar({
        alTexto: (f, p) => { final = f; parcial = p },
        alNivel: v => { niveles = [...niveles.slice(1), v] }
      })
      estado = 'grabando'
      const t0 = Date.now()
      reloj = setInterval(() => {
        seg = (Date.now() - t0) / 1000
        if (seg >= MAX_SEG) detener()
      }, 250)
    } catch (e) {
      error = e?.name === 'NotAllowedError' ? 'No hay permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.' : 'No se pudo usar el micrófono: ' + (e?.message || e)
    }
  }

  async function detener() {
    if (estado !== 'grabando') return
    clearInterval(reloj)
    estado = 'procesando'
    const r = await control.detener()
    control = null
    const audio = await aDataURL(r.blob)
    estado = 'listo'
    onlisto?.({ audio, duracion: r.duracion, onda: r.onda, transcripcion: (r.transcripcion || final).trim() })
  }

  onDestroy(() => { clearInterval(reloj); control?.cancelar() })
</script>

<div class="grabador">
  {#if !puedeGrabar}
    <p class="suave">Este navegador no permite grabar audio.</p>
  {:else}
    <div class="onda" class:activa={estado === 'grabando'}>
      {#each niveles as v}<span style="height:{4 + v * 44}px"></span>{/each}
    </div>
    <div class="fila centro">
      {#if estado === 'grabando'}
        <button class="rec parar" aria-label="Detener grabación" onclick={detener}><Icono nombre="detener" tam={22} /></button>
        <span class="tiempo">{duracionTexto(seg)}</span>
      {:else if estado === 'procesando'}
        <span class="suave">Procesando…</span>
      {:else}
        <button class="rec" aria-label="Empezar a grabar" onclick={empezar}><Icono nombre="mic" tam={24} /></button>
        <span class="suave">Toca para grabar (máx. {MAX_SEG / 60} min)</span>
      {/if}
    </div>
    {#if estado === 'grabando'}
      <div class="vivo" aria-live="polite">
        {#if final || parcial}{final} <span class="suave">{parcial}</span>
        {:else}<span class="suave">{puedeTranscribir ? 'Habla: la transcripción aparece aquí…' : 'Este navegador no transcribe; se guardará solo el audio.'}</span>{/if}
      </div>
    {/if}
    {#if error}<p class="error">{error}</p>{/if}
    {#if puedeTranscribir}<p class="suave pista">La transcripción usa el reconocimiento de voz de Chrome/Edge y necesita internet. Podrás corregirla al terminar.</p>{/if}
  {/if}
</div>

<style>
  .grabador { display: flex; flex-direction: column; gap: 12px; }
  .onda { height: 56px; display: flex; align-items: center; justify-content: center; gap: 3px; background: #2F4FB5; border-radius: 10px; padding: 0 12px; }
  .onda span { width: 3px; border-radius: 2px; background: rgba(255, 255, 255, .5); transition: height .1s; }
  .onda.activa span { background: #F2C230; }
  .centro { justify-content: center; gap: 12px; }
  .rec { width: 58px; height: 58px; border-radius: 50%; border: none; background: #C0392B; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(192, 57, 43, .35); }
  .rec.parar { background: var(--ink); animation: latido 1.4s infinite; }
  @keyframes latido { 50% { box-shadow: 0 0 0 10px rgba(192, 57, 43, .15); } }
  .tiempo { font: 600 18px var(--sans); font-variant-numeric: tabular-nums; }
  .vivo { min-height: 64px; max-height: 30dvh; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font-size: 14px; line-height: 1.5; font-style: italic; }
  .pista { margin: 0; font-size: 12px; }
  .error { margin: 0; color: var(--unreviewed); font-size: 13px; }
</style>
