<script>
  // Lista de proyectos (mockup 1-proyectos).
  import Icono from '../components/Icono.svelte'
  import ProyectoForm from '../components/ProyectoForm.svelte'
  import { S } from '../lib/store.svelte.js'
  import { estadoDeCitas, haceCuanto, TIPOS_PROYECTO } from '../lib/citas.js'
  import { cargarEjemplo } from '../lib/ejemplo.js'
  import { R } from '../lib/celular.svelte.js'
  import BotonSincro from '../components/BotonSincro.svelte'
  import { esAndroid } from '../lib/plataforma.js'

  let { abrirDatos, abrirCelular } = $props()
  let nuevo = $state(false)

  const tarjetas = $derived(
    S.proyectos
      .map(p => {
        const porFuente = new Map()
        for (const c of S.citasPorProyecto.get(p.id) || []) (porFuente.get(c.fuente_id) ?? porFuente.set(c.fuente_id, []).get(c.fuente_id)).push(c)
        const n = { usando: 0, revisado_no_usado: 0, no_revisado: 0 }
        for (const cs of porFuente.values()) n[estadoDeCitas(cs)]++
        return { p, n }
      })
      .sort((a, b) => String(b.p.actualizado || '').localeCompare(String(a.p.actualizado || '')))
  )
</script>

<header class="cabecera">
  <div class="fila">
    <a class="logo" href="#/" aria-label="Inicio">C</a>
    <span class="marca">Canvas de Citas</span>
  </div>
  <div class="espacio"></div>
  <a class="btn solo-escritorio" href="#/citas">Biblioteca</a>
  <a class="icono-btn solo-movil" href="#/citas" aria-label="Biblioteca"><Icono nombre="lista" tam={18} /></a>
<BotonSincro {abrirDatos} />{#if !esAndroid}<button class="icono-btn celular-btn" aria-label="Celular y PixPin" title="Pasar archivos con el celular o PixPin" onclick={abrirCelular}><Icono nombre="celular" tam={18} />{#if R.recibidos.length}<span class="insignia">{R.recibidos.length}</span>{/if}</button>{/if}
  <button class="btn solo-escritorio" onclick={abrirDatos}><Icono nombre="ajustes" />Configuración</button>
  <button class="icono-btn solo-movil" aria-label="Configuración" onclick={abrirDatos}><Icono nombre="ajustes" tam={18} /></button>
  <button class="btn primario" aria-label="Nuevo proyecto" onclick={() => (nuevo = true)}>+ <span class="solo-escritorio">Nuevo proyecto</span></button>
</header>

<main>
  <div class="rotulo encabezado">Tus proyectos</div>
  <div class="rejilla-p">
    {#each tarjetas as { p, n } (p.id)}
      <a class="tarjeta" href="#/p/{p.id}">
        <span class="chip"><Icono nombre={p.tipo === 'otro' ? 'maletin' : 'tesis'} tam={12} trazo={2} />{TIPOS_PROYECTO[p.tipo] || 'Tesis'}</span>
        <div class="titulo serif">{p.titulo}</div>
        <div class="suave area">{p.area || ' '}</div>
        <div class="cuentas">
          <span title="Usando en el texto"><span class="punto usando"></span>{n.usando}</span>
          <span title="Revisado, no usado"><span class="punto revisado_no_usado"></span>{n.revisado_no_usado}</span>
          <span title="Sin revisar"><span class="punto no_revisado"></span>{n.no_revisado}</span>
        </div>
        <div class="pie suave">Actualizado {haceCuanto(p.actualizado)}</div>
      </a>
    {/each}
    <button class="tarjeta nueva" onclick={() => (nuevo = true)}>
      <Icono nombre="mas" tam={24} trazo={2} />
      <span>Nuevo proyecto</span>
    </button>
  </div>

  {#if !S.proyectos.length}
    <div class="bienvenida">
      <p class="serif">Empieza aquí</p>
      <p class="suave">
        Crea tu primer proyecto, importa los JSON (<code>proyectos.json</code>, <code>fuentes.json</code>, <code>citas.json</code>)
        que genera la skill <b>citas-tesis</b>, o carga un ejemplo para explorar la app.
      </p>
      <div class="fila envolver">
        <button class="btn" onclick={abrirDatos}>Importar JSON</button>
        <button class="btn fantasma" onclick={cargarEjemplo}>Cargar ejemplo</button>
      </div>
    </div>
  {/if}
</main>

{#if nuevo}
  <ProyectoForm onclose={() => (nuevo = false)} oncreado={id => (location.hash = `#/p/${id}`)} />
{/if}

<style>
  main { padding: 40px 48px; overflow-y: auto; flex-grow: 1; }
  .encabezado { font-size: 13px; font-weight: 400; margin-bottom: 20px; }
  .rejilla-p { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
  .tarjeta {
    display: flex; flex-direction: column; text-decoration: none; color: inherit; padding: 24px; border-radius: 14px;
    border: 1px solid var(--line); background: var(--paper-dim); box-shadow: 0 1px 3px rgba(33, 31, 26, .06); text-align: left;
  }
  .tarjeta:hover { border-color: var(--ink-soft); color: inherit; }
  .titulo { font-size: 19px; line-height: 1.3; margin-top: 14px; min-height: 76px; }
  .area { font-size: 13px; margin-top: 4px; }
  .cuentas { display: flex; gap: 16px; margin-top: 18px; font-size: 13px; }
  .cuentas > span { display: flex; align-items: center; gap: 5px; }
  .pie { font-size: 12px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
  .nueva { border-style: dashed; background: none; box-shadow: none; align-items: center; justify-content: center; gap: 8px; color: var(--ink-soft); min-height: 220px; font-size: 14px; }
  .bienvenida { margin-top: 32px; max-width: 560px; }
  .bienvenida p { margin: 0 0 10px; line-height: 1.55; }
  .bienvenida .serif { font-size: 19px; }
  code { font-size: 12px; }
  @media (max-width: 820px) {
    main { padding: 20px 16px; }
    .rejilla-p { grid-template-columns: 1fr; gap: 14px; }
    .titulo { min-height: 0; }
    .nueva { min-height: 90px; }
  }
</style>
