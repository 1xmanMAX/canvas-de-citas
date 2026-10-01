<script>
  import { S, cargar } from './lib/store.svelte.js'
  import { cargarPreferencias } from './lib/preferencias.svelte.js'
  import Proyectos from './views/Proyectos.svelte'
  import Hub from './views/Hub.svelte'
  import General from './views/General.svelte'
  import Datos from './components/Datos.svelte'
  import Celular from './components/Celular.svelte'
  import { iniciarCelular } from './lib/celular.svelte.js'
  import { CS, iniciarCarpetas, darPermiso } from './lib/carpetas.svelte.js'
  import Visor from './components/Visor.svelte'
  import { esAndroid } from './lib/plataforma.js'
  import { iniciarSincroAutomatica } from './lib/sincro-app.svelte.js'
  import { recibidosAndroid, lienzoAbierto } from './lib/archivos.js'
  import { avisar } from './lib/store.svelte.js'
  import { abrirArchivo, ACEPTADOS, V, abrirDocumentoFuente, abrirSuelto, crearTarjetaCita } from './lib/visor.svelte.js'
  import { enVentanaDoc, rutaDoc, escucharVentanas, SUELTO } from './lib/ventana-doc.js'
  import { leerMeta } from './lib/store.svelte.js'
  import { B } from './lib/buscador.svelte.js'
  import Buscador from './components/Buscador.svelte'

  // Rutas por hash: #/  ·  #/p/<id>  ·  #/p/<id>/f/<fuente>  ·  #/p/<id>/o/<objetivo>[/f/<fuente>]
  //                 #/p/<id>/l/<fuente> (lienzo de lectura de la fuente)[/f/<fuente>]
  //                 #/citas  ·  #/citas/<id>
  //                 #/doc/<fuente>[/<proyecto>] (ventana aparte con solo ese documento; lib/ventana-doc.js)
  let hash = $state(location.hash)
  let navegaciones = 0
  const ruta = $derived.by(() => {
    const m = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
    const tras = k => { const i = m.indexOf(k, 2); return i > 0 ? m[i + 1] || null : null }
    if (m[0] === 'p' && m[1]) return { vista: 'hub', pid: m[1], oid: tras('o'), lid: tras('l'), fid: tras('f') }
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
    if (doc) return
    const todos = [...(e.dataTransfer?.files || [])]
    const archivos = todos.filter(f => /\.json$/i.test(f.name))
    if (archivos.length) return (datos = { archivos })
    const doc = todos.find(f => ACEPTADOS.test(f.name))
    if (doc) abrirArchivo(doc, proyectoActual())
  }

  function teclas(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); abrirArchivos() }
    // Ctrl+F: buscador general (con un documento abierto, el visor busca dentro de él).
    // Escribiendo en un campo o con otra ventana abierta no se interrumpe (se perdería lo que se edita).
    const escribiendo = e.target.closest?.('input, textarea, [contenteditable]') || document.querySelector('dialog[open]')
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f' && !V.archivo && !escribiendo) { e.preventDefault(); B.abierto = true }
  }

  // En Android no hay carpeta de almacenamiento ni receptor local: se sincroniza con la PC.
  // Android: lo que otra app comparte con "Canvas de Citas" (en la PC lo hace el receptor).
  // JSON → importar · PDF/HTML/Markdown → visor · imágenes, audios y texto → lienzo del proyecto.
  async function revisarRecibidos() {
    let lista
    try { lista = await recibidosAndroid() } catch { return }
    if (!lista.length) return
    const json = [], libres = [], textos = []
    for (const x of lista) {
      if (x.error) avisar(x.error)
      else if (x.texto) textos.push(x.texto)
      else if (/\.json$/i.test(x.name) || x.type === 'application/json') json.push(x)
      else if (ACEPTADOS.test(x.name) && !/^(image|audio)\//.test(x.type)) abrirArchivo(x, proyectoActual())
      else libres.push(x)
    }
    if (json.length) datos = { archivos: json }
    if (!libres.length && !textos.length) return
    if (ruta.vista !== 'hub') {
      const p = [...S.proyectos].sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || '')))[0]
      if (!p) return avisar('Crea un proyecto para agregar lo recibido a su lienzo')
      location.hash = `#/p/${p.id}`
    }
    for (let i = 0; i < 40 && !lienzoAbierto.insertar; i++) await new Promise(r => setTimeout(r, 100))
    if (!lienzoAbierto.insertar) return
    if (libres.length) await lienzoAbierto.insertar(libres, '')
    for (const t of textos) await lienzoAbierto.insertar([], t)
  }

  cargarPreferencias()
  // Ventana de un documento: solo lo carga y lo muestra; no sincroniza ni guarda en las carpetas
  // (eso lo hace la ventana principal, a la que le pide las notas y recortes).
  const doc = enVentanaDoc()
  let docFalta = $state(false)
  async function abrirDocVentana() {
    const { fid, pid } = rutaDoc()
    if (fid === SUELTO) {
      const d = await leerMeta('docSuelto')
      if (d?.blob) abrirSuelto(d.nombre, d.blob, pid)
    } else {
      const f = S.fuentePorId.get(fid)
      if (f) await abrirDocumentoFuente(f, pid)
    }
    docFalta = !V.archivo
  }
  $effect(() => { if (doc) document.title = V.archivo ? `${V.archivo.nombre} · Canvas de Citas` : 'Canvas de Citas' })
  // La sincronización con la PC corre en todo aparato vinculado (celular, laptop…).
  if (doc) cargar().then(abrirDocVentana)
  else if (esAndroid) {
    cargar().then(() => { iniciarSincroAutomatica(); revisarRecibidos() })
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && revisarRecibidos())
  }
  else cargar().then(() => { iniciarSincroAutomatica(); return iniciarCarpetas() }).then(iniciarCelular)
  // Las ventanas de documento le piden a esta (la principal) que cree sus notas y recortes.
  if (!doc) escucharVentanas(crearTarjetaCita)
