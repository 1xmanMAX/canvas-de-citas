<script>
  import { S, cargar } from './lib/store.svelte.js'
  import Proyectos from './views/Proyectos.svelte'
  import Hub from './views/Hub.svelte'
  import General from './views/General.svelte'
  import Datos from './components/Datos.svelte'
  import { C, iniciarCarpeta, reconectar } from './lib/carpeta.svelte.js'

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

  function soltar(e) {
    e.preventDefault()
    const archivos = [...(e.dataTransfer?.files || [])].filter(f => /\.json$/i.test(f.name))
    if (archivos.length) datos = { archivos }
  }

  cargar().then(iniciarCarpeta)
</script>

<svelte:window
  onhashchange={() => { hash = location.hash; navegaciones++ }}
  ondragover={e => e.preventDefault()}
  ondrop={soltar}
/>

{#if S.listo}
  {#if ruta.vista === 'hub'}
    {@const p = S.proyectoPorId.get(ruta.pid)}
    {#if p}
      {#key p.id}<Hub {p} fid={ruta.fid} oid={ruta.oid} {abrirDatos} {atras} />{/key}
    {:else}
      <div class="no-encontrado">
        <p>No existe el proyecto <code>{ruta.pid}</code> en este dispositivo.</p>
        <a class="btn" href="#/">Volver a proyectos</a>
      </div>
    {/if}
  {:else if ruta.vista === 'general'}
    {#key ruta.pid}<General pid={ruta.pid} {abrirDatos} />{/key}
  {:else}
    <Proyectos {abrirDatos} />
  {/if}
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
