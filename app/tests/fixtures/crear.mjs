// Genera los documentos de prueba (sin derechos de terceros): paper.pdf (2 páginas, con texto
// seleccionable, la palabra "rework" y una sección References) y paper.html.
// Uso: node tests/fixtures/crear.mjs   (lo llama tests/e2e/todas.mjs si faltan)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))

const PAG1 = [
  ['REWORK IN HIGHWAY PROJECTS: A TEST PAPER', 16],
  ['Canvas de Citas test fixture - not a real publication', 10],
  ['Abstract. There is limited systematic knowledge available about the dynamics of rework in', 10],
  ['highway projects, despite the fact that they frequently exceed budget and schedule by more', 10],
  ['than 10%. A case study of a highway project, which experienced a significant cost overrun', 10],
  ['as a result of rework, is examined and the causal factors that contributed to it are determined.', 10],
  ['Keywords: highway projects, rework, system dynamics.', 10],
  ['1. Introduction', 12],
  ['The highway transport sector represents a large share of public spending. Cost overruns in', 10],
  ['transportation infrastructure projects, such as highways, have been identified as being', 10],
  ['attributable to errors and the subsequent rework that often occurs during construction works.', 10]
]
const PAG2 = [
  ['2. Research approach', 12],
  ['With this in mind, the causal nature of rework that arose in eight highway projects is examined.', 10],
  ['The findings are used to develop an influence diagram, based on the concept of system dynamics,', 10],
  ['to determine the interrelationships between variables that contributed to rework as well as', 10],
  ['time and cost overruns experienced. The developed model will enhance understanding about rework.', 10],
  ['References', 12],
  ['Alessandri, T.; Ford, D.; Lander, D. 2004. Managing risk and uncertainty in complex capital', 9],
  ['projects, The Quarterly review of economics and finance 44(5): 751-767. http://dx.doi.org/10.1016/j.qref.2004.05.010', 9],
  ['Burati, J. L.; Farrington, J. J.; Ledbetter, W. B. 1992. Causes of quality deviations in design and', 9],
  ['construction, Journal of Construction Engineering and Management 118(1): 34-49.', 9],
  ['Cooper, K. G. 1993. The rework cycle: benchmarking for the project manager, Project Management', 9],
  ['Journal 24(1): 17-22.', 9],
  ['Love, P. E. D.; Li, H. 2000. Quantifying the causes and costs of rework in construction,', 9],
  ['Construction Management and Economics 18(4): 479-490. http://dx.doi.org/10.1080/01446190050024897', 9],
  ['Hwang, B.; Thomas, S. R.; Haas, C. T.; Caldas, C. H. 2009. Measuring the impact of rework on', 9],
  ['construction cost performance, Journal of Construction Engineering and Management 135(3): 187-198.', 9],
  ['Fayek, A. R. 2004. Developing a standard methodology for measuring and classifying construction', 9],
  ['field rework, Canadian Journal of Civil Engineering 31(6): 1077-1089.', 9]
]

const esc = t => t.replace(/[\\()]/g, m => '\\' + m)
function contenido(lineas) {
  let y = 790, s = 'BT\n'
  for (const [t, tam] of lineas) {
    y -= tam * 1.9
    s += `/F1 ${tam} Tf 1 0 0 1 60 ${y} Tm (${esc(t)}) Tj\n`
  }
  return s + 'ET\n'
}

function pdf() {
  const objs = []
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>'
  const c1 = contenido(PAG1), c2 = contenido(PAG2)
  objs[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>'
  objs[4] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>'
  objs[5] = `<< /Length ${Buffer.byteLength(c1)} >>\nstream\n${c1}endstream`
  objs[6] = `<< /Length ${Buffer.byteLength(c2)} >>\nstream\n${c2}endstream`
  objs[7] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  let out = '%PDF-1.4\n', offs = []
  for (let i = 1; i < objs.length; i++) { offs[i] = Buffer.byteLength(out); out += `${i} 0 obj\n${objs[i]}\nendobj\n` }
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offs.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}

const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Documento de prueba</title></head><body>
<h1>Asistentes de IA en la gestión de proyectos (documento de prueba)</h1>
<p>Este documento existe solo para las pruebas automáticas de Canvas de Citas.</p>
<h2>Introducción</h2>
<p>El sector de la construcción enfrenta desafíos persistentes de coordinación deficiente, comunicación ineficaz y decisiones subóptimas que derivan en demoras y sobrecostos en los proyectos de infraestructura.</p>
<p>Frente a este panorama, las herramientas basadas en inteligencia artificial conversacional se exploran como soluciones prácticas para mejorar la colaboración y la toma de decisiones en obra, en particular en la gestión de consultas técnicas y órdenes de cambio.</p>
<p>Los autores identifican un vacío en la literatura sobre qué competencias gerenciales se fortalecen con asistentes de IA y cómo varía esa percepción entre profesionales y estudiantes de ingeniería civil.</p>
<p>La metodología combinó revisión sistemática, un cuestionario a profesionales del sector y análisis estadístico de las respuestas para priorizar competencias.</p>
<h2>References</h2>
<p>Davis, F. D. (1989). Perceived usefulness, perceived ease of use, and user acceptance of information technology. MIS Quarterly, 13(3), 319–340. https://doi.org/10.2307/249008</p>
<p>Love, P. E. D., &amp; Li, H. (2000). Quantifying the causes and costs of rework in construction. Construction Management and Economics, 18(4), 479–490.</p>
</body></html>
`

fs.writeFileSync(path.join(dir, 'paper.pdf'), pdf(), 'latin1')
fs.writeFileSync(path.join(dir, 'paper.html'), html, 'utf8')
console.log('Documentos de prueba creados en', dir)
