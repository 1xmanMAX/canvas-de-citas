// app/tests/unit/sincro.test.js — fusión a tres vías (src/lib/sincro.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fusionar3, igual } from '../../src/lib/sincro.js'

const fuente = (id, extra = {}) => ({ id, titulo: `T ${id}`, anio: 2020, ...extra })
const proyecto = (canvas = {}) => ({ id: 'proyecto_001', titulo: 'Tesis', canvas: { modo: 'libre', posiciones: {}, notas: [], conexiones: [], objetivos: {}, ...canvas } })
const datos = (fuentes = [], proyectos = [], citas = []) => ({ proyectos, fuentes, citas })

test('igual ignora el orden de las claves', () => {
  assert.ok(igual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }))
  assert.ok(!igual({ a: 1 }, { a: 2 }))
})

test('primera sincronización con el celular vacío trae todo de la PC', () => {
  const pc = datos([fuente('fuente_001')], [proyecto()])
  const r = fusionar3(null, datos(), pc)
  assert.deepEqual(r.resultado.fuentes, pc.fuentes)
  assert.deepEqual(r.resultado.proyectos, pc.proyectos)
  assert.equal(r.conflictos.length, 0)
  assert.deepEqual(r.borrados, { proyectos: [], fuentes: [], citas: [] })
})

test('primera sincronización con datos en ambos lados no pierde nada', () => {
  const r = fusionar3(null, datos([fuente('fuente_001', { anio: 2021 })]), datos([fuente('fuente_001'), fuente('fuente_002')]))
  assert.equal(r.resultado.fuentes.length, 2)
  assert.equal(r.resultado.fuentes[0].anio, 2021) // choque: gana el celular
  assert.equal(r.conflictos.length, 1)
})

test('cambios en campos distintos de la misma fuente se combinan', () => {
  const base = datos([fuente('fuente_001')])
  const r = fusionar3(base, datos([fuente('fuente_001', { titulo: 'Nuevo título' })]), datos([fuente('fuente_001', { anio: 2024 })]))
  assert.deepEqual(r.resultado.fuentes[0], fuente('fuente_001', { titulo: 'Nuevo título', anio: 2024 }))
  assert.equal(r.conflictos.length, 0)
})

test('mismo campo cambiado en ambos lados: gana el celular y se cuenta', () => {
  const base = datos([fuente('fuente_001')])
  const r = fusionar3(base, datos([fuente('fuente_001', { anio: 2001 })]), datos([fuente('fuente_001', { anio: 2002 })]))
  assert.equal(r.resultado.fuentes[0].anio, 2001)
  assert.deepEqual(r.conflictos, [{ ruta: 'fuentes[fuente_001].anio', tipo: 'ambos-cambiaron' }])
})

test('lo que borra el celular se borra y se informa a la PC', () => {
  const base = datos([fuente('fuente_001'), fuente('fuente_002')])
  const r = fusionar3(base, datos([fuente('fuente_001')]), base)
  assert.deepEqual(r.resultado.fuentes.map(f => f.id), ['fuente_001'])
  assert.deepEqual(r.borrados.fuentes, ['fuente_002'])
})

test('lo que borró la PC desaparece del celular', () => {
  const base = datos([fuente('fuente_001'), fuente('fuente_002')])
  const r = fusionar3(base, base, datos([fuente('fuente_002')]))
  assert.deepEqual(r.resultado.fuentes.map(f => f.id), ['fuente_002'])
  assert.deepEqual(r.borrados.fuentes, [])
})

test('borrado contra edición: se conserva la edición', () => {
  const base = datos([fuente('fuente_001')])
  const r = fusionar3(base, datos([]), datos([fuente('fuente_001', { anio: 1999 })]))
  assert.equal(r.resultado.fuentes[0].anio, 1999)
  assert.equal(r.conflictos[0].tipo, 'borrado-vs-edicion')
})

test('notas nuevas en ambos lados del mismo lienzo se conservan todas', () => {
  const base = datos([], [proyecto()])
  const l = datos([], [proyecto({ notas: [{ id: 'nota_a', texto: 'A', x: 0, y: 0 }] })])
  const r = datos([], [proyecto({ notas: [{ id: 'nota_b', texto: 'B', x: 9, y: 9 }] })])
  const res = fusionar3(base, l, r)
  assert.deepEqual(res.resultado.proyectos[0].canvas.notas.map(n => n.id), ['nota_a', 'nota_b'])
  assert.equal(res.conflictos.length, 0)
})

test('posiciones y sub-lienzos de objetivos se combinan por clave', () => {
  const base = datos([], [proyecto({ posiciones: { fuente_001: { x: 0, y: 0 } }, objetivos: { oe1: { notas: [] } } })])
  const l = datos([], [proyecto({ posiciones: { fuente_001: { x: 50, y: 0 } }, objetivos: { oe1: { notas: [{ id: 'nota_c', texto: 'C' }] } } })])
  const r = datos([], [proyecto({ posiciones: { fuente_001: { x: 0, y: 0 }, fuente_002: { x: 7, y: 7 } }, objetivos: { oe1: { notas: [] }, oe2: { notas: [] } } })])
  const c = fusionar3(base, l, r).resultado.proyectos[0].canvas
  assert.deepEqual(c.posiciones, { fuente_001: { x: 50, y: 0 }, fuente_002: { x: 7, y: 7 } })
  assert.deepEqual(Object.keys(c.objetivos).sort(), ['oe1', 'oe2'])
  assert.equal(c.objetivos.oe1.notas[0].id, 'nota_c')
})
