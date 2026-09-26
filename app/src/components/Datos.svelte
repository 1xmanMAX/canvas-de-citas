<script>
  // Configuración: carpeta de almacenamiento + exportar / importar los tres JSON de la skill citas-tesis.
  import { untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import Icono from './Icono.svelte'
  import { S, avisar } from '../lib/store.svelte.js'
  import { descargarTodo, descargarBib, leerArchivos, aplicar } from '../lib/io.svelte.js'
  import { CS, guardarAhora, darPermiso, elegirBiblioteca, usarComoBiblioteca } from '../lib/carpetas.svelte.js'
  import { haceCuanto } from '../lib/citas.js'
  import Sincronizar from './Sincronizar.svelte'
  import { esAndroid } from '../lib/plataforma.js'
  import { P, ponerPreferencia } from '../lib/preferencias.svelte.js'

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
    {#if esAndroid}
    <!-- En el celular no hay carpeta de almacenamiento: los datos llegan de la PC. -->
    <Sincronizar primera />
    {:else}
    <section class="primera">
      <div class="rotulo">Carpetas de los proyectos</div>
      {#if !CS.soportado}
        <p class="suave nota">
          Este navegador no permite guardar en carpetas del disco. Usa la app de Windows, <b>Chrome</b> o <b>Edge</b> en una computadora.
          Mientras tanto, tus datos se guardan en este navegador y puedes exportarlos abajo.
        </p>
      {:else}
        <p class="suave nota">Cada proyecto se guarda solo en su carpeta (sus JSON, documentos, fotos y un <code>CLAUDE.md</code>). Para abrir uno, en Proyectos → <b>Abrir proyecto</b>.</p>
        {#each CS.lista as c (c.clave)}
          <div class="carpeta" class:alerta={c.estado !== 'conectada'}>
            <Icono nombre="carpeta" tam={22} />
            <div class="carpeta-txt">
              <b>{c.nombre}</b>
              <span class="suave">{c.proyectos.map(id => S.proyectoPorId.get(id)?.titulo).filter(Boolean).join(' · ') || 'Sin proyectos'}{c.biblioteca ? ' · biblioteca (fuentes sin proyecto)' : ''}</span>
              {#if c.estado === 'sin-permiso'}<span>El navegador pide permiso otra vez para usar esta carpeta.</span>
              {:else if c.estado === 'error'}<span class="error">{c.error}</span>
              {:else}<span class="suave">Guardado automático{c.guardado ? ` · último guardado ${haceCuanto(c.guardado)}` : ''}</span>{/if}
              {#if c.error && c.estado === 'conectada'}<span class="error">{c.error}</span>{/if}
            </div>
            {#if !c.biblioteca}<button class="btn chico fantasma" onclick={() => tarea(() => usarComoBiblioteca(c.clave))}>Usar como biblioteca</button>{/if}
          </div>
        {/each}
        {#if CS.sueltasSinLugar}
          <p class="aviso-imp">{CS.sueltasSinLugar} fuentes no las cita ningún proyecto con carpeta: elige una carpeta de biblioteca para guardarlas.</p>
        {/if}
        <div class="fila envolver">
          {#if CS.pendientesDePermiso}<button class="btn primario" onclick={() => tarea(darPermiso)}>Dar permiso</button>{/if}
          {#if CS.lista.length}<button class="btn" disabled={ocupado} onclick={() => tarea(async () => { await guardarAhora(); avisar('Guardado en las carpetas') })}>Guardar ahora</button>{/if}
          <button class="btn" disabled={ocupado} onclick={() => tarea(elegirBiblioteca)}>{CS.lista.some(c => c.biblioteca) ? 'Cambiar carpeta de biblioteca…' : 'Elegir carpeta de biblioteca…'}</button>
        </div>
      {/if}
    </section>

    <section>
      <div class="rotulo">Rueda del mouse en el lienzo</div>
      <div class="segmentado">
        <button aria-pressed={P.ruedaMouse === 'zoom'} onclick={() => ponerPreferencia('ruedaMouse', 'zoom')}>Zoom</button>
        <button aria-pressed={P.ruedaMouse === 'desplazar'} onclick={() => ponerPreferencia('ruedaMouse', 'desplazar')}>Desplazar</button>
      </div>
      <p class="suave nota">Con zoom, apretar la rueda y arrastrar mueve el lienzo. El trackpad y la pantalla táctil no cambian.</p>
    </section>
    {/if}

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

    {#if !esAndroid}<Sincronizar />{/if}
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
