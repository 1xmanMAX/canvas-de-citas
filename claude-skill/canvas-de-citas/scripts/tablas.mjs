// Copia de app/src/lib/tablas.js (mantener iguales): tablas desde HTML, Markdown o texto con tabulaciones.
// Tarjeta: { id, titulo?, filas: [['celda', …], …], encabezado?: true (primera fila en negrita), x, y, … }

export const MAX_FILAS = 200
export const MAX_COLUMNAS = 30

export const tablaVacia = () => [['', '', ''], ['', '', ''], ['', '', '']]

/** Rellena las filas a un mismo ancho, quita filas y columnas vacías del final y pone un tope. */
export function normalizarTabla(filas) {
  let f = (filas || []).slice(0, MAX_FILAS).map(r => (r || []).slice(0, MAX_COLUMNAS).map(c => String(c ?? '').replace(/\r/g, '').trim()))
  while (f.length && f.at(-1).every(c => !c)) f.pop()
  const n = Math.max(0, ...f.map(r => r.length))
  f = f.map(r => [...r, ...Array(n - r.length).fill('')])
  let m = n
  while (m > 0 && f.every(r => !r[m - 1])) m--
  return f.map(r => r.slice(0, m))
}

const ENTIDADES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodificar = t => t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(n) ? String.fromCodePoint(n) : m
  }
  return ENTIDADES[e.toLowerCase()] ?? m
})
const textoCelda = h => decodificar(h
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li)>/gi, '\n')
  .replace(/<[^>]+>/g, ''))
  .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim()

/** Primera <table> de un HTML (Excel, Word, Google Sheets, páginas web). */
export function tablaDesdeHtml(html) {
  const t = /<table\b[\s\S]*?<\/table>/i.exec(html || '')
  if (!t) return null
  const filas = []
  let encabezado = false
  for (const [, tr] of t[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const fila = []
    for (const [, tag, attrs, contenido] of tr.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      if (!filas.length && tag.toLowerCase() === 'th') encabezado = true
      fila.push(textoCelda(contenido))
      const span = +(/colspan\s*=\s*["']?(\d+)/i.exec(attrs)?.[1] || 1)
      for (let i = 1; i < Math.min(span, MAX_COLUMNAS); i++) fila.push('')
    }
    filas.push(fila)
  }
  if (!encabezado && /<thead\b/i.test(t[0])) encabezado = true
  return resultado(filas, encabezado)
}

/** Tabla en Markdown (| a | b | con la línea |---|) o texto separado por tabulaciones (Excel, Sheets). */
export function tablaDesdeTexto(texto) {
  const t = String(texto || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  if (!t.trim()) return null
  const lineas = t.split('\n')
  if (lineas.length > 1 && lineas[0].includes('|') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lineas[1])) {
    const celdas = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim())
    const filas = [celdas(lineas[0]), ...lineas.slice(2).filter(l => l.includes('|')).map(celdas)]
    return resultado(filas, true)
  }
  if (!t.includes('\t')) return null
  return resultado(tsv(t), false)
}

// Texto con tabulaciones; las celdas con saltos de línea vienen entre comillas (así copia Excel).
function tsv(t) {
  const filas = [[]]
  let celda = '', i = 0
  while (i < t.length) {
    const ch = t[i]
    if (ch === '"' && celda === '') {
      let j = i + 1, s = ''
      for (; j < t.length; j++) {
        if (t[j] === '"' && t[j + 1] === '"') { s += '"'; j++ }
        else if (t[j] === '"') break
        else s += t[j]
      }
      if (j < t.length && (j + 1 === t.length || t[j + 1] === '\t' || t[j + 1] === '\n')) { celda = s; i = j + 1; continue }
    }
    if (ch === '\t') { filas.at(-1).push(celda); celda = '' }
    else if (ch === '\n') { filas.at(-1).push(celda); celda = ''; filas.push([]) }
    else celda += ch
    i++
  }
  filas.at(-1).push(celda)
  return filas
}

function resultado(filas, encabezado) {
  const f = normalizarTabla(filas)
  if (!f.length || f.length * (f[0]?.length || 0) < 2) return null
  return { filas: f, encabezado }
}

/** Lo que haya en el portapapeles: primero el HTML (conserva mejor las celdas) y si no, el texto. */
export const tablaDelPortapapeles = (html, texto) => tablaDesdeHtml(html) || tablaDesdeTexto(texto)

/** Texto con tabulaciones (para copiar la tabla y pegarla en Excel o Word). */
export const tablaATexto = filas => (filas || []).map(r => r.map(c => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t')).join('\n')

/** Pega `nuevas` dentro de `filas` desde la celda (fila, col), agrandando la tabla si hace falta. */
export function pegarEn(filas, fila, col, nuevas) {
  const out = filas.map(r => [...r])
  const ancho = Math.min(MAX_COLUMNAS, Math.max(out[0]?.length || 0, col + Math.max(...nuevas.map(r => r.length))))
  nuevas.forEach((r, i) => {
    const y = fila + i
    if (y >= MAX_FILAS) return
    while (out.length <= y) out.push(Array(ancho).fill(''))
    r.forEach((c, j) => { if (col + j < MAX_COLUMNAS) out[y][col + j] = c })
  })
  return out.map(r => [...r, ...Array(Math.max(0, ancho - r.length)).fill('')])
}
