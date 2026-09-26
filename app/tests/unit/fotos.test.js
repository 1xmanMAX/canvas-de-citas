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
