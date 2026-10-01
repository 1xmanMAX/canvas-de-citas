// Tarjetas libres del lienzo (notas, listas de tareas, tablas, notas de voz y fotos): estilos, medidas
// y búsqueda. Las comparten el lienzo del proyecto y los sub-lienzos de cada objetivo.
import { S } from './store.svelte.js'
import { F, envolver, limpiarCache, ancho } from './texto.js'
import { etiquetasDe, colorEtiqueta, textosTarjeta, coincideConsulta, parsearConsulta } from './etiquetas.js'
import { cajaFoto } from './medidas-foto.js'
import { mapaFusiones, COLORES_CELDA } from './tablas.js'
export { ANCHO_FOTO } from './medidas-foto.js'

// La letra manuscrita solo se descarga cuando se usa: al llegar, se vuelve a medir el texto.
document.fonts?.load('500 18px Caveat').then(() => { limpiarCache(); S.tipografias++ }).catch(() => {})

/** Listas del tablero, en orden de dibujo (las fotos quedan encima). */
export const LISTAS = ['notas', 'listas', 'tablas', 'audios', 'fotos']
export const TIPO = { notas: 'nota', listas: 'lista', tablas: 'tabla', audios: 'audio', fotos: 'foto' }

export function asegurarTablero(c) {
  for (const l of LISTAS) c[l] ||= []
  return c
}

export const LETRAS = {
  sans: { nombre: 'Normal', font: F.nota, lh: 18.75, css: 'var(--sans)' },
  serif: { nombre: 'Serif', font: '600 13px Fraunces, Georgia, serif', lh: 19.5, css: 'var(--serif)' },
  mono: { nombre: 'Máquina', font: '400 12.5px "Courier New", Courier, monospace', lh: 19.5, css: 'var(--mono)' },
  mano: { nombre: 'Manuscrita', font: '500 19px Caveat, "Segoe Print", cursive', lh: 22, css: 'var(--mano)' }
}
export const PAPELES = {
  adhesiva: { nombre: 'Adhesiva', w: 168 },
  rayada: { nombre: 'Ficha rayada', w: 210 },
  tarjeta: { nombre: 'Tarjeta', w: 190 }
}
export const COLORES = {
  amarillo: '#FBEFC0', rosa: '#F7D6D9', verde: '#DCEBD5', celeste: '#D6E6F2', naranja: '#F8DCB8', lila: '#E5DAF0'
}
export const TINTAS = { rojo: '#C0392B', azul: '#2F4FB5', verde: '#2E7D4F', amarillo: '#F2C230' }
/** Colores del resaltador (trazo ancho y semitransparente). */
export const RESALTADORES = { amarillo: '#F2C230', verdeclaro: '#7ED957', rosa: '#FF6FAE', celeste: '#5BC0EB' }
export const colorTrazo = t => TINTAS[t.c] || RESALTADORES[t.c] || t.c
/** Trazo de resaltador: los marcados como tal y los amarillos de antes. */
export const esResaltado = t => !!t.r || t.c === 'amarillo'

const FT = { titulo: '600 10.5px "Work Sans", system-ui, sans-serif', lista: '600 14px Fraunces, Georgia, serif', audio: 'italic 400 12px "Work Sans", system-ui, sans-serif', mano: '500 19px Caveat, "Segoe Print", cursive' }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fechaCorta(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : `${d.getDate()} ${MESES[d.getMonth()]}`
}
export const duracionTexto = s => `${Math.floor((s || 0) / 60)}:${String(Math.round(s || 0) % 60).padStart(2, '0')}`

