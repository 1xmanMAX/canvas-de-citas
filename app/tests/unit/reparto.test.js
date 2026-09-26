// app/tests/unit/reparto.test.js — qué va a cada carpeta y renumeración de ids (src/lib/reparto.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { repartir, docsDe, renumerar } from '../../src/lib/reparto.js'

const VECTORES = JSON.parse(fs.readFileSync(new URL('../vectores/reparto.json', import.meta.url), 'utf8'))
const ids = l => l.map(x => x.id)

for (const v of VECTORES) {
  test(`repartir: ${v.nombre}`, () => {
    const r = repartir(v.datos, v.carpetas)
    assert.deepEqual([...r.keys()].sort(), Object.keys(v.esperado).sort())
    for (const [clave, e] of Object.entries(v.esperado)) {
      const p = r.get(clave)
      assert.deepEqual({ proyectos: ids(p.proyectos), fuentes: ids(p.fuentes), citas: ids(p.citas) }, e, clave)
    }
  })
}

test('docsDe: documentos de sus fuentes y originales de sus fotos (también en sub-lienzos)', () => {
  const parte = {
    proyectos: [{ id: 'p', canvas: { fotos: [{ id: 'foto_a', original: 'fotos/foto_a.jpg' }, { id: 'foto_b' }], objetivos: { oe1: { fotos: [{ id: 'foto_c', original: 'fotos/foto_c.png' }] } } } }],
    fuentes: [{ id: 'fuente_001', documento_original: 'fuentes/fuente_001/documento.pdf' }, { id: 'fuente_002', documento_original: null }],
    citas: []
  }
  assert.deepEqual(docsDe(parte).sort(), ['fotos/foto_a.jpg', 'fotos/foto_c.png', 'fuentes/fuente_001/documento.pdf'])
})

// --- renumerar ---
function generador(topes) {
  const t = { ...topes }
  const pref = { proyectos: 'proyecto', fuentes: 'fuente', citas: 'cita' }
  return col => `${pref[col]}_${String(++t[col]).padStart(3, '0')}`
}

test('renumerar: sin choques no cambia nada', () => {
  const entrantes = { proyectos: [{ id: 'proyecto_002', titulo: 'B' }], fuentes: [{ id: 'fuente_009', titulo: 'Z' }], citas: [{ id: 'cita_009', proyecto_id: 'proyecto_002', fuente_id: 'fuente_009' }] }
  const { datos, mapa } = renumerar(entrantes, { proyectos: [{ id: 'proyecto_001', titulo: 'A' }], fuentes: [], citas: [] }, generador({ proyectos: 1, fuentes: 0, citas: 0 }))
  assert.deepEqual(datos, entrantes)
  assert.deepEqual(mapa, { proyectos: {}, fuentes: {}, citas: {} })
})

test('renumerar: la misma fuente (mismo id y título, o mismo DOI, o título+año) no se duplica', () => {
  const existentes = { proyectos: [], citas: [], fuentes: [
    { id: 'fuente_001', titulo: 'Pavimentos rígidos', anio: 2020 },
    { id: 'fuente_002', titulo: 'Otro', doi_o_url: 'https://doi.org/10.1234/ABC' },
    { id: 'fuente_003', titulo: 'Manual de carreteras', anio: 2018 }
  ] }
  const entrantes = { proyectos: [], citas: [], fuentes: [
    { id: 'fuente_001', titulo: 'Pavimentos Rígidos' },
    { id: 'fuente_050', titulo: 'Distinto título', doi_o_url: '10.1234/abc' },
    { id: 'fuente_051', titulo: 'MANUAL DE CARRETERAS', anio: 2018 }
  ] }
  const { datos, mapa } = renumerar(entrantes, existentes, generador({ proyectos: 0, fuentes: 3, citas: 0 }))
  assert.deepEqual(ids(datos.fuentes), ['fuente_001', 'fuente_002', 'fuente_003'])
  assert.deepEqual(mapa.fuentes, { fuente_050: 'fuente_002', fuente_051: 'fuente_003' })
})

