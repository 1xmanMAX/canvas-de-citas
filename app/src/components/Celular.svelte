<script>
  // Pasar archivos con el celular, PixPin u otra PC por la misma wifi (protocolo de PixPin).
  // Recibir: código + QR para que te envíen. Enviar: elige archivos y muestra tu código.
  // Recibidos: bandeja para decidir qué es cada cosa que llegó.
  import { untrack } from 'svelte'
  import Modal from './Modal.svelte'
  import Icono from './Icono.svelte'
  import { S, guardarFuente, adjuntarDocumento, vincularFuente, guardarProyecto, avisar } from '../lib/store.svelte.js'
  import { autorCorto, anio } from '../lib/citas.js'
  import { serializar } from '../lib/io.svelte.js'
  import { comprimirFoto } from '../lib/imagen.js'
  import { nuevaTarjeta } from '../lib/tablero.js'
  import { asegurarTablero } from '../lib/tarjetas.js'
  import { analizar, aDataURL } from '../lib/audio.svelte.js'
  import {
    R, mirar, abrirRecepcion, cerrarRecepcion, recibirDe, abrirEnvio, cerrarEnvio, enviarA,
    limpiarEnvio, ponerEnCola, leerRecibido, descartarRecibido, claseDe
  } from '../lib/celular.svelte.js'

  let { onclose, importarArchivos, pestanaInicial = 'recibir' } = $props()
  let pestana = $state(untrack(() => (pestanaInicial === 'recibir' && R.recibidos.length ? 'recibidos' : pestanaInicial)))
  let codigoOtro = $state('')
  let entrada
  let destino = $state({}) // nombre → id de proyecto / fuente elegido en la bandeja

  $effect(() => mirar())
  $effect(() => () => { cerrarRecepcion(); cerrarEnvio() })
  // La puerta de recibir se abre sola al estar en esa pestaña.
  $effect(() => { if (pestana === 'recibir' && R.conectado && !R.estado?.recibir) abrirRecepcion().catch(() => {}) })

  const e = $derived(R.estado)
  const act = $derived(e?.actividad)
  const ocupado = $derived(['conectando', 'recibiendo', 'enviando'].includes(act?.fase))
  const pct = $derived(act?.total ? Math.round((act.hechos / act.total) * 100) : 0)
  const tam = b => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`)

  // --- Enviar ---
  async function agregarArchivos(ev) {
    const archivos = [...(ev.currentTarget.files || [])]
    ev.currentTarget.value = ''
    await agregar(archivos.map(f => ({ nombre: f.name, blob: f })))
  }

  async function agregar(lista) {
    try {
      await ponerEnCola(lista)
      if (!R.estado?.enviar) await abrirEnvio()
    } catch (x) { avisar(x.message) }
  }

  const misDatos = () => agregar(['proyectos', 'fuentes', 'citas'].map(c => ({
    nombre: `${c}.json`, blob: new Blob([serializar(c)], { type: 'application/json' })
  })))

  async function vaciar() { await limpiarEnvio().catch(() => {}) }

  function mandarA(ev) {
    ev.preventDefault()
    if (codigoOtro.trim()) enviarA(codigoOtro.trim()).then(() => (codigoOtro = '')).catch(() => {})
  }

  function recibirConCodigo(ev) {
    ev.preventDefault()
    if (codigoOtro.trim()) recibirDe(codigoOtro.trim()).then(() => (codigoOtro = '')).catch(() => {})
  }

  // --- Bandeja ---
  const proyectos = $derived([...S.proyectos].sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || ''))))
  const fuentes = $derived([...S.fuentes].sort((a, b) => autorCorto(a).localeCompare(autorCorto(b), 'es')))
  const elegido = (clave, lista) => destino[clave] ?? lista[0]?.id ?? ''

  async function procesar(r, que) {
    try {
      const archivo = await leerRecibido(r.nombre)
      const pid = elegido(r.nombre, proyectos)
      const sinExt = r.nombre.replace(/\.[^.]+$/, '')
      if (que === 'fuente-nueva') {
        const f = guardarFuente({ tipo_fuente: 'otro', titulo: sinExt, autores: [], anio: null, idioma: 'es', estado_verificacion: 'no_verificado', fuente_verificacion: '', documento_original: null })
        await adjuntarDocumento(f, archivo)
        if (pid) vincularFuente(pid, f.id)
        avisar(`Fuente "${sinExt}" creada: completa sus datos en la biblioteca`)
      } else if (que === 'adjuntar') {
        const f = S.fuentePorId.get(elegido(r.nombre + '#f', fuentes))
        if (!f) return avisar('Elige una fuente')
        await adjuntarDocumento(f, archivo)
        avisar(`Documento adjuntado a ${autorCorto(f)} (${anio(f)})`)
      } else if (que === 'foto' || que === 'nota' || que === 'audio') {
        const p = S.proyectoPorId.get(pid)
        if (!p) return avisar('Elige un proyecto')
        const c = asegurarTablero(p.canvas)
        const x = Math.round(360 + Math.random() * 120), y = Math.round(-120 + Math.random() * 120)
        if (que === 'foto') c.fotos.push(nuevaTarjeta('fotos', x, y, { ...(await comprimirFoto(archivo)), titulo: sinExt }))
        else if (que === 'nota') c.notas.push(nuevaTarjeta('notas', x, y, { texto: (await archivo.text()).trim().slice(0, 4000) }))
        else {
          const ext = (r.nombre.split('.').pop() || '').toLowerCase()
          const tipo = archivo.type || { m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm', aac: 'audio/aac', amr: 'audio/amr', '3gp': 'audio/3gpp' }[ext] || 'audio/mpeg'
          const blob = new Blob([archivo], { type: tipo })
          const info = await analizar(blob).catch(() => ({ duracion: 0, onda: [] }))
          c.audios.push(nuevaTarjeta('audios', x, y, { ...info, audio: await aDataURL(blob), transcripcion: '' }))
        }
        guardarProyecto(p)
        avisar(`${{ foto: 'Foto', nota: 'Nota', audio: 'Nota de voz' }[que]} agregada a "${p.titulo}"`)
      } else if (que === 'importar') {
        importarArchivos([archivo])
      } else if (que === 'guardar') {
        const url = URL.createObjectURL(archivo)
        Object.assign(document.createElement('a'), { href: url, download: r.nombre }).click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return
      }
      await descartarRecibido(r.nombre)
    } catch (x) { avisar('No se pudo: ' + x.message) }
  }
</script>

<Modal titulo="Celular y PixPin" {onclose} ancho={620}>
  {#if R.conectado === false}
    <div class="sin-receptor">
      <p class="serif">El receptor no está funcionando en esta PC</p>
      <p class="suave">Para pasar archivos por wifi, la app necesita el receptor de Windows (habla el mismo protocolo que PixPin). Instálalo una vez y arrancará solo con Windows:</p>
      <code>powershell -ExecutionPolicy Bypass -File app\scripts\instalar-receptor.ps1</code>
      <p class="suave">Si ya lo instalaste, reinicia la PC o abre otra vez el acceso directo <b>Canvas de Citas</b>.</p>
    </div>
  {:else if R.conectado === null}
    <p class="suave">Conectando con el receptor…</p>
  {:else}
    <div class="segmentado">
      <button aria-pressed={pestana === 'recibir'} onclick={() => (pestana = 'recibir')}>Recibir</button>
      <button aria-pressed={pestana === 'enviar'} onclick={() => (pestana = 'enviar')}>Enviar</button>
      <button aria-pressed={pestana === 'recibidos'} onclick={() => (pestana = 'recibidos')}>Recibidos{#if R.recibidos.length} ({R.recibidos.length}){/if}</button>
    </div>

    {#if ocupado || act?.fase === 'error'}
      <div class="actividad" class:error={act.fase === 'error'} role="status">
        {#if act.fase === 'error'}{act.mensaje}
        {:else if act.fase === 'conectando'}{act.mensaje || 'Conectando…'}
        {:else}
          {act.fase === 'recibiendo' ? 'Recibiendo de' : 'Enviando a'} <b>{act.de}</b>{#if act.total} · {pct}%{/if}
          <div class="barra-prog"><div style="width:{pct}%"></div></div>
        {/if}
      </div>
    {/if}

    {#if pestana === 'recibir'}
      {#if e?.recibir}
        <div class="codigo-caja">
          <div class="qr">{@html e.recibir.svg}</div>
          <div class="codigo-lado">
            <div class="rotulo">Tu código para recibir</div>
            <div class="codigo">{e.recibir.legible}</div>
            <p class="suave">En el celular abre <b>PixPin → Pasar algo → Enviar</b>, elige los archivos y escanea este QR (o escribe el código). También funciona desde PixPin en otra PC.</p>
          </div>
        </div>
      {:else}
        <p class="suave">Abriendo la puerta para recibir…</p>
      {/if}
      <form class="fila codigo-form" onsubmit={recibirConCodigo}>
        <input type="text" inputmode="numeric" placeholder="¿Te muestran un código? Escríbelo aquí" bind:value={codigoOtro} aria-label="Código de quien envía" />
        <button class="btn" disabled={!codigoOtro.trim() || ocupado}>Recibir</button>
      </form>
    {:else if pestana === 'enviar'}
      <div class="fila elegir">
        <button class="btn primario" onclick={() => entrada.click()}><Icono nombre="clip" />Elegir archivos</button>
        <button class="btn" onclick={misDatos}>Mis datos (3 JSON)</button>
        <input bind:this={entrada} type="file" multiple hidden onchange={agregarArchivos} />
      </div>
      {#if e?.cola?.length}
        <ul class="cola">
          {#each e.cola as c}<li><span>{c.nombre}</span><span class="suave">{tam(c.bytes)}</span></li>{/each}
        </ul>
        {#if e.enviar}
          <div class="codigo-caja">
            <div class="qr">{@html e.enviar.svg}</div>
            <div class="codigo-lado">
              <div class="rotulo">Código para recibirlo</div>
              <div class="codigo">{e.enviar.legible}</div>
              <p class="suave">En el celular abre <b>PixPin → Pasar algo → Recibir</b> y escanea el QR o escribe el código.</p>
            </div>
          </div>
        {/if}
        <form class="fila codigo-form" onsubmit={mandarA}>
          <input type="text" inputmode="numeric" placeholder="¿El otro espera para recibir? Escribe su código" bind:value={codigoOtro} aria-label="Código de quien recibe" />
          <button class="btn" disabled={!codigoOtro.trim() || ocupado}>Enviar</button>
        </form>
        <button class="btn fantasma chico vaciar" onclick={vaciar}>Vaciar la lista</button>
      {:else}
        <p class="suave">Elige qué quieres pasar al celular o a PixPin: PDFs, imágenes, tus datos…</p>
      {/if}
    {:else}
      {#if !R.recibidos.length}
        <p class="suave">No hay nada pendiente. Lo que te envíen aparecerá aquí para que decidas dónde va.</p>
      {:else}
        <div class="bandeja">
          {#each R.recibidos as r (r.nombre)}
            {@const clase = claseDe(r.nombre, r.mime)}
            <div class="recibido">
              <div class="fila entre">
                <div class="nombre"><b>{r.nombre}</b><span class="suave"> · {tam(r.bytes)}{#if r.de} · de {r.de}{/if}</span></div>
                <button class="icono-btn" title="Descartar" aria-label="Descartar {r.nombre}" onclick={() => descartarRecibido(r.nombre)}><Icono nombre="cerrar" tam={14} trazo={2} /></button>
              </div>
              <div class="acciones">
                {#if clase === 'documento'}
                  <select value={elegido(r.nombre, proyectos)} onchange={ev => (destino[r.nombre] = ev.currentTarget.value)} aria-label="Proyecto">
                    <option value="">(solo biblioteca)</option>
                    {#each proyectos as p}<option value={p.id}>{p.titulo}</option>{/each}
                  </select>
                  <button class="btn chico primario" onclick={() => procesar(r, 'fuente-nueva')}>Crear fuente</button>
                  {#if fuentes.length}
                    <span class="suave o">o</span>
                    <select value={elegido(r.nombre + '#f', fuentes)} onchange={ev => (destino[r.nombre + '#f'] = ev.currentTarget.value)} aria-label="Fuente">
                      {#each fuentes as f}<option value={f.id}>{autorCorto(f)} ({anio(f)})</option>{/each}
                    </select>
                    <button class="btn chico" onclick={() => procesar(r, 'adjuntar')}>Adjuntar</button>
                  {/if}
                {:else if (clase === 'imagen' || clase === 'texto' || clase === 'audio') && proyectos.length}
                  {@const accion = { imagen: ['foto', 'Foto al lienzo'], texto: ['nota', 'Nota al lienzo'], audio: ['audio', 'Nota de voz al lienzo'] }[clase]}
                  <select value={elegido(r.nombre, proyectos)} onchange={ev => (destino[r.nombre] = ev.currentTarget.value)} aria-label="Proyecto">
                    {#each proyectos as p}<option value={p.id}>{p.titulo}</option>{/each}
                  </select>
                  <button class="btn chico primario" onclick={() => procesar(r, accion[0])}>{accion[1]}</button>
                {:else if clase === 'json'}
                  <button class="btn chico primario" onclick={() => procesar(r, 'importar')}>Importar datos</button>
                {/if}
                <button class="btn chico fantasma" onclick={() => procesar(r, 'guardar')}>Guardar en la PC</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
    <p class="pie suave">Esta PC aparece como <b>{e?.nombre}</b>{#if e?.ip} · {e.ip}{/if}. Los dos aparatos deben estar en la misma wifi.</p>
  {/if}
</Modal>

<style>
  .segmentado { align-self: flex-start; }
  .codigo-caja { display: flex; gap: 20px; align-items: center; background: var(--paper-dim); border-radius: 14px; padding: 16px; }
  .qr { width: 168px; height: 168px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: #fff; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .codigo-lado { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .codigo { font: 600 38px var(--serif); letter-spacing: .06em; color: var(--accent); }
  .codigo-lado p { margin: 0; font-size: 13px; line-height: 1.5; }
  .codigo-form input { flex-grow: 1; min-width: 0; }
  .elegir { flex-wrap: wrap; }
  .elegir .btn { display: inline-flex; align-items: center; gap: 6px; }
  .vaciar { align-self: flex-start; }
  .cola { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 13px; max-height: 140px; overflow-y: auto; }
  .cola li { display: flex; justify-content: space-between; gap: 10px; padding: 6px 10px; background: var(--paper-dim); border-radius: 8px; }
  .actividad { font-size: 13px; background: var(--accent-soft); color: var(--accent); border-radius: 10px; padding: 10px 14px; }
  .actividad.error { background: var(--unreviewed-bg); color: var(--unreviewed); }
  .barra-prog { height: 5px; background: var(--paper); border-radius: 3px; margin-top: 8px; overflow: hidden; }
  .barra-prog div { height: 100%; background: var(--accent); transition: width .2s; }
  .bandeja { display: flex; flex-direction: column; gap: 10px; max-height: 50dvh; overflow-y: auto; }
  .recibido { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
  .nombre { font-size: 13.5px; min-width: 0; overflow-wrap: anywhere; }
  .acciones { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .acciones select { max-width: 200px; padding: 5px 8px; font-size: 12.5px; }
  .o { font-size: 12px; }
  .sin-receptor { display: flex; flex-direction: column; gap: 10px; }
  .sin-receptor p { margin: 0; font-size: 13.5px; line-height: 1.5; }
  .sin-receptor .serif { font-size: 17px; }
  .sin-receptor code { font-size: 12px; background: var(--paper-dim); padding: 8px 10px; border-radius: 8px; overflow-wrap: anywhere; }
  .pie { font-size: 12px; margin: 0; }
  @media (max-width: 820px) {
    .codigo-caja { flex-direction: column; text-align: center; }
    .codigo-form { flex-wrap: wrap; }
  }
</style>
