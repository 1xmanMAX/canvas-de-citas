<script>
  // Buscador general (Ctrl+F): encuentra en todos los proyectos abiertos por palabras, #tema y
  // @persona; los resultados se agrupan por tipo y al elegir uno se va a él. La pestaña
  // "Etiquetas y personas" muestra todas con cuántos elementos tiene cada una.
  import Modal from './Modal.svelte'
  import Icono from './Icono.svelte'
  import { S } from '../lib/store.svelte.js'
  import { autorCorto, anio } from '../lib/citas.js'
  import { B, sugerir, enfocar } from '../lib/buscador.svelte.js'
  import { parsearConsulta, coincideConsulta, resumen, normalizar, colorEtiqueta } from '../lib/etiquetas.js'
  import { autocompletar } from '../lib/autocompletar.js'

  let pestana = $state('resultados')
  let entrada = $state()
  let vistos = $state({}) // tipo → cuántos se muestran ("ver más")
  $effect(() => { entrada?.focus() })

  const GRUPOS = [
    ['nota', 'Notas', 'nota'], ['lista', 'Listas de tareas', 'tareas'], ['audio', 'Notas de voz', 'mic'], ['foto', 'Fotos', 'foto'],
    ['agrupador', 'Agrupadores', 'agrupar'], ['objetivo', 'Objetivos', 'objetivo'], ['fuente', 'Fuentes', 'libro'], ['cita', 'Citas', 'enlace']
  ]
  const PALETA = ['#E8E1F5', '#DDEBF7', '#DFF2E4', '#FBEBD3', '#F8DEDC', '#E3F1F1', '#F2EED9', '#ECE3DA']

  const consulta = $derived(parsearConsulta(B.q))
  const vacia = $derived(!consulta.temas.length && !consulta.personas.length && !consulta.palabras.length)
  const resultados = $derived(vacia ? [] : B.indice.filter(i => coincideConsulta(i, consulta)))
  const porTipo = $derived(GRUPOS.map(([tipo, nombre, icono]) => ({ tipo, nombre, icono, items: resultados.filter(i => i.tipo === tipo) })).filter(g => g.items.length))
  const nube = $derived(resumen(B.indice))

  /** Título del resultado: su título o un trozo del texto alrededor de la primera palabra buscada. */
  function titulo(i) {
    if (i.titulo) return i.titulo.length > 90 ? i.titulo.slice(0, 89) + '…' : i.titulo
    const t = i.texto.replace(/\s+/g, ' ').trim()
    const w = consulta.palabras[0], k = w ? normalizar(t).indexOf(w) : -1
    const ini = Math.max(0, k - 30)
    return (ini ? '…' : '') + t.slice(ini, ini + 90) + (t.length > ini + 90 ? '…' : '')
  }
  const donde = i => {
    const p = i.pid && S.proyectoPorId.get(i.pid)
    if (!p) return ''
    if (i.clave?.startsWith('l:')) { const f = S.fuentePorId.get(i.clave.slice(2)); return `${p.titulo} · Lectura de ${f ? `${autorCorto(f)} (${anio(f)})` : 'una fuente'}` }
    return p.titulo + (i.clave ? ` · ${i.clave.toUpperCase()}` : '')
  }
  function elegirEtiqueta(t) {
    B.q = t.startsWith('@') ? t : '#' + t
    pestana = 'resultados'
    entrada?.focus()
  }
</script>

