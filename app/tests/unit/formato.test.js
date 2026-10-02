// app/tests/unit/formato.test.js — negrita, cursiva, subrayado y resaltado (src/lib/formato.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tramos, tieneFormato, sinFormato, variante, envolverConFormato, alternarMarca } from '../../src/lib/formato.js'

const solo = r => r.map(s => [s.t, (s.b ? 'b' : '') + (s.i ? 'i' : '') + (s.u ? 'u' : '') + (s.h ? 'h' : '')])

test('tramos: negrita, cursiva, subrayado, resaltado y combinados', () => {
  assert.deepEqual(solo(tramos('Una **idea** y *otra* con __raya__ y ==luz==')), [
    ['Una ', ''], ['idea', 'b'], [' y ', ''], ['otra', 'i'], [' con ', ''], ['raya', 'u'], [' y ', ''], ['luz', 'h']])
  assert.deepEqual(solo(tramos('**negrita *y cursiva***')), [['negrita ', 'b'], ['y cursiva', 'bi']])
})

test('una marca sin pareja se deja tal cual', () => {
  assert.deepEqual(solo(tramos('5 * 3 = 15')), [['5 * 3 = 15', '']])
  assert.deepEqual(solo(tramos('**abierta sin cerrar')), [['**abierta sin cerrar', '']])
  assert.equal(tieneFormato('5 * 3'), false)
  assert.equal(tieneFormato('una **idea**'), true)
})

test('sin formato: quita solo las marcas con pareja', () => {
  assert.equal(sinFormato('**Deriva** máxima\n==0.007== y 5 * 3'), 'Deriva máxima\n0.007 y 5 * 3')
})

test('variante de fuente en negrita y cursiva', () => {
  assert.equal(variante('400 12px "Work Sans"', true, false), '700 12px "Work Sans"')
  assert.equal(variante('400 12px "Work Sans"', false, true), 'italic 400 12px "Work Sans"')
  assert.equal(variante('italic 400 12px X', true, false), 'italic 700 12px X')
  assert.equal(variante('600 13px Fraunces', false, false), '600 13px Fraunces')
})

test('envolver con formato: parte en renglones y ubica cada tramo', () => {
  const medir = (t, f) => t.length * (f.startsWith('700') ? 8 : 6) // negrita más ancha
  const r = envolverConFormato('uno **dos** tres cuatro', '400 12px X', 60, 9, medir)
  assert.deepEqual(r.map(l => l.texto), ['uno dos', 'tres', 'cuatro'])
  assert.deepEqual(r[0].tramos.map(s => [s.t, s.b, s.x, s.w]), [['uno ', false, 0, 24], ['dos', true, 24, 24]])
  const corto = envolverConFormato('a b c d e f', '400 12px X', 12, 2, medir)
  assert.equal(corto.length, 2)
  assert.ok(corto[1].texto.endsWith('…'))
})

test('alternar una marca sobre lo seleccionado (poner y quitar)', () => {
  const v = 'una idea clave'
  const p = alternarMarca(v, 4, 8, 'b')
  assert.deepEqual(p, { valor: 'una **idea** clave', inicio: 6, fin: 10 })
  assert.deepEqual(alternarMarca(p.valor, p.inicio, p.fin, 'b'), { valor: v, inicio: 4, fin: 8 })
  // Seleccionando también las marcas.
  assert.deepEqual(alternarMarca('una ==idea== clave', 4, 12, 'h'), { valor: 'una idea clave', inicio: 4, fin: 8 })
  // Los espacios de los bordes quedan fuera.
  assert.equal(alternarMarca('una idea clave', 3, 9, 'u').valor, 'una __idea__ clave')
  // Sin selección: el cursor queda entre las marcas.
  assert.deepEqual(alternarMarca('ab', 1, 1, 'i'), { valor: 'a**b', inicio: 2, fin: 2 })
})
