<script>
  import { S, cargar } from './lib/store.svelte.js'
  import Proyectos from './views/Proyectos.svelte'
  import Hub from './views/Hub.svelte'
  import General from './views/General.svelte'
  import Datos from './components/Datos.svelte'
  import Celular from './components/Celular.svelte'
  import { iniciarCelular } from './lib/celular.svelte.js'
  import { C, iniciarCarpeta, reconectar } from './lib/carpeta.svelte.js'
  import Visor from './components/Visor.svelte'
  import { esAndroid } from './lib/plataforma.js'
  import { iniciarSincroAutomatica } from './lib/sincro-app.svelte.js'
  import { abrirArchivo, ACEPTADOS } from './lib/visor.svelte.js'

  // Rutas por hash: #/  ·  #/p/<id>  ·  #/p/<id>/f/<fuente>  ·  #/p/<id>/o/<objetivo>[/f/<fuente>]
  //                 #/citas  ·  #/citas/<id>
  let hash = $state(location.hash)
  let navegaciones = 0
  const ruta = $derived.by(() => {
    const m = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
    const tras = k => { const i = m.indexOf(k, 2); return i > 0 ? m[i + 1] || null : null }
    if (m[0] === 'p' && m[1]) return { vista: 'hub', pid: m[1], oid: tras('o'), fid: tras('f') }
    if (m[0] === 'citas') return { vista: 'general', pid: m[1] || null }
    return { vista: 'proyectos' }
  })

  /** Vuelve atrás dentro de la app; si se entró por un enlace directo, reemplaza la ruta. */
  function atras(alternativa) {
    if (navegaciones > 0) history.back()
    else location.replace(alternativa)
  }

  let datos = $state(null) // null | { archivos }
  const abrirDatos = () => (datos = { archivos: null })
  let celular = $state(false)
  const abrirCelular = () => (celular = true)

  // --- Abrir documentos en el visor: botón, Ctrl+O o soltarlos sobre la app ---
  let entradaDoc
  const proyectoActual = () => (ruta.vista === 'hub' ? ruta.pid : null)
  const abrirArchivos = () => entradaDoc.click()
  function elegidoDoc(e) {
    const a = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (a) abrirArchivo(a, proyectoActual())
  }

  function soltar(e) {
    e.preventDefault()
    const todos = [...(e.dataTransfer?.files || [])]
    const archivos = todos.filter(f => /\.json$/i.test(f.name))
    if (archivos.length) return (datos = { archivos })
    const doc = todos.find(f => ACEPTADOS.test(f.name))
    if (doc) abrirArchivo(doc, proyectoActual())
  }

  function teclas(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); abrirArchivos() }
  }

  // En Android no hay carpeta de almacenamiento ni receptor local: se sincroniza con la PC.
  if (esAndroid) cargar().then(iniciarSincroAutomatica)
  else cargar().then(iniciarCarpeta).then(iniciarCelular)
</script>

<svelte:window
  onhashchange={() => { hash = location.hash; navegaciones++ }}
  ondragover={e => e.preventDefault()}
  ondrop={soltar}
  onkeydown={teclas}
/>

<input bind:this={entradaDoc} type="file" accept=".pdf,.html,.htm,.md,.markdown,.txt" hidden onchange={elegidoDoc} />

{#if S.listo}
  {#if ruta.vista === 'hub'}
    {@const p = S.proyectoPorId.get(ruta.pid)}
    {#if p}
      {#key p.id}<Hub {p} fid={ruta.fid} oid={ruta.oid} {abrirDatos} {abrirCelular} {abrirArchivos} {atras} />{/key}
    {:else}
      <div class="no-encontrado">
        <p>No existe el proyecto <code>{ruta.pid}</code> en este dispositivo.</p>
        <a class="btn" href="#/">Volver a proyectos</a>
      </div>
    {/if}
  {:else if ruta.vista === 'general'}
    {#key ruta.pid}<General pid={ruta.pid} {abrirDatos} {abrirCelular} />{/key}
  {:else}
    <Proyectos {abrirDatos} {abrirCelular} />
  {/if}
{/if}

<Visor />

{#if celular}
  <Celular onclose={() => (celular = false)} importarArchivos={archivos => { celular = false; datos = { archivos } }} />
{/if}

{#if datos}
  <Datos archivosIniciales={datos.archivos} onclose={() => (datos = null)} />
{/if}

{#if S.aviso}<div class="aviso" role="status">{S.aviso}</div>{/if}

{#if C.estado === 'sin-permiso' && !S.aviso && !datos}
  <div class="aviso fila" role="status">
    La carpeta "{C.dir?.name}" necesita permiso para seguir guardando
    <button class="btn chico" onclick={reconectar}>Dar permiso</button>
  </div>
{:else if S.actualizacion && !S.aviso}
  <div class="aviso fila" role="status">
    Nueva versión disponible
    <button class="btn chico" onclick={() => S.actualizacion.postMessage('activar')}>Actualizar</button>
  </div>
{/if}

<style>
  .no-encontrado { margin: auto; text-align: center; padding: 24px; }
</style>
