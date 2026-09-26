// app/tests/unit/gestos.test.js — mouse vs trackpad (src/lib/gestos.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esRuedaDeMouse, crearDetectorRueda } from '../../src/lib/gestos.js'

test('rueda de mouse clásica: líneas o muescas de 100/120', () => {
  assert.ok(esRuedaDeMouse({ deltaMode: 1, deltaX: 0, deltaY: 3 }))
  assert.ok(esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: 100, wheelDeltaY: -120 }))
  assert.ok(esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: -120, wheelDeltaY: 120 }))
})

test('mouse con desplazamiento suave (deltaY no redondo) sigue siendo mouse', () => {
  assert.ok(esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: 33.33, wheelDeltaY: -120 }))
})

test('trackpad: deltas pequeños, fraccionarios o con componente horizontal', () => {
  assert.ok(!esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: 4.5, wheelDeltaY: -13 }))
  assert.ok(!esRuedaDeMouse({ deltaMode: 0, deltaX: 2, deltaY: 30, wheelDeltaY: -36 }))
  assert.ok(!esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: 12, wheelDeltaY: -15 }))
})

test('pellizco del trackpad (ctrlKey) nunca es mouse', () => {
  assert.ok(!esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: 100, wheelDeltaY: -120, ctrlKey: true }))
})

test('el detector no cambia de opinión a mitad de un gesto', () => {
  let t = 0
  const det = crearDetectorRueda(() => t)
  assert.equal(det({ deltaMode: 0, deltaX: 0, deltaY: 4, wheelDeltaY: -5 }), 'trackpad')
  t = 100
  assert.equal(det({ deltaMode: 0, deltaX: 0, deltaY: 120, wheelDeltaY: -120 }), 'trackpad')
  t = 700
  assert.equal(det({ deltaMode: 0, deltaX: 0, deltaY: 120, wheelDeltaY: -120 }), 'mouse')
})