// --- Medidas (todas devuelven { w, h, ... } con lo necesario para dibujar) ---
function nota(n) {
  const w = PAPELES[n.estilo]?.w || 168
  const L = LETRAS[n.letra] || LETRAS.sans
  const titulo = n.titulo?.trim() ? envolver(n.titulo.trim().toUpperCase(), FT.titulo, w - 32, 2) : []
  const lineas = envolver(n.texto || (titulo.length ? '' : 'Nota vacía'), L.font, w - 32, 14).filter((l, i, a) => l || a.length === 1)
  let y = 12
  const tituloY = titulo.map((_, i) => (y += 14, y + 2))
  if (titulo.length) y += 14
  const y0 = y + L.lh * 0.8
  const fin = y0 + (lineas.length - 1) * L.lh + L.lh * 0.5 + 10
  return { w, L, titulo, tituloY, lineas, y0, h: Math.round(fin + (n.creado ? 14 : 0)), fechaY: Math.round(fin + 4) }
}

function lista(l) {
  const w = 220
  const titulo = envolver(l.titulo || 'Lista de tareas', FT.lista, w - 60, 2)
  let y = 14 + titulo.length * 19 + 8
  const items = (l.items || []).slice(0, 30).map(it => {
    const lineas = envolver(it.t || '…', F.nota, w - 50, 3)
    const r = { ...it, lineas, y }
    y += lineas.length * 17 + 7
    return r
  })
  return { w, titulo, items, h: Math.round(y + 10 + (l.creado ? 12 : 0)), fechaY: Math.round(y + 14) }
}

// Tabla: columnas al ancho de su texto más largo (con tope), celdas de hasta 4 renglones (las
// combinadas, hasta 8), con su color de fondo. Devuelve cada celda visible ya ubicada.
const FTB = { celda: '400 12px "Work Sans", system-ui, sans-serif', cabeza: '600 12px "Work Sans", system-ui, sans-serif' }
const FILAS_VISTA = 40
const anchoTexto = (t, font) => Math.max(0, ...String(t ?? '').split('\n').map(l => ancho(l, font)))
function tabla(t) {
  const todas = t.filas?.length ? t.filas : [['']]
  const nf = Math.min(FILAS_VISTA, todas.length)
  const cab = !!t.encabezado
  const fuente = i => (cab && i === 0 ? FTB.cabeza : FTB.celda)
  const ncol = Math.max(1, ...todas.slice(0, nf).map(r => r.length))
  const cubre = mapaFusiones(t)
  // Celdas visibles: las sueltas y la esquina de cada combinada (recortada a lo que se ve).
  const visibles = []
  for (let f = 0; f < nf; f++) for (let c = 0; c < ncol; c++) {
    const u = cubre(f, c)
    if (u && (u.fila !== f || u.col !== c)) continue
    visibles.push({ f, c, filas: u ? Math.min(u.filas, nf - f) : 1, cols: u ? Math.min(u.cols, ncol - c) : 1, texto: todas[f]?.[c] ?? '' })
  }
  let anchos = Array(ncol).fill(48)
  for (const v of visibles) if (v.cols === 1) anchos[v.c] = Math.max(anchos[v.c], Math.min(220, anchoTexto(v.texto, fuente(v.f)) + 18))
  // Una combinada con texto largo ensancha (con tope) las columnas que abarca.
  for (const v of visibles) if (v.cols > 1) {
    const tiene = anchos.slice(v.c, v.c + v.cols).reduce((s, x) => s + x, 0)
    const falta = Math.min(220 * v.cols, anchoTexto(v.texto, fuente(v.f)) + 18) - tiene
    if (falta > 0) for (let j = 0; j < v.cols; j++) anchos[v.c + j] += Math.ceil(falta / v.cols)
  }
  anchos = anchos.map(Math.round)
  // La tarjeta abarca la tabla o el título (hasta 360 px); si sobra espacio, las columnas lo reparten.
  const tituloW = t.titulo?.trim() ? Math.min(360, ancho(t.titulo.trim(), FT.lista)) + 24 : 0
  const w = Math.round(Math.max(120, tituloW, anchos.reduce((s, x) => s + x, 0) + 20))
  const sobra = w - 20 - anchos.reduce((s, x) => s + x, 0)
  if (sobra > 0) anchos = anchos.map((x, j) => x + Math.floor(sobra / ncol) + (j < sobra % ncol ? 1 : 0))
  const anchoTabla = anchos.reduce((s, x) => s + x, 0)
  const titulo = t.titulo?.trim() ? envolver(t.titulo.trim(), FT.lista, w - 24, 2) : []
  const x0 = 10, ty = titulo.length ? 14 + titulo.length * 19 + 4 : 10
  const cols = anchos.reduce((a, cw) => [...a, a.at(-1) + cw], [x0])
  for (const v of visibles) v.lineas = envolver(v.texto, fuente(v.f), cols[v.c + v.cols] - cols[v.c] - 16, v.filas > 1 || v.cols > 1 ? 8 : 4)
  // Alto de cada fila: el de sus celdas sueltas; si una combinada no cabe, crece su última fila.
  const altos = Array(nf).fill(25)
  for (const v of visibles) if (v.filas === 1) altos[v.f] = Math.max(altos[v.f], v.lineas.length * 15 + 10)
  for (const v of visibles) if (v.filas > 1) {
    const tiene = altos.slice(v.f, v.f + v.filas).reduce((s, x) => s + x, 0)
    const falta = v.lineas.length * 15 + 10 - tiene
    if (falta > 0) altos[v.f + v.filas - 1] += falta
  }
  const filasY = altos.reduce((a, h) => [...a, a.at(-1) + h], [ty])
  const celdas = visibles.map(v => ({
    x: cols[v.c], y: filasY[v.f], w: cols[v.c + v.cols] - cols[v.c], h: filasY[v.f + v.filas] - filasY[v.f],
    lineas: v.lineas, cab: cab && v.f === 0, fondo: COLORES_CELDA[t.colores?.[`${v.f},${v.c}`]] || null, f: v.f, c: v.c
  }))
  const y = filasY.at(-1)
  const mas = todas.length - nf
  return { w, titulo, cab, x0, ty, cols, filasY, ancho: anchoTabla, alto: y - ty, celdas, mas, masY: y + 15, h: Math.round(y + (mas ? 24 : 10)) }
}

