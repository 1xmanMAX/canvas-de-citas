<script>
  // Configuración: carpeta de almacenamiento + exportar / importar los tres JSON de la skill citas-tesis.
  import { untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import Icono from './Icono.svelte'
  import { S, avisar } from '../lib/store.svelte.js'
  import { descargarTodo, descargarBib, leerArchivos, aplicar } from '../lib/io.svelte.js'
  import { C, establecerCarpeta, reconectar, dejarDeUsarCarpeta, guardarAhora } from '../lib/carpeta.svelte.js'
  import { haceCuanto } from '../lib/citas.js'
  import Sincronizar from './Sincronizar.svelte'

  let { onclose, archivosIniciales = null } = $props()
  let previa = $state(null) // datos leídos pendientes de confirmar
  let modo = $state('combinar')
  let ocupado = $state(false)
  let entrada = $state()

  untrack(() => archivosIniciales && leerArchivos(archivosIniciales).then(d => (previa = d)))

  async function tarea(fn) {
    ocupado = true
    try { await fn() } catch (e) { if (e?.name !== 'AbortError') avisar(e.message || String(e)) } finally { ocupado = false }
  }

  async function leer(e) {
    const input = e.currentTarget
    const archivos = [...(input.files || [])]
    input.value = ''
    if (archivos.length) previa = await leerArchivos(archivos)
  }

  const confirmar = () => tarea(async () => {
    if (modo === 'reemplazar' && !confirm('Reemplazar borra las colecciones importadas que tengas en este dispositivo. ¿Continuar?')) return
    const resumen = await aplicar(previa, modo)
    avisar(`Importado: ${resumen}`)
    previa = null
    onclose()
  })

  function dejar() {
    if (confirm(`¿Dejar de guardar en "${C.dir?.name}"? Los archivos que ya están en la carpeta no se borran.`)) dejarDeUsarCarpeta()
  }

  const COLS = ['proyectos', 'fuentes', 'citas']
  const cuenta = col => previa?.[col]?.length
</script>

<Modal titulo="Configuración" {onclose} ancho={640}>
  {#if previa}
    <section>
      <div class="rotulo">Vista previa de la importación</div>
      <ul class="resumen">
        {#each COLS as col}
          {#if cuenta(col) !== undefined}<li><b>{cuenta(col)}</b> {col}</li>{/if}
        {/each}
      </ul>
      {#each previa.avisos as a}<p class="aviso-imp">{a}</p>{/each}
      <div class="segmentado">
        <button aria-pressed={modo === 'combinar'} onclick={() => (modo = 'combinar')}>Combinar (actualiza por id)</button>
        <button aria-pressed={modo === 'reemplazar'} onclick={() => (modo = 'reemplazar')}>Reemplazar</button>
      </div>
      <div class="fila fin">
        <button class="btn fantasma" onclick={() => (previa = null)}>Cancelar</button>
        <button class="btn primario" disabled={ocupado || !COLS.some(c => cuenta(c))} onclick={confirmar}>Importar</button>
      </div>
    </section>
  {:else}
    <section class="primera">
      <div class="rotulo">Carpeta de almacenamiento</div>
      {#if C.estado === 'no-soportado'}
        <p class="suave nota">
          Este navegador no permite guardar en una carpeta del disco. Usa <b>Chrome</b> o <b>Edge</b> en una computadora
          para elegir una. Mientras tanto, tus datos se guardan en este navegador y puedes exportarlos abajo.
        </p>
      {:else if C.estado === 'ninguna'}
        <p class="suave nota">
          Elige una carpeta y la app guardará ahí todo automáticamente: <code>proyectos.json</code>, <code>fuentes.json</code>,
          <code>citas.json</code> (con notas, fotos y conexiones) y los documentos en <code>fuentes/&lt;id&gt;/</code>.
          Si la skill <b>citas-tesis</b> trabaja en esa misma carpeta, sus cambios aparecen solos en la app.
        </p>
        <div class="fila"><button class="btn primario" disabled={ocupado} onclick={() => tarea(establecerCarpeta)}><Icono nombre="carpeta" />Elegir carpeta…</button></div>
      {:else}
        <div class="carpeta" class:alerta={C.estado === 'sin-permiso'}>
          <Icono nombre="carpeta" tam={22} />
          <div class="carpeta-txt">
            <b>{C.dir?.name}</b>
            {#if C.estado === 'sin-permiso'}
              <span>El navegador pide permiso otra vez para usar esta carpeta.</span>
            {:else}
              <span class="suave">Guardado automático{C.guardado ? ` · último guardado ${haceCuanto(C.guardado)}` : ''}</span>
            {/if}
            {#if C.error && C.estado === 'conectada'}<span class="error">{C.error}</span>{/if}
          </div>
        </div>
        <div class="fila envolver">
          {#if C.estado === 'sin-permiso'}
            <button class="btn primario" onclick={() => tarea(reconectar)}>Dar permiso</button>
          {:else}
            <button class="btn" disabled={ocupado} onclick={() => tarea(async () => { await guardarAhora(); avisar('Guardado en la carpeta') })}>Guardar ahora</button>
          {/if}
          <button class="btn" disabled={ocupado} onclick={() => tarea(establecerCarpeta)}>Cambiar carpeta…</button>
          <button class="btn peligro" onclick={dejar}>Dejar de usar</button>
        </div>
      {/if}
    </section>

    <section>
      <div class="rotulo">Exportar</div>
      <div class="fila envolver">
        <button class="btn" onclick={descargarTodo}><Icono nombre="datos" />Descargar los 3 JSON</button>
        <button class="btn" onclick={() => descargarBib(S.fuentes)}>Exportar .bib (toda la biblioteca)</button>
      </div>
      <p class="suave nota">{S.proyectos.length} proyectos · {S.fuentes.length} fuentes · {S.citas.length} citas</p>
    </section>

    <section>
      <div class="rotulo">Importar</div>
      <div class="fila envolver">
        <button class="btn" onclick={() => entrada.click()}>Abrir archivos JSON…</button>
        <input bind:this={entrada} type="file" accept=".json,application/json" multiple hidden onchange={leer} />
      </div>
      <p class="suave nota">Puedes elegir uno, dos o los tres archivos. También puedes arrastrarlos sobre la ventana.</p>
    </section>

    <Sincronizar />
  {/if}
</Modal>

<style>
  section { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--line); padding-top: 16px; }
  section.primera { border-top: none; padding-top: 0; }
  .nota { margin: 0; font-size: 13px; line-height: 1.55; }
  .resumen { margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.7; }
  .aviso-imp { margin: 0; font-size: 12px; color: var(--reviewed); }
  code { font-size: 12px; }
  .carpeta { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--using-bg); color: var(--using); }
  .carpeta.alerta { background: var(--reviewed-bg); color: var(--reviewed); }
  .carpeta-txt { display: flex; flex-direction: column; gap: 2px; font-size: 13px; min-width: 0; }
  .carpeta-txt b { color: var(--ink); font-size: 14px; overflow-wrap: anywhere; }
  .error { color: var(--unreviewed); font-size: 12px; }
</style>
