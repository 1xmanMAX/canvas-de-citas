// Datos de ejemplo (los del mockup) para explorar la app sin importar nada.
import { guardarProyecto, guardarFuente, guardarCita, nuevoId } from './store.svelte.js'

export function cargarEjemplo() {
  const p = guardarProyecto({
    tipo: 'tesis',
    titulo: 'Comportamiento estructural de puentes en zonas sísmicas',
    area: 'Ingeniería Civil · Facultad de Ingeniería',
    objetivo_general: 'Evaluar el comportamiento estructural de puentes de concreto armado sometidos a cargas sísmicas en la costa peruana.',
    objetivos_especificos: [
      'Analizar el desempeño sismorresistente de tres tipologías de puentes.',
      'Proponer criterios de diseño basados en desempeño para zonas de alta sismicidad.'
    ],
    indicadores: ['Índice de daño estructural (IDE)', 'Desplazamiento relativo de entrepiso']
  })

  // [autores, año, título, tipo, editorial, tema, etiquetas, estado de uso, verificación, idioma]
  const datos = [
    [['Villarreal, R.'], 2018, 'Diseño sismorresistente de puentes de concreto armado', 'libro', 'Lima: Pontificia Universidad Católica del Perú', 'Diseño sísmico', ['cap. 2'], 'usando', 'verificado', 'es'],
    [['ASCE'], 2016, 'Minimum design loads for buildings and other structures (ASCE/SEI 7-16)', 'normativa_tecnica', 'American Society of Civil Engineers', 'Normativa', [], 'usando', 'verificado', 'en'],
    [['Priestley, M. J. N.', 'Calvi, G. M.', 'Kowalsky, M. J.'], 2007, 'Displacement-based seismic design of structures', 'libro', 'IUSS Press', 'Diseño sísmico', [], 'usando', 'verificado', 'en'],
    [['MTC'], 2021, 'Manual de puentes', 'normativa_tecnica', 'Ministerio de Transportes y Comunicaciones', 'Normativa', ['normativa'], 'revisado_no_usado', 'dudoso', 'es'],
    [['Chopra, A. K.'], 2012, 'Dynamics of structures: theory and applications to earthquake engineering', 'libro', 'Pearson', 'Dinámica estructural', [], 'usando', 'verificado', 'en'],
    [['SENCICO'], 2019, 'Norma técnica E.030 Diseño sismorresistente', 'normativa_tecnica', 'SENCICO', 'Normativa', [], 'no_revisado', 'no_verificado', 'es'],
    [['Bertero, V. V.'], 2000, 'Performance-based seismic engineering: conventional vs. innovative approaches', 'articulo_cientifico', '12th World Conference on Earthquake Engineering', 'Dinámica estructural', [], 'revisado_no_usado', 'dudoso', 'en'],
    [['Paulay, T.', 'Priestley, M. J. N.'], 1992, 'Seismic design of reinforced concrete and masonry buildings', 'libro', 'Wiley', 'Diseño sísmico', [], 'no_revisado', 'verificado', 'en'],
    [['Ottazzi, G.'], 2015, 'Apuntes del curso Concreto Armado 1', 'libro', 'Lima: PUCP', 'Concreto armado', [], 'revisado_no_usado', 'no_verificado', 'es'],
    [['AASHTO'], 2020, 'LRFD bridge design specifications', 'normativa_tecnica', 'AASHTO', 'Normativa', [], 'no_revisado', 'verificado', 'en']
  ]

  const ids = datos.map(([autores, anio, titulo, tipo_fuente, revista_o_editorial, tema, etiquetas, estado_uso, estado_verificacion, idioma]) => {
    const f = guardarFuente({
      id: nuevoId('fuentes'), tipo_fuente, autores, anio, titulo, revista_o_editorial, doi_o_url: '', idioma,
      entrada_bibliografia: '', estado_verificacion,
      fuente_verificacion: estado_verificacion === 'no_verificado' ? '' : tipo_fuente === 'libro' ? 'Open Library' : 'CrossRef',
      notas_correccion: '', tema, ...(etiquetas.length ? { etiquetas } : {})
    })
    const usada = estado_uso === 'usando'
    const apellido = autores[0].split(',')[0]
    guardarCita({
      proyecto_id: p.id, fuente_id: f.id, estado_uso, cita_textual_o_parafraseo: 'parafraseo', pagina: null,
      cita_en_texto: usada ? `(${apellido}${autores.length > 2 ? ' et al.' : ''}, ${anio})` : '',
      contexto: usada ? 'Marco teórico, capítulo 3' : ''
    })
    return f.id
  })

  // Villarreal (2018) con tres citas, como en el mockup de la ventana de citas.
  const villarreal = ids[0]
  guardarCita({ proyecto_id: p.id, fuente_id: villarreal, estado_uso: 'usando', cita_textual_o_parafraseo: 'textual', pagina: 45, cita_en_texto: '(Villarreal, 2018, p. 45)', contexto: 'Antecedentes, capítulo 2' })
  guardarCita({ proyecto_id: p.id, fuente_id: villarreal, estado_uso: 'usando', cita_textual_o_parafraseo: 'textual', pagina: 102, cita_en_texto: '(Villarreal, 2018, p. 102)', contexto: 'Discusión de resultados, capítulo 5' })

  p.canvas.notas.push({ id: 'nota_ejemplo', texto: 'Revisar con el asesor si conviene citar directo a MTC (2022) o buscar la norma técnica original.', x: -640, y: -430 })
  p.canvas.conexiones.push({ id: 'con_ejemplo', desde: ids[2], hasta: ids[4], etiqueta: 'misma metodología' })
  guardarProyecto(p)

  location.hash = `#/p/${p.id}`
}
