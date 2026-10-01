// Copia de app/src/lib/tablas.js (mantener iguales): tablas desde HTML, Markdown o texto con tabulaciones.
// Tarjeta: { id, titulo?, filas: [["celda", …], …], encabezado?: true (primera fila en negrita), fusiones?, colores?, x, y, … }

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

// --- Fusiones y colores ---
// Campos opcionales de la tarjeta:
//   fusiones: [{ fila, col, filas, cols }]  celda combinada; su texto vive en (fila, col)
//   colores:  { 'fila,col': 'amarillo' }     fondo de la celda (en una combinada, en su esquina)
// Las operaciones no modifican la tabla: devuelven { filas, fusiones, colores } para asignarlo.

export const COLORES_CELDA = { amarillo: '#FBEFC0', verde: '#DCEBD5', celeste: '#D6E6F2', rosa: '#F7D6D9', naranja: '#F8DCB8', lila: '#E5DAF0', gris: '#E7E4DD' }

const clave = (f, c) => `${f},${c}`
const partes = k => k.split(',').map(Number)
const copiaFilas = t => (t.filas || []).map(r => [...r])

/** Rango ordenado { f1, c1, f2, c2 } a partir de dos esquinas cualesquiera. */
export const rango = (a, b = a) => ({ f1: Math.min(a.f, b.f), c1: Math.min(a.c, b.c), f2: Math.max(a.f, b.f), c2: Math.max(a.c, b.c) })
const toca = (u, r) => u.fila <= r.f2 && u.fila + u.filas - 1 >= r.f1 && u.col <= r.c2 && u.col + u.cols - 1 >= r.c1

/** Agranda el rango hasta abarcar enteras las celdas combinadas que toca. */
export function ampliar(t, r) {
  r = { ...r }
  for (let cambio = true; cambio;) {
    cambio = false
    for (const u of t.fusiones || []) if (toca(u, r)) {
      const n = { f1: Math.min(r.f1, u.fila), c1: Math.min(r.c1, u.col), f2: Math.max(r.f2, u.fila + u.filas - 1), c2: Math.max(r.c2, u.col + u.cols - 1) }
      if (n.f1 !== r.f1 || n.c1 !== r.c1 || n.f2 !== r.f2 || n.c2 !== r.c2) { r = n; cambio = true }
    }
  }
  return r
}

/** Para dibujar: la celda combinada que cubre (f, c), o null. */
export function mapaFusiones(t) {
  const m = new Map()
  for (const u of t.fusiones || []) for (let i = 0; i < u.filas; i++) for (let j = 0; j < u.cols; j++) m.set(clave(u.fila + i, u.col + j), u)
  return (f, c) => m.get(clave(f, c)) || null
}

const conCampos = (filas, fusiones, colores) => ({ filas, fusiones: fusiones.filter(u => u.filas * u.cols > 1), colores })

/** Combina las celdas del rango; los textos se juntan (en renglones) en la primera. */
export function fusionar(t, r) {
  r = ampliar(t, r)
  const filas = copiaFilas(t)
  const textos = []
  for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) {
    if (filas[f]?.[c]?.trim()) textos.push(filas[f][c].trim())
    if (filas[f] && c < filas[f].length) filas[f][c] = ''
  }
  filas[r.f1][r.c1] = textos.join('\n')
  const fusiones = (t.fusiones || []).filter(u => !toca(u, r)).map(u => ({ ...u }))
  fusiones.push({ fila: r.f1, col: r.c1, filas: r.f2 - r.f1 + 1, cols: r.c2 - r.c1 + 1 })
  const colores = { ...(t.colores || {}) }
  const color = colores[clave(r.f1, r.c1)]
  for (const k of Object.keys(colores)) { const [f, c] = partes(k); if (f >= r.f1 && f <= r.f2 && c >= r.c1 && c <= r.c2) delete colores[k] }
  if (color) colores[clave(r.f1, r.c1)] = color
  return conCampos(filas, fusiones, colores)
}

/** Separa las celdas combinadas que toca el rango. */
export function separar(t, r) {
  return conCampos(copiaFilas(t), (t.fusiones || []).filter(u => !toca(u, r)).map(u => ({ ...u })), { ...(t.colores || {}) })
}

/** Pinta (o despinta con color null) las celdas del rango. */
export function pintar(t, r, color) {
  r = ampliar(t, r)
  const cubre = mapaFusiones(t)
  const colores = { ...(t.colores || {}) }
  for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) {
    const u = cubre(f, c)
    if (u && (u.fila !== f || u.col !== c)) continue
    if (color) colores[clave(f, c)] = color
    else delete colores[clave(f, c)]
  }
  return conCampos(copiaFilas(t), (t.fusiones || []).map(u => ({ ...u })), colores)
}

