// Pruebas de la extracción de bibliografía (src/lib/referencias-texto.js).
// Ejecutar: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { separarReferencias, doiDe, analizarReferencia } from '../../src/lib/referencias-texto.js'

const PAPER = `
Introduction
Rework is a major cause of cost overruns (Love & Li 2000).

References
Alessandri, T.; Ford, D.; Lander, D. 2004. Managing risk and uncertainty in complex capital projects, The Quarterly review of economics and finance 44(5): 751–767. http://dx.doi.org/10.1016/j.qref.2004.05.010 Barber, P.; Sheath, D.; Tomkins, C.; Graves, A. 2000. The cost of quality failures in major civil engineering projects, International Journal of Quality and Reliability Management 17(4/5): 479–492.
Burati, J. L.; Farrington, J. J.; Ledbetter, W. B. 1992. Causes of quality deviations in design and construction, Journal of Construction Engineering and Management 118(1): 34– 49. http://dx.doi.org/10.1061/(ASCE)0733- 9364(1992)118:1(34)
Cooper, K. G. 1993. The rework cycle: benchmarking for the project manager, Project Management Journal 24(1): 17–22.
`

test('separa las entradas aunque vengan pegadas tras un enlace', () => {
  const refs = separarReferencias(PAPER)
  assert.equal(refs.length, 4)
  assert.match(refs[0], /^Alessandri/)
  assert.match(refs[1], /^Barber/)
  assert.match(refs[3], /^Cooper/)
})

test('repara DOI cortados por un salto de línea y conserva sus paréntesis', () => {
  const refs = separarReferencias(PAPER)
  assert.equal(doiDe(refs[2]), '10.1061/(ASCE)0733-9364(1992)118:1(34)')
  assert.equal(doiDe('… 10.1016/j.qref.2004.05.010.'), '10.1016/j.qref.2004.05.010')
  assert.equal(doiDe('sin identificador'), null)
})

test('lista numerada [n]', () => {
  const texto = 'REFERENCES\n[1] Davis, F. D. (1989). Perceived usefulness. MIS Quarterly.\n[2] Brooke, J. (1996). SUS: a quick and dirty usability scale.\n[3] Doran, G. T. (1981). There is a SMART way. Management Review.\n[4] Reichheld, F. F. (2003). The one number you need to grow. HBR.\n[5] Hao, Q. (2008). Change management in construction projects.'
  const refs = separarReferencias(texto)
  assert.equal(refs.length, 5)
  assert.match(refs[1], /^\[2\] Brooke/)
})

test('sin sección de referencias devuelve lista vacía', () => {
  assert.deepEqual(separarReferencias('Un texto sin bibliografía. 2020.'), [])
})

test('datos aproximados de una referencia APA', () => {
  const r = analizarReferencia('Love, P. E. D., & Li, H. (2000). Quantifying the causes and costs of rework in construction. Construction Management and Economics, 18(4), 479–490. https://doi.org/10.1080/01446190050024897')
  assert.equal(r.anio, 2000)
  assert.equal(r.titulo, 'Quantifying the causes and costs of rework in construction')
  assert.equal(r.doi_o_url, 'https://doi.org/10.1080/01446190050024897')
  assert.ok(r.autores.length >= 2)
})
