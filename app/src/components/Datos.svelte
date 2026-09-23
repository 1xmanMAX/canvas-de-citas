<script>
  import { untrack } from 'svelte'
  // Exportar / importar los tres JSON que lee y escribe la skill citas-tesis.
  import Modal from './Modal.svelte'
  import Icono from './Icono.svelte'
  import { S, avisar } from '../lib/store.svelte.js'
  import { descargarTodo, descargarBib, leerArchivos, aplicar, soportaCarpeta, carpetaGuardada, elegirCarpeta, guardarEnCarpeta, leerDeCarpeta, importarDocumentosDeCarpeta } from '../lib/io.svelte.js'

  let { onclose, archivosIniciales = null } = $props()
  let carpeta = $state(null)
  let previa = $state(null) // datos leídos pendientes de confirmar
  let modo = $state('combinar')
  let ocupado = $state(false)
  let entrada = $state()

  carpetaGuardada().then(c => (carpeta = c || null))
  untrack(() => archivosIniciales && leerArchivos(archivosIniciales).then(d => (previa = d)))

  async function tarea(fn) {
    ocupado = true
    try { await fn() } catch (e) { if (e?.name !== 'AbortError') avisar(e.message || String(e)) } finally { ocupado = false }
  }

  const elegir = () => tarea(async () => { carpeta = await elegirCarpeta() })
  const guardarCarpeta = () => tarea(async () => {
    carpeta ||= await elegirCarpeta()
    const docs = await guardarEnCarpeta(carpeta)
    avisar(`Guardado en "${carpeta.name}"${docs ? ` (+${docs} documentos)` : ''}`)
  })
  const cargarCarpeta = () => tarea(async () => {
    carpeta ||= await elegirCarpeta()
    const d = await leerDeCarpeta(carpeta)
    d.desdeCarpeta = true
    previa = d
  })

  async function leer(e) {
    const input = e.currentTarget
    const archivos = [...(input.files || [])]
    input.value = ''
    if (archivos.length) previa = await leerArchivos(archivos)
  }

  const confirmar = () => tarea(async () => {
    if (modo === 'reemplazar' && !confirm('Reemplazar borra las colecciones importadas que tengas en este dispositivo. ¿Continuar?')) return
    const resumen = await aplicar(previa, modo)
    const docs = previa.desdeCarpeta ? await importarDocumentosDeCarpeta(carpeta) : 0
    avisar(`Importado: ${resumen}${docs ? `, ${docs} documentos` : ''}`)
    previa = null
    onclose()
  })

  const COLS = ['proyectos', 'fuentes', 'citas']
  const cuenta = col => previa?.[col]?.length
</script>

<Modal titulo="Datos" {onclose} ancho={620}>
  <p class="suave intro">
    Tus datos viven en este dispositivo (IndexedDB). Exporta <code>proyectos.json</code>, <code>fuentes.json</code> y
    <code>citas.json</code> para que la skill <b>citas-tesis</b> de Claude los lea, y vuelve a importarlos cuando la skill
    agregue o corrija citas.
  </p>

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
    <section>
      <div class="rotulo">Exportar</div>
      <div class="fila envolver">
        <button class="btn primario" onclick={descargarTodo}><Icono nombre="datos" />Descargar los 3 JSON</button>
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

    {#if soportaCarpeta}
      <section>
        <div class="rotulo">Carpeta sincronizada</div>
        <p class="suave nota">
          {carpeta ? `Carpeta: "${carpeta.name}". ` : ''}Guarda los JSON (y los documentos en <code>fuentes/&lt;id&gt;/</code>)
          directamente en la carpeta de trabajo donde la skill los lee.
        </p>
        <div class="fila envolver">
          <button class="btn" disabled={ocupado} onclick={guardarCarpeta}>Guardar en carpeta</button>
          <button class="btn" disabled={ocupado} onclick={cargarCarpeta}>Cargar desde carpeta</button>
          <button class="btn fantasma" disabled={ocupado} onclick={elegir}>{carpeta ? 'Cambiar carpeta…' : 'Elegir carpeta…'}</button>
        </div>
      </section>
    {/if}
  {/if}
</Modal>

<style>
  .intro { margin: 0; font-size: 13px; line-height: 1.55; }
  section { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--line); padding-top: 16px; }
  .nota { margin: 0; font-size: 12px; line-height: 1.5; }
  .resumen { margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.7; }
  .aviso-imp { margin: 0; font-size: 12px; color: var(--reviewed); }
  code { font-size: 12px; }
</style>
