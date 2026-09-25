// app/tests/unit/agrupadores.test.js — recuadros que agrupan elementos (src/lib/agrupadores.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contiene, miembrosDe, acomodar, agregarDentro, sacar, nuevoAgrupador, accionesAgrupadores, ajustar, CAB, PAD } from '../../src/lib/agrupadores.js'

const dentroDe = (g, c) => c.x >= g.x && c.y >= g.y + CAB - 1 && c.x + c.w <= g.x + g.w && c.y + c.h <= g.y + g.h
const solapan = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

test('es miembro lo que tiene el centro dentro del recuadro', () => {
  const g = { id: 'g', x: 0, y: 0, w: 300, h: 200 }
  assert.ok(contiene(g, { x: 250, y: 150, w: 100, h: 60 })) // centro (300, 180): en el borde
  assert.ok(!contiene(g, { x: 260, y: 150, w: 100, h: 60 }))
  const els = [{ id: 'a', caja: { x: 10, y: 50, w: 50, h: 50 } }, { id: 'b', caja: { x: 900, y: 0, w: 50, h: 50 } }, { id: 'g', caja: g }]
  assert.deepEqual(miembrosDe(g, els).map(e => e.id), ['a'])
})

test('un agrupador nuevo acomoda los elementos dentro, sin que se tapen', () => {
  const cajas = [
    { id: 'f1', w: 190, h: 74 }, { id: 'f2', w: 190, h: 90 }, { id: 'n1', w: 168, h: 120 },
    { id: 'n2', w: 210, h: 200 }, { id: 'l1', w: 220, h: 150 }
  ]
  const { agrupador: g, pos } = nuevoAgrupador('  Marco teórico ', 'azul', cajas, 100, -50)
  assert.equal(g.titulo, 'Marco teórico')
  const colocadas = cajas.map(c => ({ ...c, ...pos.get(c.id) }))
  for (const c of colocadas) assert.ok(dentroDe(g, c), `${c.id} queda dentro`)
  for (let i = 0; i < colocadas.length; i++)
    for (let j = i + 1; j < colocadas.length; j++) assert.ok(!solapan(colocadas[i], colocadas[j]), `${colocadas[i].id} y ${colocadas[j].id}`)
  // Aproximadamente cuadrado, no una fila larguísima.
  assert.ok(g.w < 3 * g.h, `${g.w}×${g.h}`)
})

test('sin elementos: tamaño mínimo', () => {
  const r = acomodar([], 0, 0)
  assert.ok(r.w >= 240 && r.h >= 140)
})

test('agregar dentro: va debajo de lo que ya hay y el recuadro crece', () => {
  const g = { x: 0, y: 0, w: 300, h: 200 }
  const actuales = [{ id: 'a', x: PAD, y: CAB, w: 190, h: 100 }]
  const nuevas = [{ id: 'b', w: 190, h: 80 }, { id: 'c', w: 400, h: 80 }]
  const r = agregarDentro(g, actuales, nuevas)
  const gg = { ...g, w: r.w, h: r.h }
  const todas = [...actuales, ...nuevas.map(c => ({ ...c, ...r.pos.get(c.id) }))]
  for (const c of todas) assert.ok(dentroDe(gg, c), `${c.id} dentro`)
  for (let i = 0; i < todas.length; i++) for (let j = i + 1; j < todas.length; j++) assert.ok(!solapan(todas[i], todas[j]))
  assert.ok(r.w >= 400 + 2 * PAD)
})

test('sacar: a la derecha del recuadro, apiladas y fuera', () => {
  const g = { x: 0, y: 0, w: 300, h: 200 }
  const pos = sacar(g, [{ id: 'a', w: 100, h: 50 }, { id: 'b', w: 100, h: 50 }])
  for (const [id, p] of pos) assert.ok(!contiene(g, { ...p, w: 100, h: 50 }), id)
  assert.ok(pos.get('b').y > pos.get('a').y)
})

// Un lienzo mínimo. Como en la app, `elementos()` crea objetos nuevos en cada llamada.
function lienzoFalso(cajas) {
  const c = { agrupadores: [] }, guardados = { n: 0 }
  const els = cajas.map(k => ({ id: k.id, nombre: k.id, tipo: 'nota', caja: { ...k } }))
  const elementos = () => els.map(e => ({ ...e, poner: (x, y) => { e.caja.x = x; e.caja.y = y } }))
  const acc = accionesAgrupadores({ lienzo: () => c, elementos, guardar: () => guardados.n++ })
  return { c, els, acc, guardados, caja: id => els.find(e => e.id === id).caja }
}