function audio(a) {
  const w = 240
  const lineas = envolver(a.transcripcion?.trim() || 'Sin transcripción', FT.audio, w - 32, 4)
  const y0 = 104
  return { w, lineas, y0, h: Math.round(y0 + (lineas.length - 1) * 16 + 34), fechaY: Math.round(y0 + (lineas.length - 1) * 16 + 24) }
}

function foto(f) {
  const { w, iw, ih } = cajaFoto(f)
  let y = 8 + ih + 8
  const titulo = f.titulo?.trim() ? envolver(f.titulo.trim(), '600 11.5px "Work Sans", system-ui, sans-serif', iw, 2) : []
  const tituloY = titulo.map(() => (y += 15))
  const texto = f.texto?.trim() ? envolver(f.texto.trim(), F.chico, iw, 3) : []
  const textoY = texto.map(() => (y += 14))
  if (texto.length || titulo.length) y += 4
  const anotacion = f.anotacion?.trim() ? envolver(f.anotacion.trim(), FT.mano, iw, 3) : []
  const anotacionY = anotacion.map(() => (y += 21))
  return { w, iw, ih, titulo, tituloY, texto, textoY, anotacion, anotacionY, h: Math.round(y + 12) }
}

const MEDIR = { notas: nota, listas: lista, tablas: tabla, audios: audio, fotos: foto }
// Memo por tarjeta: mover una tarjeta no cambia su tamaño, así que no se vuelve a medir el texto.
const memo = new WeakMap()
const firma = (lista, o) => [lista, S.tipografias, o.texto, o.titulo, o.estilo, o.letra, o.creado ? 1 : 0, o.transcripcion,
  o.anotacion, o.proporcion, o.ancho, o.etiquetas?.join('|'), o.items?.map(i => (i.hecho ? '1' : '0') + i.t).join('\u0001'), o.encabezado ? 1 : 0, o.filas?.map(r => r.join('\u0003')).join('\u0001'), JSON.stringify(o.fusiones || null), JSON.stringify(o.colores || null)].join('\u0002')
