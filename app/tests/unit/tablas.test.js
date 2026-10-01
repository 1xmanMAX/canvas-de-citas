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
