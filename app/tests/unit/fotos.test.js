// app/tests/unit/fotos.test.js — tarjeta de foto (src/lib/medidas-foto.js) y original en alta (src/lib/imagen.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cajaFoto } from '../../src/lib/medidas-foto.js'

const foto = (x = {}) => ({ id: 'f' + Math.random(), titulo: '', texto: '', anotacion: '', imagen: 'data:', proporcion: 4 / 3, trazos: [], ...x })

test('la imagen conserva su proporción (no se recorta)', () => {
  for (const proporcion of [5, 16 / 9, 4 / 3, 1, 0.75, 0.25]) {
    const d = cajaFoto(foto({ proporcion }))
    assert.ok(Math.abs(d.iw / d.ih - proporcion) < 0.03, `${proporcion}: ${d.iw}×${d.ih}`)
  }
})

test('una foto muy alta no queda gigante por defecto', () => {
  const d = cajaFoto(foto({ proporcion: 0.25 }))
  assert.ok(d.ih <= 480, `${d.ih}`)
  assert.ok(d.w >= 120)
})

test('el ancho elegido se respeta dentro de 120–900', () => {
  assert.equal(cajaFoto(foto({ ancho: 500 })).w, 500)
  assert.equal(cajaFoto(foto({ ancho: 50 })).w, 120)
  assert.equal(cajaFoto(foto({ ancho: 5000 })).w, 900)
})

import { tamanoOriginal } from '../../src/lib/imagen.js'

test('fotos normales se guardan tal cual', () => {
  assert.deepEqual(tamanoOriginal(4000, 3000, 3e6), { reducir: false, ancho: 4000, alto: 3000 })
})

test('fotos enormes se reducen a 4096 px de lado mayor', () => {
  assert.deepEqual(tamanoOriginal(8000, 6000, 20e6), { reducir: true, ancho: 4096, alto: 3072 })
  assert.deepEqual(tamanoOriginal(3000, 9000, 16e6), { reducir: true, ancho: 1365, alto: 4096 })
})