test('renumerar: ids que chocan con contenido distinto reciben ids nuevos y se reescriben las referencias', () => {
  const existentes = {
    proyectos: [{ id: 'proyecto_001', titulo: 'Mi tesis' }],
    fuentes: [{ id: 'fuente_001', titulo: 'Fuente mía' }],
    citas: [{ id: 'cita_001', proyecto_id: 'proyecto_001', fuente_id: 'fuente_001', pagina: 3 }]
  }
  const nota = { id: 'nota_x', texto: 'idea' }
  const entrantes = {
    proyectos: [{
      id: 'proyecto_001', titulo: 'Otra tesis',
      canvas: {
        posiciones: { fuente_001: { x: 1, y: 2 } },
        notas: [nota],
        conexiones: [{ desde: 'nota_x', hasta: 'fuente_001' }],
        agrupadores: [{ id: 'g', miembros: ['fuente_001', 'nota_x'] }],
        objetivos: { oe1: { fuentes: [{ id: 'fuente_001', x: 0, y: 0 }], conexiones: [{ desde: 'fuente_001', hasta: 'objetivo' }], agrupadores: [{ id: 'g2', miembros: ['fuente_001'] }] } }
      }
    }],
    fuentes: [{ id: 'fuente_001', titulo: 'Fuente ajena', documento_original: 'fuentes/fuente_001/documento.pdf' }],
    citas: [{ id: 'cita_001', proyecto_id: 'proyecto_001', fuente_id: 'fuente_001', pagina: 9 }]
  }
  const { datos, mapa } = renumerar(entrantes, existentes, generador({ proyectos: 1, fuentes: 1, citas: 1 }))
  assert.deepEqual(mapa, { proyectos: { proyecto_001: 'proyecto_002' }, fuentes: { fuente_001: 'fuente_002' }, citas: { cita_001: 'cita_002' } })
  const p = datos.proyectos[0], c = p.canvas
  assert.equal(p.id, 'proyecto_002')
  assert.deepEqual(Object.keys(c.posiciones), ['fuente_002'])
  assert.deepEqual(c.conexiones, [{ desde: 'nota_x', hasta: 'fuente_002' }])
  assert.deepEqual(c.agrupadores[0].miembros, ['fuente_002', 'nota_x'])
  assert.equal(c.objetivos.oe1.fuentes[0].id, 'fuente_002')
  assert.deepEqual(c.objetivos.oe1.conexiones, [{ desde: 'fuente_002', hasta: 'objetivo' }])
  assert.deepEqual(c.objetivos.oe1.agrupadores[0].miembros, ['fuente_002'])
  assert.equal(datos.fuentes[0].id, 'fuente_002')
  assert.equal(datos.fuentes[0].documento_original, 'fuentes/fuente_002/documento.pdf')
  assert.deepEqual(datos.citas[0], { id: 'cita_002', proyecto_id: 'proyecto_002', fuente_id: 'fuente_002', pagina: 9 })
  // No toca los objetos de entrada.
  assert.equal(entrantes.proyectos[0].id, 'proyecto_001')
})

test('renumerar: el mismo proyecto y la misma cita (reabrir la propia carpeta) conservan sus ids', () => {
  const existentes = {
    proyectos: [{ id: 'proyecto_001', titulo: 'Mi tesis' }],
    fuentes: [{ id: 'fuente_001', titulo: 'F' }],
    citas: [{ id: 'cita_001', proyecto_id: 'proyecto_001', fuente_id: 'fuente_001', pagina: 3, cita_en_texto: '(A, 2020)' }]
  }
  const entrantes = structuredClone(existentes)
  entrantes.proyectos[0].area = 'otra cosa'
  const { datos, mapa } = renumerar(entrantes, existentes, generador({ proyectos: 1, fuentes: 1, citas: 1 }))
  assert.deepEqual(mapa, { proyectos: {}, fuentes: {}, citas: {} })
  assert.equal(datos.proyectos[0].area, 'otra cosa')
})

test('renumerar: los ids nuevos no chocan con otros ids que trae la carpeta (C3)', () => {
  const existentes = { proyectos: [], citas: [{ id: 'cita_001', proyecto_id: 'p', fuente_id: 'fuente_001', pagina: 1 }], fuentes: [{ id: 'fuente_001', titulo: 'Mía' }, { id: 'fuente_002', titulo: 'Mía 2' }] }
  const entrantes = {
    proyectos: [],
    fuentes: [{ id: 'fuente_001', titulo: 'Ajena' }, { id: 'fuente_003', titulo: 'Ajena 3' }],
    citas: [{ id: 'cita_001', proyecto_id: 'q', fuente_id: 'fuente_001', pagina: 9 }, { id: 'cita_002', proyecto_id: 'q', fuente_id: 'fuente_003', pagina: 2 }]
  }
  // El contador local solo conoce lo de aquí: propondría fuente_003 y cita_002, que ya vienen en la carpeta.
  const { datos } = renumerar(entrantes, existentes, generador({ proyectos: 0, fuentes: 2, citas: 1 }))
  const fs = ids(datos.fuentes), cs = ids(datos.citas)
  assert.equal(new Set(fs).size, 2, 'no se pierde ninguna fuente: ' + fs)
  assert.equal(new Set(cs).size, 2, 'no se pierde ninguna cita: ' + cs)
  assert.ok(fs.includes('fuente_003') && !fs.includes('fuente_001'))
  assert.equal(datos.citas.find(c => c.pagina === 2).fuente_id, 'fuente_003')
  assert.notEqual(datos.citas.find(c => c.pagina === 9).fuente_id, 'fuente_003')
})

test('renumerar: también el origen (vínculo al documento) de notas y fotos, en lienzo y sub-lienzos (I1)', () => {
  const existentes = { proyectos: [], citas: [], fuentes: [{ id: 'fuente_001', titulo: 'Mía' }] }
  const entrantes = {
    fuentes: [{ id: 'fuente_001', titulo: 'Ajena' }], citas: [],
    proyectos: [{ id: 'p', titulo: 'P', canvas: {
      notas: [{ id: 'n', origen: { fuente: 'fuente_001', pagina: 3 } }],
      fotos: [{ id: 'f', origen: { fuente: 'fuente_001' } }],
      objetivos: { oe1: { notas: [{ id: 'n2', origen: { fuente: 'fuente_001' } }], fotos: [] } }
    } }]
  }
  const { datos } = renumerar(entrantes, existentes, generador({ proyectos: 0, fuentes: 1, citas: 0 }))
  const c = datos.proyectos[0].canvas
  assert.equal(c.notas[0].origen.fuente, 'fuente_002')
  assert.equal(c.fotos[0].origen.fuente, 'fuente_002')
  assert.equal(c.objetivos.oe1.notas[0].origen.fuente, 'fuente_002')
})
