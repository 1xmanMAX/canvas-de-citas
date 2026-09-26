// app/tests/unit/vista.test.js — matemática del visor de fotos (src/lib/vista.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ajustar, zoomEn, aImagen } from '../../src/lib/vista.js'

test('ajustar centra la imagen entera', () => {
  const v = ajustar(4000, 2000, 1000, 800, 0)
  assert.equal(v.k, 0.25)
  assert.equal(v.tx, 0)
  assert.equal(v.ty, 150)
})

test('zoomEn deja quieto el punto bajo el cursor', () => {
  const v = { k: 0.5, tx: 10, ty: 20 }
  const antes = { x: (300 - v.tx) / v.k, y: (200 - v.ty) / v.k }
  const n = zoomEn(v, 2, 300, 200, 0.1, 8)
  assert.equal(n.k, 1)
  assert.deepEqual({ x: (300 - n.tx) / n.k, y: (200 - n.ty) / n.k }, antes)
})

test('zoomEn respeta los límites', () => {
  assert.equal(zoomEn({ k: 7, tx: 0, ty: 0 }, 4, 0, 0, 0.1, 8).k, 8)
  assert.equal(zoomEn({ k: 0.2, tx: 0, ty: 0 }, 0.1, 0, 0, 0.1, 8).k, 0.1)
})

test('aImagen convierte a 0–1000 y recorta fuera de la imagen', () => {
  const v = { k: 0.5, tx: 100, ty: 50 }
  assert.deepEqual(aImagen(v, 100, 50, 2000, 1000), [0, 0])
  assert.deepEqual(aImagen(v, 1100, 550, 2000, 1000), [1000, 1000])
  assert.deepEqual(aImagen(v, 600, 300, 2000, 1000), [500, 500])
  assert.deepEqual(aImagen(v, 5000, -40, 2000, 1000), [1000, 0])
})
