// Papers → Markdown para que Claude los lea rápido y sin errores (el PDF sigue siendo el original
// para citar). PDF con PDFium (marcas "## Página N"), HTML con un conversor propio sin dependencias.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
let P = null
async function pdfium() {
  if (P) return P
  const { init } = await import('@embedpdf/pdfium')
  P = await init({ wasmBinary: fs.readFileSync(req.resolve('@embedpdf/pdfium/pdfium.wasm')) })
  P.PDFiumExt_Init()
  return P
}

// --- PDF ---
/** Une las líneas de una página en párrafos: quita guiones de corte y saltos dentro de frases. */
function parrafos(texto) {
  // PDFium marca con U+FFFE el guion de una palabra cortada al final de la línea.
  texto = texto.replace(/\uFFFE\s*/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  const lineas = texto.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim())
  const largos = lineas.filter(Boolean).map(l => l.length).sort((a, b) => a - b)
  const tipico = largos[Math.floor(largos.length * 0.7)] || 80
  const out = []
  let actual = ''
  for (const l of lineas) {
    if (!l) { if (actual) out.push(actual); actual = ''; continue }
    if (!actual) { actual = l; continue }
    if (/[a-záéíóúñ]-$/i.test(actual) && /^[a-záéíóúñ]/.test(l)) { actual = actual.slice(0, -1) + l; continue }
    // Fin de párrafo: línea anterior corta que termina en puntuación final.
    const corta = actual.split('\n').at(-1).length < tipico * 0.72
    if (corta && /[.:!?"”)]$/.test(actual)) { out.push(actual); actual = l; continue }
    actual += ' ' + l
  }
  if (actual) out.push(actual)
  return sinRepeticiones(out.join('\n\n'))
}

/**
 * Algunos PDF (p. ej. de JSTOR) traen capas de texto invisibles repetidas: se colapsan las frases
 * y palabras que aparecen repetidas de forma consecutiva.
 */
function sinRepeticiones(t) {
  let antes
  do {
    antes = t
    t = t.replace(/(\b[^\n]{20,300}?)(?:\s+\1)+/g, '$1').replace(/\b(\p{L}{3,})(?:\s+\1\b){2,}/gu, '$1')
  } while (t !== antes && t.length > 0)
  return t
}

/** Texto de un PDF por páginas: [{ n, texto }] (n desde 1). */
export async function textoPdf(archivo) {
  const P = await pdfium()
  const bytes = fs.readFileSync(archivo), ptr = P.pdfium.wasmExports.malloc(bytes.length)
  P.pdfium.HEAPU8.set(bytes, ptr)
  const doc = P.FPDF_LoadMemDocument(ptr, bytes.length, '')
  if (!doc) { P.pdfium.wasmExports.free(ptr); throw new Error(`No se pudo leer ${path.basename(archivo)} (error ${P.FPDF_GetLastError()})`) }
  const paginas = []
  try {
    for (let i = 0, n = P.FPDF_GetPageCount(doc); i < n; i++) {
      const page = P.FPDF_LoadPage(doc, i), tp = P.FPDFText_LoadPage(page)
      const c = P.FPDFText_CountChars(tp)
      let t = ''
      if (c > 0) {
        const buf = P.pdfium.wasmExports.malloc((c + 1) * 2)
        P.FPDFText_GetText(tp, 0, c, buf)
        t = P.pdfium.UTF16ToString(buf)
        P.pdfium.wasmExports.free(buf)
      }
      P.FPDFText_ClosePage(tp)
      P.FPDF_ClosePage(page)
      paginas.push({ n: i + 1, texto: parrafos(t) })
    }
  } finally {
    P.FPDF_CloseDocument(doc)
    P.pdfium.wasmExports.free(ptr)
  }
  return paginas
}

// --- HTML ---
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' }
const entidades = t => t.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)

export function htmlAMarkdown(html) {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|script|style|noscript|svg|nav|footer|button|form)[\s\S]*?<\/\1>/gi, '')
  const enLinea = t => entidades(t
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<a\b[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
  h = h.replace(/<table[\s\S]*?<\/table>/gi, tabla => {
    const filas = [...tabla.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(f => [...f[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => enLinea(c[1]).replace(/\|/g, '/')))
    if (!filas.length) return ''
    const cols = Math.max(...filas.map(f => f.length))
    const linea = f => `| ${[...f, ...Array(cols - f.length).fill('')].join(' | ')} |`
    return `\n\n${linea(filas[0])}\n| ${Array(cols).fill('---').join(' | ')} |\n${filas.slice(1).map(linea).join('\n')}\n\n`
  })
  h = h
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${'#'.repeat(+n)} ${enLinea(t)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${enLinea(t)}`)
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => `\n\n> ${enLinea(t)}\n\n`)
    .replace(/<(p|div|section|article|header|figcaption)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => /<(h[1-6]|li|p|div|table)/i.test(t) ? t : `\n\n${enLinea(t)}\n\n`)
    .replace(/<[^>]+>/g, '')
  return entidades(h).split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Si el PDF repite muchas oraciones (capas de texto duplicadas), deja cada oración larga una sola
 * vez en todo el documento. En PDFs normales (pocas repeticiones) no cambia nada.
 */
function deduplicar(pags) {
  const oraciones = t => t.split(/(?<=[.!?])\s+/)
  const largas = pags.flatMap(p => oraciones(p.texto)).filter(s => s.length > 40)
  if (!largas.length || new Set(largas).size / largas.length > 0.7) return pags
  const vistas = new Set()
  return Object.assign(pags.map(p => ({
    ...p,
    texto: p.texto.split('\n\n').map(par => oraciones(par).filter(s => {
      if (s.length <= 40) return true
      if (vistas.has(s)) return false
      vistas.add(s)
      return true
    }).join(' ')).filter(x => x.trim()).join('\n\n')
  })), { duplicado: true })
}

// --- Documento → Markdown ---
function cabecera(meta) {
  if (!meta) return ''
  const campos = [['titulo', meta.titulo], ['autores', (meta.autores || []).join('; ')], ['anio', meta.anio], ['doi_o_url', meta.doi_o_url], ['fuente', meta.id], ['archivo_original', meta.archivo]]
  return `---\n${campos.filter(([, v]) => v).map(([k, v]) => `${k}: ${JSON.stringify(String(v))}`).join('\n')}\n---\n\n`
}

/** Convierte un PDF/HTML/MD a Markdown. `meta` (opcional): datos de la fuente para la cabecera. */
export async function aMarkdown(archivo, meta = null) {
  const ext = path.extname(archivo).toLowerCase()
  const m = meta && { ...meta, archivo: path.basename(archivo) }
  if (ext === '.pdf') {
    const pags = deduplicar(await textoPdf(archivo))
    const vacias = pags.filter(p => !p.texto.trim()).length
    const aviso = (vacias === pags.length ? '> Este PDF no tiene texto (parece escaneado): haría falta OCR.\n\n' : vacias ? `> ${vacias} de ${pags.length} páginas sin texto (imágenes o escaneos).\n\n` : '')
      + (pags.duplicado ? '> Aviso: este PDF traía capas de texto duplicadas (típico de escaneos de JSTOR). Se limpiaron, pero el texto puede no corresponder a la página indicada: verifica la página en el PDF antes de citar.\n\n' : '')
    const titulo = meta?.titulo ? `# ${meta.titulo}\n\n` : ''
    return cabecera(m) + titulo + aviso + pags.map(p => `## Página ${p.n}\n\n${p.texto}`).join('\n\n') + '\n'
  }
  if (ext === '.html' || ext === '.htm') return cabecera(m) + htmlAMarkdown(fs.readFileSync(archivo, 'utf8')) + '\n'
  return cabecera(m) + fs.readFileSync(archivo, 'utf8')
}