<Modal titulo="Buscar en todo" ancho={720} onclose={() => (B.abierto = false)}>
  <div class="buscador">
    <div class="caja">
      <Icono nombre="buscar" tam={16} trazo={2} />
      <input bind:this={entrada} type="search" bind:value={B.q} use:autocompletar={{ sugerir }}
        placeholder="Palabras, #tema o @persona (se pueden combinar)" aria-label="Buscar en todo" />
    </div>
    <div class="segmentado pestanas">
      <button aria-pressed={pestana === 'resultados'} onclick={() => (pestana = 'resultados')}>Resultados{resultados.length ? ` · ${resultados.length}` : ''}</button>
      <button aria-pressed={pestana === 'etiquetas'} onclick={() => (pestana = 'etiquetas')}>Etiquetas y personas</button>
    </div>

    {#if pestana === 'resultados'}
      {#if vacia}
        <p class="suave nota">Escribe para buscar en notas, listas, notas de voz, fotos, agrupadores, objetivos, fuentes y citas de todos tus proyectos. Ejemplo: <code>#retrabajo @Villarreal costo</code>.</p>
      {:else if !resultados.length}
        <p class="suave nota">Nada coincide con “{B.q}”.</p>
      {:else}
        {#each porTipo as g (g.tipo)}
          <section>
            <div class="rotulo">{g.nombre} · {g.items.length}</div>
            <ul>
              {#each g.items.slice(0, vistos[g.tipo] || 30) as i (i.id)}
                <li>
                  <button class="resultado" onclick={() => enfocar(i)}>
                    <Icono nombre={g.icono} tam={15} />
                    <span class="txt">
                      <span class="titulo">{titulo(i)}</span>
                      {#if donde(i)}<span class="suave donde">{donde(i)}</span>{/if}
                    </span>
                    <span class="etqs">
                      {#each i.temas.slice(0, 3) as t}<span class="etq" style="background:{PALETA[colorEtiqueta(t)]}">#{t}</span>{/each}
                      {#each i.personas.slice(0, 2) as t}<span class="etq persona">{t}</span>{/each}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
            {#if g.items.length > (vistos[g.tipo] || 30)}
              <button class="btn chico fantasma" onclick={() => (vistos[g.tipo] = (vistos[g.tipo] || 30) + 60)}>Ver más</button>
            {/if}
          </section>
        {/each}
      {/if}
    {:else}
      {#if !nube.temas.length && !nube.personas.length}
        <p class="suave nota">Aún no hay etiquetas. Escribe <code>#tema</code> o <code>@persona</code> en una nota, una foto, una cita… o agrégalas como chips.</p>
      {/if}
      {#if nube.temas.length}
        <section>
          <div class="rotulo">Etiquetas</div>
          <div class="nube">
            {#each nube.temas as e (e.etiqueta)}
              <button class="etq grande" style="background:{PALETA[colorEtiqueta(e.etiqueta)]}" onclick={() => elegirEtiqueta(e.etiqueta)}>#{e.etiqueta} <b>{e.cuenta}</b></button>
            {/each}
          </div>
        </section>
      {/if}
      {#if nube.personas.length}
        <section>
          <div class="rotulo">Personas</div>
          <div class="nube">
            {#each nube.personas as e (e.etiqueta)}
              <button class="etq grande persona" onclick={() => elegirEtiqueta(e.etiqueta)}>{e.etiqueta} <b>{e.cuenta}</b></button>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>
</Modal>

<style>
  .buscador { display: flex; flex-direction: column; gap: 12px; min-height: 40dvh; }
  .caja { display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); color: var(--ink-soft); }
  .caja input { flex-grow: 1; border: none; background: none; padding: 12px 0; font-size: 15px; outline: none; box-shadow: none; }
  .pestanas { align-self: flex-start; }
  section { display: flex; flex-direction: column; gap: 6px; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .resultado { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: none; border-radius: 8px; background: none; text-align: left; color: var(--ink); cursor: pointer; }
  .resultado:hover, .resultado:focus-visible { background: var(--paper-dim); }
  .txt { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .titulo { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .donde { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .etqs { display: flex; gap: 4px; flex-shrink: 0; }
  .etq { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 999px; background: #E8E1F5; font-size: 11px; font-weight: 600; color: #3A372F; white-space: nowrap; }
  .etq.persona { background: #FFFFFF; color: #2F4FB5; box-shadow: inset 0 0 0 1px #2F4FB5; }
  .etq.grande { border: none; font-size: 13px; padding: 4px 12px; cursor: pointer; }
  .etq b { font-weight: 700; opacity: .7; }
  .nube { display: flex; flex-wrap: wrap; gap: 6px; }
  .nota { margin: 0; font-size: 13px; line-height: 1.55; }
  code { font-size: 12px; }
  @media (max-width: 600px) { .etqs { display: none; } }
</style>
