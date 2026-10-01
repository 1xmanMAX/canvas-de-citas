// app/tests/unit/tablas.test.js — tablas desde el portapapeles (src/lib/tablas.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tablaDesdeHtml, tablaDesdeTexto, tablaDelPortapapeles, normalizarTabla, tablaATexto, pegarEn } from '../../src/lib/tablas.js'

test('HTML de Excel: celdas, entidades, colspan y sin estilos', () => {
  const html = `<html><head><style>td{mso-number-format:"\\@"}</style></head><body><!--StartFragment--><table>
    <tr><td class=xl65>Autor</td><td>Año&nbsp;</td><td>Deriva &lt;2%</td><td>x</td></tr>
    <tr><td>Priestley</td><td>2007</td><td colspan=2>sí</td></tr></table><!--EndFragment--></body></html>`
  assert.deepEqual(tablaDesdeHtml(html), { filas: [['Autor', 'Año', 'Deriva <2%', 'x'], ['Priestley', '2007', 'sí', '']], encabezado: false })
})

test('HTML con <th> o <thead>: primera fila como encabezado; <br> es salto de línea', () => {
  const t = tablaDesdeHtml('<table><thead><tr><th>A</th><th>B</th></tr></thead><tr><td>uno<br>dos</td><td><p>x</p></td></tr></table>')
  assert.equal(t.encabezado, true)
  assert.deepEqual(t.filas, [['A', 'B'], ['uno\ndos', 'x']])
})

test('Markdown con |---|', () => {
  const t = tablaDesdeTexto('| Norma | País |\n|---|:--:|\n| E.030 | Perú |\n| ASCE 7 | EE. UU. |\n')
  assert.deepEqual(t, { filas: [['Norma', 'País'], ['E.030', 'Perú'], ['ASCE 7', 'EE. UU.']], encabezado: true })
})

test('texto con tabulaciones (Excel/Sheets), celdas entre comillas con saltos', () => {
  const t = tablaDesdeTexto('a\tb\r\n"línea 1\nlínea 2"\t"dice ""hola"""\r\n')
  assert.deepEqual(t.filas, [['a', 'b'], ['línea 1\nlínea 2', 'dice "hola"']])
})

test('texto normal no es tabla; una sola celda tampoco', () => {
  assert.equal(tablaDesdeTexto('Una idea suelta\ncon dos líneas'), null)
  assert.equal(tablaDesdeTexto('a | b sin separador'), null)
  assert.equal(tablaDesdeHtml('<p>hola</p>'), null)
  assert.equal(tablaDesdeHtml('<table><tr><td>x</td></tr></table>'), null)
  assert.equal(tablaDelPortapapeles('', 'solo texto'), null)
})

test('prefiere el HTML y si no hay tabla usa el texto', () => {
  assert.deepEqual(tablaDelPortapapeles('<b>x</b>', 'a\tb').filas, [['a', 'b']])
  assert.deepEqual(tablaDelPortapapeles('<table><tr><td>h1</td><td>h2</td></tr></table>', 'otra\tcosa').filas, [['h1', 'h2']])
})

test('normalizar: rellena y quita filas/columnas vacías del final', () => {
  assert.deepEqual(normalizarTabla([['a', '', ''], ['b'], ['', ''], []]), [['a'], ['b']])
})

test('copiar como texto y pegar dentro de una tabla', () => {
  assert.equal(tablaATexto([['a', 'b\tc'], ['"x"', '']]), 'a\t"b\tc"\n"""x"""\t')
  assert.deepEqual(pegarEn([['1', '2'], ['3', '4']], 1, 1, [['x', 'y'], ['z', 'w']]), [['1', '2', ''], ['3', 'x', 'y'], ['', 'z', 'w']])
})

