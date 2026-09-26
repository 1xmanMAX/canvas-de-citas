// Tarjetas libres del lienzo (notas, listas de tareas, notas de voz y fotos): estilos, medidas
// y búsqueda. Las comparten el lienzo del proyecto y los sub-lienzos de cada objetivo.
import { S } from './store.svelte.js'
import { F, envolver, limpiarCache } from './texto.js'
import { cajaFoto } from './medidas-foto.js'
export { ANCHO_FOTO } from './medidas-foto.js'

// La letra manuscrita solo se descarga cuando se usa: al llegar, se vuelve a medir el texto.
document.fonts?.load('500 18px Caveat').then(() => { limpiarCache(); S.tipografias++ }).catch(() => {})

/** Listas del tablero, en orden de dibujo (las fotos quedan encima). */
export const LISTAS = ['notas', 'listas', 'audios', 'fotos']
export const TIPO = { notas: 'nota', listas: 'lista', audios: 'audio', fotos: 'foto' }

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

const MEDIR = { notas: nota, listas: lista, audios: audio, fotos: foto }
// Memo por tarjeta: mover una tarjeta no cambia su tamaño, así que no se vuelve a medir el texto.
const memo = new WeakMap()
const firma = (lista, o) => [lista, S.tipografias, o.texto, o.titulo, o.estilo, o.letra, o.creado ? 1 : 0, o.transcripcion,
  o.anotacion, o.proporcion, o.ancho, o.items?.map(i => (i.hecho ? '1' : '0') + i.t).join('\u0001')].join('\u0002')
/** Medidas de una tarjeta; depende de S.tipografias para remedir cuando cargan las letras. */
export function medir(lista, obj) {
  const f = firma(lista, obj), m = memo.get(obj)
  if (m?.f === f) return m.d
  const d = MEDIR[lista](obj)
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
  return [o.titulo, o.texto, o.anotacion, o.transcripcion, ...(o.items || []).map(i => i.t)].filter(Boolean).join(' ')
}
export const coincideTarjeta = (o, q) => normal(textoDe(o)).includes(normal(q).trim())

export function nombreTarjeta(lista, o) {
  const corto = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > 48 ? t.slice(0, 47) + '…' : t }
  if (lista === 'notas') return `Nota: ${corto(o.titulo || o.texto) || 'vacía'}`
  if (lista === 'listas') return `Lista: ${corto(o.titulo) || 'de tareas'} (${(o.items || []).filter(i => i.hecho).length}/${(o.items || []).length})`
  if (lista === 'audios') return `Nota de voz ${duracionTexto(o.duracion)}${o.transcripcion ? ': ' + corto(o.transcripcion) : ''}`
  return `Foto: ${corto(o.titulo || o.anotacion) || 'sin título'}`
}

export const idLocal = prefijo => `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
export const ahoraISO = () => new Date().toISOString()