</script>

<svelte:window
  onhashchange={() => { hash = location.hash; navegaciones++ }}
  ondragover={e => e.preventDefault()}
  ondrop={soltar}
  onkeydown={teclas}
/>

<input bind:this={entradaDoc} type="file" accept=".pdf,.html,.htm,.md,.markdown,.txt" hidden onchange={elegidoDoc} />

{#if doc}
  {#if docFalta}
    <div class="no-encontrado">
      <p>Este documento no está en este dispositivo.</p>
      <button class="btn" onclick={() => (window.ipc?.postMessage ? window.ipc.postMessage('cerrar') : window.close())}>Cerrar</button>
    </div>
  {/if}
{:else if S.listo}
  {#if ruta.vista === 'hub'}
    {@const p = S.proyectoPorId.get(ruta.pid)}
    {#if p}
      {#key p.id}<Hub {p} fid={ruta.fid} oid={ruta.oid} lid={ruta.lid} {abrirDatos} {abrirCelular} {abrirArchivos} {atras} />{/key}
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

<Visor ventana={doc} />

{#if B.abierto}<Buscador />{/if}

{#if celular}
  <Celular onclose={() => (celular = false)} importarArchivos={archivos => { celular = false; datos = { archivos } }} />
{/if}

{#if datos}
  <Datos archivosIniciales={datos.archivos} onclose={() => (datos = null)} />
{/if}

{#if S.aviso}<div class="aviso" role="status">{S.aviso}</div>{/if}

{#if CS.pendientesDePermiso && !S.aviso && !datos}
  <div class="aviso fila" role="status">
    {CS.pendientesDePermiso === 1 ? `La carpeta "${CS.lista.find(c => c.estado === 'sin-permiso').nombre}" necesita` : `${CS.pendientesDePermiso} carpetas necesitan`} permiso para seguir guardando
    <button class="btn chico" onclick={darPermiso}>Dar permiso</button>
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
