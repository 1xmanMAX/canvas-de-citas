// Bibliografía citada por un paper: se extrae del documento adjunto (PDF con PDFium en un hilo
// aparte, HTML o Markdown) y se guarda en caché local. Misma heurística que la skill de Claude
// Code (canvas.mjs referencias).
import { S, guardarFuente, vincularFuente, guardarProyecto, leerDocumento, leerMeta, ponerMeta } from './store.svelte.js'
import { tipoDe } from './visor.svelte.js'

import { separarReferencias, doiDe, analizarReferencia } from './referencias-texto.js'
export { separarReferencias, doiDe, analizarReferencia }

/** Completa con CrossRef si hay DOI e internet (hasta 5 s); si no, devuelve lo que había. */
export async function completarConCrossref(datos) {
  const doi = doiDe(datos.doi_o_url || '')
  if (!doi || !navigator.onLine) return datos
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return datos
    const m = (await r.json()).message
    return {
      ...datos,
      titulo: m.title?.[0] || datos.titulo,
      anio: m.issued?.['date-parts']?.[0]?.[0] || datos.anio,
      revista_o_editorial: m['container-title']?.[0] || m.publisher || datos.revista_o_editorial,
      autores: (m.author || []).map(x => x.family ? `${x.family}, ${(x.given || '').split(/[\s-]+/).filter(Boolean).map(g => g[0].toUpperCase() + '.').join(' ')}` : x.name).filter(Boolean),
      tipo_fuente: m.type === 'book' ? 'libro' : m.type === 'book-chapter' ? 'capitulo_libro' : 'articulo_cientifico',
      estado_verificacion: 'verificado',
      fuente_verificacion: 'CrossRef'
    }
  } catch { return datos }
}

// --- Texto del documento ---
function textoPdf(blob) {
  return new Promise((res, rej) => {
    const w = new Worker(new URL('./pdf.worker.js', import.meta.url), { type: 'module' })
    const doc = Math.random()
    const fin = (f, v) => { w.terminate(); f(v) }
    w.onmessage = ({ data: m }) => {
      if (m.tipo === 'abierto') w.postMessage({ tipo: 'textoCompleto', doc })
      else if (m.tipo === 'textoCompleto') fin(res, m.paginas.join('\n'))
      else if (m.tipo === 'error') fin(rej, new Error(m.mensaje))
    }
    blob.arrayBuffer().then(buffer => w.postMessage({ tipo: 'abrir', doc, buffer }, [buffer]))
  })
}

function textoHtml(html) {
  const d = new DOMParser().parseFromString(html, 'text/html')
  d.querySelectorAll('script, style, nav, header nav').forEach(n => n.remove())
  // Cada bloque en su línea, para reconocer el título "References".
  d.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, div, br, tr').forEach(n => n.append('\n'))
  return d.body?.textContent || ''
}

/**
 * Referencias del documento de una fuente: { refs: [texto], origen } o { refs: [], error }.
 * Se cachea por fuente y documento (nombre + tamaño) para no volver a extraer.
 */
export async function referenciasDe(fuente) {
  const d = await leerDocumento(fuente.id)
  if (!d?.blob) return { refs: [], error: 'sin-documento' }
  const clave = `refs:${fuente.id}`, firma = `${d.nombre}:${d.blob.size}`
  const cache = await leerMeta(clave)
  if (cache?.firma === firma) return { refs: cache.refs }
  const tipo = tipoDe(fuente.documento_nombre || d.nombre, d.blob.type)
  const texto = tipo === 'pdf' ? await textoPdf(d.blob) : tipo === 'html' ? textoHtml(await d.blob.text()) : await d.blob.text()
  const refs = separarReferencias(texto)
  await ponerMeta(clave, { firma, refs })
  return { refs }
}

// --- Conectar una referencia con el paper que la cita ---

const normal = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Fuente de la biblioteca que corresponde a una referencia (por DOI o por título), o null. */
export function enBiblioteca(ref, excluir) {
  const doi = doiDe(ref)?.toLowerCase(), t = normal(ref)
  return S.fuentes.find(f => f.id !== excluir && (
    (doi && (f.doi_o_url || '').toLowerCase().includes(doi)) ||
    (normal(f.titulo).length > 24 && t.includes(normal(f.titulo)))
  )) || null
}

/** "paper cita a ref": en ambas fichas, en los proyectos del paper y como hilo en su lienzo. */
export function conectarReferencia(paper, ref) {
  ref.citada_en = [...new Set([...(ref.citada_en || []), paper.id])]
  guardarFuente(ref)
  paper.referencias_citadas = [...new Set([...(paper.referencias_citadas || []), ref.id])]
  guardarFuente(paper)
  for (const pid of new Set((S.citasPorFuente.get(paper.id) || []).map(c => c.proyecto_id))) {
    vincularFuente(pid, ref.id)
    const p = S.proyectoPorId.get(pid)
    if (!p) continue
    if (!p.canvas.conexiones.some(k => k.desde === paper.id && k.hasta === ref.id))
      p.canvas.conexiones.push({ id: `con_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, desde: paper.id, hasta: ref.id, etiqueta: 'cita a' })
    guardarProyecto(p)
  }
}
