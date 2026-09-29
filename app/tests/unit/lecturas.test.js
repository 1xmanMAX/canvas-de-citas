// Lienzo de lectura de cada fuente: tarjetas propias y las "clavadas" en el lienzo general.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asegurarLectura, clavadasDe, cajasClavadas, cuentaLectura, alternarClavada, buscarEnLecturas } from '../../src/lib/lecturas.js'
import { renumerar, docsDe } from '../../src/lib/reparto.js'
import { indexar } from '../../src/lib/etiquetas.js'

const medir = () => ({ w: 200, h: 100 })

test('asegurarLectura crea el tablero una sola vez, con todas sus listas', () => {
  const cv = {}
  const t = asegurarLectura(cv, 'fuente_001')
  assert.deepEqual(Object.keys(t).sort(), ['agrupadores', 'audios', 'conexiones', 'fotos', 'listas', 'notas'])
  t.notas.push({ id: 'n1' })
  assert.equal(asegurarLectura(cv, 'fuente_001').notas.length, 1)
})

test('clavar y desclavar: en_general guarda el lugar en el general y se olvida al quitarla', () => {
  const cv = {}
  const t = asegurarLectura(cv, 'fuente_001')
  const n = { id: 'n1', x: 5, y: 6, texto: 'cita' }
  t.notas.push(n)
  assert.equal(alternarClavada('notas', n, (w, h) => ({ x: 10.4 + w, y: 20 + h }), medir), true)
  assert.deepEqual(n.en_general, { x: 210, y: 120 })
  assert.deepEqual({ x: n.x, y: n.y }, { x: 5, y: 6 }, 'su lugar en la lectura no cambia')
  assert.deepEqual(clavadasDe(cv).map(c => [c.fid, c.lista, c.obj.id]), [['fuente_001', 'notas', 'n1']])
  const caja = cajasClavadas(cv, medir).get('n1')
  assert.deepEqual([caja.x, caja.y, caja.w, caja.h, caja.fid], [210, 120, 200, 100, 'fuente_001'])
  assert.deepEqual(cuentaLectura(cv, 'fuente_001'), { total: 1, clavadas: 1 })
  assert.equal(alternarClavada('notas', n, () => assert.fail('no se pide lugar al quitarla'), medir), false)
  assert.equal('en_general' in n, false)
  assert.equal(clavadasDe(cv).length, 0)
  assert.deepEqual(cuentaLectura(cv, 'fuente_002'), { total: 0, clavadas: 0 })
})

test('buscarEnLecturas encuentra el tablero y la lista de una tarjeta', () => {
  const cv = { lecturas: { fuente_002: { notas: [], fotos: [{ id: 'f1' }] } } }
  const r = buscarEnLecturas(cv, 'f1')
  assert.equal(r.fid, 'fuente_002')
  assert.equal(r.lista, 'fotos')
  assert.equal(buscarEnLecturas(cv, 'nada'), null)
})

test('renumerar: las claves de los lienzos de lectura y sus referencias siguen a la fuente', () => {
  const existentes = { proyectos: [{ id: 'proyecto_001', titulo: 'Mía' }], fuentes: [{ id: 'fuente_001', titulo: 'Fuente mía' }], citas: [] }
  const entrantes = {
    proyectos: [{
      id: 'proyecto_009', titulo: 'Otra',
      canvas: { lecturas: { fuente_001: { notas: [{ id: 'n1', origen: { fuente: 'fuente_001' }, en_general: { x: 1, y: 2 } }], conexiones: [{ desde: 'fuente_001', hasta: 'n1' }] } } }
    }],
    fuentes: [{ id: 'fuente_001', titulo: 'Fuente ajena' }],
    citas: []
  }
  const { datos } = renumerar(entrantes, existentes, col => ({ proyectos: 'proyecto_010', fuentes: 'fuente_002', citas: 'cita_001' })[col])
  const l = datos.proyectos[0].canvas.lecturas
  assert.deepEqual(Object.keys(l), ['fuente_002'])
  assert.equal(l.fuente_002.notas[0].origen.fuente, 'fuente_002')
  assert.deepEqual(l.fuente_002.conexiones, [{ desde: 'fuente_002', hasta: 'n1' }])
  assert.deepEqual(l.fuente_002.notas[0].en_general, { x: 1, y: 2 })
})

test('docsDe incluye los originales de las fotos de los lienzos de lectura', () => {
  const parte = { fuentes: [], proyectos: [{ canvas: { fotos: [], lecturas: { fuente_001: { fotos: [{ id: 'foto_a', original: 'fotos/foto_a.jpg' }] } } } }] }
  assert.deepEqual(docsDe(parte), ['fotos/foto_a.jpg'])
})

test('el buscador indexa las tarjetas de las lecturas con la clave l:<fuente>', () => {
  const i = indexar({ proyectos: [{ id: 'proyecto_001', canvas: { lecturas: { fuente_003: { notas: [{ id: 'n1', texto: 'retrabajo #costos' }] } } } }] })
  const n = i.find(x => x.id === 'n1')
  assert.equal(n.clave, 'l:fuente_003')
  assert.deepEqual(n.temas, ['costos'])
})