test('acciones: crear, mover con sus miembros, editar y eliminar', () => {
  const { c, acc, caja, guardados } = lienzoFalso([
    { id: 'a', x: 0, y: 0, w: 100, h: 60 }, { id: 'b', x: 500, y: 500, w: 100, h: 60 }, { id: 'fuera', x: -800, y: 0, w: 100, h: 60 }
  ])
  const g = acc.crear('Marco', 'verde', ['a', 'b'], () => ({ x: 1000, y: 1000 }))
  assert.equal(c.agrupadores.length, 1)
  assert.deepEqual(acc.miembros(g).map(e => e.id).sort(), ['a', 'b'])
  // Mover el recuadro arrastra a sus miembros, no a los de fuera.
  const d = acc.arrastre(g), ax = caja('a').x
  d.inicio(); d.mover(50, -20); d.fin()
  assert.equal(g.x, 1050)
  assert.equal(caja('a').x, ax + 50)
  assert.equal(caja('fuera').x, -800)
  // Editar: sale 'b', entra 'fuera'.
  acc.editar(g, { titulo: 'Marco teórico', color: 'rojo', ids: ['a', 'fuera'] })
  assert.equal(g.titulo, 'Marco teórico')
  assert.deepEqual(acc.miembros(g).map(e => e.id).sort(), ['a', 'fuera'])
  // Eliminar deja los elementos donde están.
  const antes = { ...caja('a') }
  acc.eliminar(g)
  assert.equal(c.agrupadores.length, 0)
  assert.deepEqual(caja('a'), antes)
  assert.ok(guardados.n >= 4)
})

test('editar sin tocar la selección no mueve lo que ya está dentro', () => {
  const { acc, caja } = lienzoFalso([{ id: 'a', x: 0, y: 0, w: 100, h: 60 }, { id: 'b', x: 300, y: 0, w: 100, h: 60 }])
  const g = acc.crear('G', 'azul', ['a', 'b'], () => ({ x: 0, y: 0 }))
  const antes = [{ ...caja('a') }, { ...caja('b') }, { ...g }]
  acc.editar(g, { titulo: 'G2', color: 'azul', ids: ['a', 'b'] })
  assert.deepEqual([caja('a'), caja('b')], antes.slice(0, 2))
  assert.equal(g.w, antes[2].w)
  assert.equal(g.h, antes[2].h)
})

test('el recuadro se ajusta a su contenido cuando se mueve algo de dentro', () => {
  const { acc, els } = lienzoFalso([{ id: 'a', x: 0, y: 0, w: 100, h: 60 }, { id: 'b', x: 300, y: 0, w: 100, h: 60 }])
  const g = acc.crear('G', 'azul', ['a', 'b'], () => ({ x: 0, y: 0 }))
  const antes = acc.caja(g)
  const b = els.find(e => e.id === 'b').caja
  b.x += 150 // se mueve 'b' un poco a la derecha (sigue tocando el recuadro)
  const despues = acc.caja(g)
  assert.equal(despues.x + despues.w, b.x + b.w + PAD) // el borde derecho lo sigue
  assert.ok(despues.w > antes.w)
  assert.equal(despues.x, antes.x)
  acc.soltado('b') // sigue tocando el recuadro de antes: se queda y el recuadro se fija
  assert.deepEqual(g.miembros, ['a', 'b'])
  assert.equal(g.w, despues.w)
})

test('ajustar deja margen y la cabecera para el nombre', () => {
  assert.deepEqual(ajustar([{ x: 100, y: 100, w: 300, h: 200 }]), { x: 100 - PAD, y: 100 - CAB, w: 300 + 2 * PAD, h: 200 + CAB + PAD })
})

test('arrastrar algo lejos lo saca; soltarlo sobre otro recuadro lo mete ahí', () => {
  const { acc, els } = lienzoFalso([
    { id: 'a', x: 0, y: 0, w: 100, h: 60 }, { id: 'b', x: 200, y: 0, w: 100, h: 60 }, { id: 'c', x: 2000, y: 0, w: 100, h: 60 }
  ])
  const g1 = acc.crear('Uno', 'azul', ['a', 'b'], () => ({ x: 0, y: 0 }))
  const g2 = acc.crear('Dos', 'verde', ['c'], () => ({ x: 2000, y: 0 }))
  const b = els.find(e => e.id === 'b').caja
  // Lejos de todo: sale de g1 y no entra en nada.
  b.x = 1000; b.y = 1000
  acc.soltado('b')
  assert.deepEqual(g1.miembros, ['a'])
  // Encima de g2: entra en g2.
  const c2 = acc.caja(g2)
  b.x = c2.x + 20; b.y = c2.y + CAB
  acc.soltado('b')
  assert.deepEqual(g2.miembros.sort(), ['b', 'c'])
  assert.deepEqual(g1.miembros, ['a'])
})

test('un agrupador de la versión anterior (sin lista de miembros) adopta lo que tiene dentro', () => {
  const { c, acc } = lienzoFalso([{ id: 'a', x: 20, y: 60, w: 100, h: 60 }, { id: 'lejos', x: 900, y: 900, w: 100, h: 60 }])
  c.agrupadores.push({ id: 'g', titulo: 'Viejo', color: 'azul', x: 0, y: 0, w: 400, h: 300 })
  acc.fijar()
  assert.deepEqual(c.agrupadores[0].miembros, ['a'])
})
