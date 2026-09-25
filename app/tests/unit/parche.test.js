// app/tests/unit/parche.test.js — parches: solo lo que cambió (src/lib/parche.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { diferencias, aplicar, canonico, huella, pesoDe } from '../../src/lib/parche.js'
import { CASOS } from '../vectores/casos-parche.mjs'

for (const c of CASOS) {
  test(`aplicar(a, diferencias(a, b)) = b: ${c.nombre}`, () => {
    assert.deepEqual(aplicar(c.a, diferencias(c.a, c.b)), c.b)
  })
}

test('sin cambios: parche vacío', () => {
  assert.deepEqual(diferencias(CASOS[0].a, CASOS[0].b), [])
})

test('mover una nota solo envía sus coordenadas, no el proyecto con audios y fotos', () => {
  const audio = 'data:audio/webm;base64,' + 'A'.repeat(200_000)
  const p = x => ({ proyectos: [{ id: 'p', canvas: { audios: [{ id: 'a1', audio }], notas: [{ id: 'n1', x, y: 0 }] } }], fuentes: [], citas: [] })
  const ops = diferencias(p(0), p(80))
  assert.deepEqual(ops, [{ r: ['proyectos', { id: 'p' }, 'canvas', 'notas', { id: 'n1' }, 'x'], v: 80 }])
  assert.ok(pesoDe(ops) < 200)
})

test('no aplica un parche de otra versión', () => {
  assert.throws(() => aplicar({ fuentes: [] }, [{ r: ['fuentes', { id: 'f1' }, 'anio'], v: 1 }]), /no corresponde/)
})

test('canónico ordena las claves y la huella no depende del orden', async () => {
  assert.equal(canonico({ b: 1, a: [{ d: 'ñ', c: null }] }), '{"a":[{"c":null,"d":"ñ"}],"b":1}')
  assert.equal(await huella({ fuentes: [{ a: 1, b: 2 }] }), await huella({ fuentes: [{ b: 2, a: 1 }] }))
  assert.notEqual(await huella({ fuentes: [{ a: 1 }] }), await huella({ fuentes: [{ a: 2 }] }))
})

test('el vector compartido con Rust está al día', async () => {
  const v = JSON.parse(fs.readFileSync(new URL('../vectores/parche.json', import.meta.url), 'utf8'))
  assert.equal(v.length, CASOS.length)
  for (const c of v) {
    assert.deepEqual(diferencias(c.a, c.b), c.ops, c.nombre)
    assert.equal(await huella(c.b), c.huella, c.nombre)
  }
})