// --- Fusiones, colores, insertar y quitar ---
import { fusionar, separar, pintar, insertarFila, insertarColumna, quitarFila, quitarColumna, limpiarTabla, ampliar, mapaFusiones, rango } from '../../src/lib/tablas.js'
const T = () => ({ filas: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']] })

test('fusionar junta los textos en la primera celda y vacía las demás', () => {
  const r = fusionar(T(), rango({ f: 0, c: 0 }, { f: 1, c: 1 }))
  assert.deepEqual(r.filas, [['a\nb\nd\ne', '', 'c'], ['', '', 'f'], ['g', 'h', 'i']])
  assert.deepEqual(r.fusiones, [{ fila: 0, col: 0, filas: 2, cols: 2 }])
  const cubre = mapaFusiones(r)
  assert.equal(cubre(1, 1).fila, 0); assert.equal(cubre(2, 2), null)
})

test('un rango que toca una combinada se amplía hasta abarcarla; fusionar dos combinadas las une', () => {
  const t = { ...T(), fusiones: [{ fila: 0, col: 0, filas: 2, cols: 1 }] }
  assert.deepEqual(ampliar(t, rango({ f: 1, c: 0 }, { f: 1, c: 1 })), { f1: 0, c1: 0, f2: 1, c2: 1 })
  const r = fusionar({ ...t, fusiones: [...t.fusiones, { fila: 1, col: 1, filas: 2, cols: 2 }] }, rango({ f: 0, c: 0 }, { f: 0, c: 1 }))
  assert.deepEqual(r.fusiones, [{ fila: 0, col: 0, filas: 3, cols: 3 }])
})

test('separar quita la combinada y pintar colorea (en la combinada, su esquina)', () => {
  const f = fusionar(T(), rango({ f: 0, c: 0 }, { f: 0, c: 1 }))
  assert.deepEqual(separar(f, rango({ f: 0, c: 1 })).fusiones, [])
  const p = pintar(f, rango({ f: 0, c: 1 }, { f: 1, c: 1 }), 'verde')
  assert.deepEqual(p.colores, { '0,0': 'verde', '1,0': 'verde', '1,1': 'verde' })
  assert.deepEqual(pintar(p, rango({ f: 1, c: 0 }), null).colores, { '0,0': 'verde', '1,1': 'verde' })
})

test('insertar y quitar filas/columnas mueve colores y combinadas', () => {
  const t = { ...T(), fusiones: [{ fila: 1, col: 0, filas: 2, cols: 1 }], colores: { '1,0': 'rosa', '0,2': 'gris' } }
  const a = insertarFila(t, 2) // dentro de la combinada: la agranda
  assert.equal(a.filas.length, 4)
  assert.deepEqual(a.fusiones, [{ fila: 1, col: 0, filas: 3, cols: 1 }])
  const b = insertarColumna(t, 0)
  assert.deepEqual(b.fusiones, [{ fila: 1, col: 1, filas: 2, cols: 1 }])
  assert.deepEqual(b.colores, { '1,1': 'rosa', '0,3': 'gris' })
  assert.deepEqual(b.filas[0], ['', 'a', 'b', 'c'])
  // Quitar la primera fila de la combinada: su texto y color bajan.
  const c = quitarFila(t, 1)
  assert.deepEqual(c.filas, [['a', 'b', 'c'], ['d', 'h', 'i']])
  assert.deepEqual(c.fusiones, [])
  assert.deepEqual(c.colores, { '1,0': 'rosa', '0,2': 'gris' })
  const d = quitarColumna(t, 2)
  assert.deepEqual(d.colores, { '1,0': 'rosa' })
  assert.deepEqual(d.filas, [['a', 'b'], ['d', 'e'], ['g', 'h']])
})

test('no se quita la última fila ni la última columna', () => {
  assert.deepEqual(quitarFila({ filas: [['x', 'y']] }, 0).filas, [['x', 'y']])
  assert.deepEqual(quitarColumna({ filas: [['x'], ['y']] }, 0).filas, [['x'], ['y']])
})

test('limpiar conserva filas vacías pintadas o combinadas y quita colores desconocidos', () => {
  const t = { filas: [['a', ''], ['', ''], ['', '']], colores: { '1,1': 'amarillo', '0,0': 'neon' } }
  assert.deepEqual(limpiarTabla(t), { filas: [['a', ''], ['', '']], fusiones: [], colores: { '1,1': 'amarillo' } })
  assert.deepEqual(limpiarTabla({ filas: [['', ''], ['', '']] }).filas, [['']])
})
