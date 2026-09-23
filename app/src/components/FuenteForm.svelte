<script>
  import { untrack } from 'svelte'
  import { TIPOS_FUENTE, ESTADOS_VERIF, sugerirBibliografia } from '../lib/citas.js'
  let { fuente = null, onguardar, oncancelar, textoBoton = 'Guardar fuente' } = $props()

  const base = untrack(() => (fuente ? $state.snapshot(fuente) : {}))
  let f = $state({ tipo_fuente: 'articulo_cientifico', idioma: 'es', estado_verificacion: 'no_verificado', fuente_verificacion: '', ...base })
  let autores = $state((base.autores || []).join('\n'))
  let etiquetas = $state((base.etiquetas || []).join(', '))

  function datos() {
    const anio = String(f.anio ?? '').trim()
    const d = {
      ...f,
      autores: autores.split('\n').map(s => s.trim()).filter(Boolean),
      anio: /^\d+$/.test(anio) ? +anio : anio || null,
      etiquetas: etiquetas.split(',').map(s => s.trim()).filter(Boolean)
    }
    if (!d.etiquetas.length) delete d.etiquetas
    if (!d.tema?.trim()) delete d.tema
    return d
  }

  function enviar(e) {
    e.preventDefault()
    if (!f.titulo?.trim()) return
    onguardar(datos())
  }
</script>

<form class="rejilla" onsubmit={enviar}>
  <label class="campo ancho"><span>Título *</span><input type="text" bind:value={f.titulo} required /></label>
  <label class="campo ancho">
    <span>Autores (uno por línea: Apellido, I.)</span>
    <textarea rows="2" bind:value={autores} placeholder={'García, M.\nLópez, J.'}></textarea>
  </label>
  <label class="campo"><span>Año</span><input type="text" inputmode="numeric" bind:value={f.anio} placeholder="2020" /></label>
  <label class="campo">
    <span>Tipo de fuente</span>
    <select bind:value={f.tipo_fuente}>{#each Object.entries(TIPOS_FUENTE) as [v, t]}<option value={v}>{t}</option>{/each}</select>
  </label>
  <label class="campo ancho"><span>Revista o editorial</span><input type="text" bind:value={f.revista_o_editorial} /></label>
  <label class="campo"><span>DOI o URL</span><input type="text" bind:value={f.doi_o_url} placeholder="https://doi.org/10…" /></label>
  <label class="campo">
    <span>Idioma</span>
    <select bind:value={f.idioma}><option value="es">Español</option><option value="en">Inglés</option><option value="otro">Otro</option></select>
  </label>
  <label class="campo">
    <span>Estado de verificación</span>
    <select bind:value={f.estado_verificacion}>{#each Object.entries(ESTADOS_VERIF) as [v, t]}<option value={v}>{t}</option>{/each}</select>
  </label>
  <label class="campo"><span>Verificado en</span><input type="text" bind:value={f.fuente_verificacion} placeholder="CrossRef, OpenAlex…" /></label>
  <div class="campo ancho">
    <span class="fila entre">Entrada de bibliografía
      <button type="button" class="btn chico fantasma" onclick={() => (f.entrada_bibliografia = sugerirBibliografia(datos()))}>Generar</button>
    </span>
    <textarea rows="2" bind:value={f.entrada_bibliografia} aria-label="Entrada de bibliografía"></textarea>
  </div>
  <label class="campo ancho"><span>Notas de corrección</span><textarea rows="2" bind:value={f.notas_correccion}></textarea></label>
  <label class="campo"><span>Tema (para agrupar)</span><input type="text" bind:value={f.tema} placeholder="Resistencia de materiales" /></label>
  <label class="campo"><span>Etiquetas (separadas por coma)</span><input type="text" bind:value={etiquetas} placeholder="cap. 2, normativa" /></label>
  <div class="fila fin ancho">
    {#if oncancelar}<button type="button" class="btn fantasma" onclick={oncancelar}>Cancelar</button>{/if}
    <button class="btn primario">{textoBoton}</button>
  </div>
</form>