// Desplaza índices al insertar (d = +1) o quitar (d = -1) en la posición i del eje dado.
function moverColores(colores, eje, i, d) {
  const out = {}
  for (const [k, v] of Object.entries(colores || {})) {
    let [f, c] = partes(k)
    const x = eje === 'fila' ? f : c
    if (d < 0 && x === i) continue
    const n = x >= i + (d < 0 ? 1 : 0) ? x + d : x
    if (eje === 'fila') f = n; else c = n
    out[clave(f, c)] = v
  }
  return out
}
function moverFusiones(fusiones, eje, i, d) {
  const [p, n] = eje === 'fila' ? ['fila', 'filas'] : ['col', 'cols']
  return (fusiones || []).map(u => {
    u = { ...u }
    if (d > 0) {
      if (u[p] >= i) u[p]++
      else if (i < u[p] + u[n]) u[n]++
    } else if (u[p] > i) u[p]--
    else if (i < u[p] + u[n]) u[n]--
    return u
  })
}

export function insertarFila(t, i) {
  const filas = copiaFilas(t)
  filas.splice(i, 0, Array(filas[0]?.length || 1).fill(''))
  return conCampos(filas, moverFusiones(t.fusiones, 'fila', i, 1), moverColores(t.colores, 'fila', i, 1))
}
export function insertarColumna(t, j) {
  const filas = copiaFilas(t).map(r => { r.splice(j, 0, ''); return r })
  return conCampos(filas, moverFusiones(t.fusiones, 'col', j, 1), moverColores(t.colores, 'col', j, 1))
}
export function quitarFila(t, i) {
  const filas = copiaFilas(t)
  if (filas.length <= 1) return conCampos(filas, (t.fusiones || []).map(u => ({ ...u })), { ...(t.colores || {}) })
  // Si se quita la primera fila de una combinada, su texto y color bajan a la siguiente.
  const colores = { ...(t.colores || {}) }
  for (const u of t.fusiones || []) if (u.fila === i && u.filas > 1) {
    filas[i + 1][u.col] = filas[i][u.col]
    const k = colores[clave(i, u.col)]
    if (k) colores[clave(i + 1, u.col)] = k
  }
  filas.splice(i, 1)
  return conCampos(filas, moverFusiones(t.fusiones, 'fila', i, -1), moverColores(colores, 'fila', i, -1))
}
export function quitarColumna(t, j) {
  const filas = copiaFilas(t)
  if ((filas[0]?.length || 0) <= 1) return conCampos(filas, (t.fusiones || []).map(u => ({ ...u })), { ...(t.colores || {}) })
  const colores = { ...(t.colores || {}) }
  for (const u of t.fusiones || []) if (u.col === j && u.cols > 1) {
    filas[u.fila][j + 1] = filas[u.fila][j]
    const k = colores[clave(u.fila, j)]
    if (k) colores[clave(u.fila, j + 1)] = k
  }
  for (const r of filas) r.splice(j, 1)
  return conCampos(filas, moverFusiones(t.fusiones, 'col', j, -1), moverColores(colores, 'col', j, -1))
}

/**
 * Al guardar: quita filas y columnas vacías del final (sin texto, color ni celdas combinadas) y
 * deja fuera de la tarjeta los campos vacíos.
 */
export function limpiarTabla(t) {
  let filas = copiaFilas(t)
  const fusiones = (t.fusiones || []).map(u => ({ ...u }))
  const colores = { ...(t.colores || {}) }
  const usada = (f, c) => !!filas[f]?.[c]?.trim() || !!colores[clave(f, c)] || fusiones.some(u => f >= u.fila && f < u.fila + u.filas && c >= u.col && c < u.col + u.cols)
  const ncol = Math.max(1, ...filas.map(r => r.length))
  filas = filas.map(r => [...r, ...Array(ncol - r.length).fill('')])
  let nf = filas.length, nc = ncol
  while (nf > 1 && Array.from({ length: nc }, (_, c) => c).every(c => !usada(nf - 1, c))) nf--
  while (nc > 1 && Array.from({ length: nf }, (_, f) => f).every(f => !usada(f, nc - 1))) nc--
  filas = filas.slice(0, nf).map(r => r.slice(0, nc).map(x => String(x ?? '').replace(/\r/g, '')))
  const out = { filas, fusiones: fusiones.filter(u => u.fila + u.filas <= nf && u.col + u.cols <= nc && u.filas * u.cols > 1), colores: {} }
  for (const [k, v] of Object.entries(colores)) { const [f, c] = partes(k); if (f < nf && c < nc && COLORES_CELDA[v]) out.colores[k] = v }
  return out
}

/** Asigna a la tarjeta el resultado de una operación (sin dejar campos vacíos). */
export function aplicarTabla(o, r) {
  o.filas = r.filas
  if (r.fusiones?.length) o.fusiones = r.fusiones; else delete o.fusiones
  if (r.colores && Object.keys(r.colores).length) o.colores = r.colores; else delete o.colores
  return o
}

/** Los "+" del lienzo: una fila al final o una columna a la derecha (cambia la tarjeta). */
export const crecerTabla = (o, tipo) => aplicarTabla(o, tipo === 'columna' ? insertarColumna(o, o.filas?.[0]?.length || 0) : insertarFila(o, o.filas?.length || 0))