// Chips de etiquetas (#tema) y menciones (@Persona) bajo la tarjeta: hasta 3 y un "+n".
const PALETA_CHIP = ['#E8E1F5', '#DDEBF7', '#DFF2E4', '#FBEBD3', '#F8DEDC', '#E3F1F1', '#F2EED9', '#ECE3DA']
const FUENTE_CHIP = '600 10.5px "Work Sans", system-ui, sans-serif'
function chipsDe(o, w) {
  const { temas, personas } = etiquetasDe(textosTarjeta(o), o.etiquetas)
  const todas = [...temas.map(t => ({ t: '#' + t, persona: false })), ...personas.map(t => ({ t, persona: true }))]
  const out = []
  let x = 8
  for (const [i, c] of todas.entries()) {
    const cw = Math.ceil(ancho(c.t, FUENTE_CHIP)) + 14
    if (i === 3 || x + cw > w - 8) { out.push({ t: `+${todas.length - i}`, x, w: 28, color: '#ECE8DF', persona: false }); break }
    out.push({ ...c, x, w: cw, color: c.persona ? '#FFFFFF' : PALETA_CHIP[colorEtiqueta(c.t)] })
    x += cw + 4
  }
  return out
}

/** Medidas de una tarjeta; depende de S.tipografias para remedir cuando cargan las letras. */
export function medir(lista, obj) {
  const f = firma(lista, obj), m = memo.get(obj)
  if (m?.f === f) return m.d
  let d = MEDIR[lista](obj)
  const chips = chipsDe(obj, d.w)
  if (chips.length) d = { ...d, chips, chipsY: d.h - 4, h: d.h + 22 }
  memo.set(obj, { f, d })
  return d
}

/** Caja { x, y, w, h } de cada tarjeta del tablero, por id. */
export function cajas(c) {
  const m = new Map()
  for (const l of LISTAS) for (const o of c[l] || []) { const d = medir(l, o); m.set(o.id, { x: o.x, y: o.y, w: d.w, h: d.h, lista: l, obj: o }) }
  return m
}

// --- Búsqueda y nombres ---
const normal = t => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export function textoDe(o) {
  return [o.titulo, o.texto, o.anotacion, o.transcripcion, ...(o.items || []).map(i => i.t), ...(o.filas || []).flat()].filter(Boolean).join(' ')
}
/** Búsqueda en el lienzo: palabras, #tema y @persona (escritos en el texto o puestos como chips). */
export const coincideTarjeta = (o, q) => coincideConsulta({ texto: textoDe(o), ...etiquetasDe(textosTarjeta(o), o.etiquetas) }, parsearConsulta(q))

export function nombreTarjeta(lista, o) {
  const corto = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > 48 ? t.slice(0, 47) + '…' : t }
  if (lista === 'notas') return `Nota: ${corto(o.titulo || o.texto) || 'vacía'}`
  if (lista === 'listas') return `Lista: ${corto(o.titulo) || 'de tareas'} (${(o.items || []).filter(i => i.hecho).length}/${(o.items || []).length})`
  if (lista === 'tablas') return `Tabla: ${corto(o.titulo || o.filas?.[0]?.filter(Boolean).join(', ')) || 'sin título'} (${o.filas?.length || 0}×${o.filas?.[0]?.length || 0})`
  if (lista === 'audios') return `Nota de voz ${duracionTexto(o.duracion)}${o.transcripcion ? ': ' + corto(o.transcripcion) : ''}`
  return `Foto: ${corto(o.titulo || o.anotacion) || 'sin título'}`
}

export const idLocal = prefijo => `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
export const ahoraISO = () => new Date().toISOString()
