// Casos de parche compartidos por las pruebas de JS y Rust.
const proyecto = (canvas = {}, extra = {}) => ({ id: 'proyecto_001', titulo: 'Tesis', ...extra, canvas: { modo: 'libre', posiciones: {}, notas: [], conexiones: [], objetivos: {}, ...canvas } })
const fuente = (id, extra = {}) => ({ id, titulo: `T ${id}`, anio: 2020, autores: ['Pérez, A.'], ...extra })
const datos = (proyectos = [], fuentes = [], citas = []) => ({ proyectos, fuentes, citas })

export const CASOS = [
  { nombre: 'sin cambios', a: datos([proyecto()], [fuente('f1')]), b: datos([proyecto()], [fuente('f1')]) },
  { nombre: 'un campo de una fuente', a: datos([], [fuente('f1'), fuente('f2')]), b: datos([], [fuente('f1'), fuente('f2', { anio: 2024 })]) },
  { nombre: 'fuente nueva y fuente borrada', a: datos([], [fuente('f1'), fuente('f2')]), b: datos([], [fuente('f2'), fuente('f3')]) },
  { nombre: 'nota movida en el lienzo', a: datos([proyecto({ notas: [{ id: 'n1', texto: 'A', x: 0, y: 0 }, { id: 'n2', texto: 'B', x: 5, y: 5 }] })]), b: datos([proyecto({ notas: [{ id: 'n1', texto: 'A', x: 40, y: -12.5 }, { id: 'n2', texto: 'B', x: 5, y: 5 }] })]) },
  { nombre: 'posiciones y sub-lienzos', a: datos([proyecto({ posiciones: { f1: { x: 0, y: 0 } }, objetivos: { oe1: { notas: [] } } })]), b: datos([proyecto({ posiciones: { f2: { x: 1, y: 2 } }, objetivos: { oe1: { notas: [{ id: 'n9', texto: 'ñandú "comillas"\n' }] }, oe2: { notas: [] } } })]) },
  { nombre: 'reordenar', a: datos([], [fuente('f1'), fuente('f2'), fuente('f3')]), b: datos([], [fuente('f3'), fuente('f1'), fuente('f2')]) },
  { nombre: 'cambio de tipo y null', a: datos([], [fuente('f1', { doi: null, paginas: [1, 2], notas: 'x' })]), b: datos([], [fuente('f1', { doi: '10.1/x', paginas: '1-2', notas: null })]) },
  { nombre: 'campo quitado y lista sin ids', a: datos([], [fuente('f1', { autores: ['A', 'B'], extra: true })]), b: datos([], [fuente('f1', { autores: ['A', 'C'] })]) },
  { nombre: 'citas nuevas al final', a: datos([], [], [{ id: 'c1', texto: 'uno' }]), b: datos([], [], [{ id: 'c1', texto: 'uno' }, { id: 'c2', texto: 'dos', pagina: 3 }, { id: 'c3', texto: 'tres' }]) }
]
