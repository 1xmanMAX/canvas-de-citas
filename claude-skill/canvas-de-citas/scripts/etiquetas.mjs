// Copia de app/src/lib/etiquetas.js (mantener iguales): etiquetas #tema y menciones @Persona.

const LETRA = '\\p{L}'
const CUERPO = '[\\p{L}\\p{N}_-]*(?:\\.[\\p{L}\\p{N}_-]+)*'
// # o @ al inicio o tras algo que no sea letra, número, "/", ".", "@" o "&" (así no entran correos ni URLs).
const RE = new RegExp(`(^|[^\\p{L}\\p{N}/.@&])([#@])(${LETRA}${CUERPO})`, 'gu')

export const normalizar = t => String(t ?? '').replace(/^#/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function extraer(texto) {
  const temas = [], personas = []
  for (const m of String(texto ?? '').matchAll(RE)) {
    if (m[2] === '@') personas.push('@' + m[3])
    else temas.push(m[3])
  }
  return { temas, personas }
}

function unicos(lista) {
  const vistos = new Set(), out = []
  for (const t of lista) {
    const n = normalizar(t)
    if (!vistos.has(n)) { vistos.add(n); out.push(t) }
  }
  return out
}

/** Etiquetas de un elemento: las de su campo `etiquetas` primero y luego las escritas en sus textos. */
export function etiquetasDe(textos, campo = []) {
  const temas = [], personas = []
  for (const e of campo || []) (String(e).startsWith('@') ? personas : temas).push(String(e).replace(/^#/, ''))
  for (const t of textos) {
    const x = extraer(t)
    temas.push(...x.temas)
    personas.push(...x.personas)
  }
  return { temas: unicos(temas), personas: unicos(personas) }
}

/** "#retrabajo @Villarreal costo" → { temas, personas, palabras } normalizados. */
export function parsearConsulta(q) {
  const temas = [], personas = [], palabras = []
  for (const p of String(q ?? '').trim().split(/\s+/).filter(Boolean)) {
    if (p.length > 1 && p[0] === '#') temas.push(normalizar(p))
    else if (p.length > 1 && p[0] === '@') personas.push(normalizar(p))
    else palabras.push(normalizar(p))
  }
  return { temas, personas, palabras }
}

/** Todas las partes de la consulta deben estar en el elemento. */
export function coincideConsulta(item, c) {
  // Los elementos del índice traen su versión normalizada (`_n`): así buscar no vuelve a
  // normalizar todo el texto en cada tecla.
  const n = item._n || normalizado(item)
  return c.temas.every(t => n.temas.includes(t)) && c.personas.every(p => n.personas.includes(p)) && c.palabras.every(w => n.texto.includes(w))
}

function normalizado(item) {
  const temas = item.temas.map(normalizar), personas = item.personas.map(normalizar)
  return { temas, personas, texto: normalizar(item.texto) + ' ' + temas.join(' ') + ' ' + personas.join(' ') }
}

const TIPO_LISTA = { notas: 'nota', listas: 'lista', audios: 'audio', fotos: 'foto' }
export const textosTarjeta = o => [o.titulo, o.texto, o.anotacion, o.transcripcion, ...(o.items || []).map(i => i.t)].filter(Boolean)

function item(tipo, id, pid, clave, titulo, textos, campo) {
  const i = { tipo, id, pid, clave, titulo, texto: textos.join(' '), ...etiquetasDe(textos, campo) }
  Object.defineProperty(i, '_n', { value: normalizado(i) }) // no enumerable: no se copia ni se compara
  return i
}

/** Todo lo buscable: tarjetas (también de los sub-lienzos y lienzos de lectura), agrupadores, objetivos, fuentes y citas. */
export function indexar({ proyectos = [], fuentes = [], citas = [] }) {
  const out = []
  for (const p of proyectos) {
    const c = p.canvas || {}
    const tablero = (t, clave) => {
      for (const [lista, tipo] of Object.entries(TIPO_LISTA))
        for (const o of t[lista] || []) out.push(item(tipo, o.id, p.id, clave, o.titulo || '', textosTarjeta(o), o.etiquetas))
      for (const g of t.agrupadores || []) out.push(item('agrupador', g.id, p.id, clave, g.titulo || '', [g.titulo || ''], g.etiquetas))
    }
    tablero(c, null)
    for (const [clave, t] of Object.entries(c.objetivos || {})) tablero(t, clave)
    // Lienzos de lectura de cada fuente: clave 'l:<fuente_id>'.
    for (const [fid, t] of Object.entries(c.lecturas || {})) tablero(t, `l:${fid}`)
    const objetivos = [['og', p.objetivo_general], ...(p.objetivos_especificos || []).map((o, i) => [`oe${i + 1}`, o])]
    for (const [clave, texto] of objetivos) if (texto) out.push(item('objetivo', `${p.id}:${clave}`, p.id, clave, texto, [texto]))
  }
  for (const f of fuentes)
    out.push(item('fuente', f.id, null, null, f.titulo || '', [f.titulo, f.tema, ...(f.autores || []), f.revista_o_editorial, f.notas_correccion].filter(Boolean), f.etiquetas))
  for (const k of citas) out.push(item('cita', k.id, k.proyecto_id, null, k.cita_en_texto || '', [k.cita_en_texto, k.contexto].filter(Boolean), k.etiquetas))
  return out
}

function contar(listas) {
  const m = new Map()
  for (const t of listas.flat()) {
    const n = normalizar(t), e = m.get(n) || { formas: new Map(), cuenta: 0 }
    e.cuenta++
    e.formas.set(t, (e.formas.get(t) || 0) + 1)
    m.set(n, e)
  }
  return [...m.values()]
    .map(e => ({ etiqueta: [...e.formas].sort((a, b) => b[1] - a[1])[0][0], cuenta: e.cuenta }))
    .sort((a, b) => b.cuenta - a.cuenta || a.etiqueta.localeCompare(b.etiqueta))
}

/** Cuántos elementos tiene cada etiqueta y cada persona (con la forma más usada). */
export const resumen = items => ({ temas: contar(items.map(i => i.temas)), personas: contar(items.map(i => i.personas)) })

/** Color estable (0–7) para dibujar el chip de una etiqueta. */
export function colorEtiqueta(t) {
  let h = 0
  for (const ch of normalizar(t)) h = (h * 31 + ch.codePointAt(0)) >>> 0
  return h % 8
}

/** Sugerencias al escribir "#vi" o "@Ve": las más usadas; en "@" también los apellidos de autores. */
export function sugerencias(items, prefijo, parcial, autores = []) {
  const r = resumen(items)
  const lista = (prefijo === '@' ? r.personas : r.temas).map(x => x.etiqueta)
  if (prefijo === '@') for (const a of autores) {
    const ap = String(a).split(',')[0].trim().replace(/\s+/g, '')
    if (ap) lista.push('@' + ap)
  }
  const q = normalizar(prefijo === '@' ? '@' + parcial : parcial)
  return unicos(lista.filter(t => normalizar(t).startsWith(q))).slice(0, 8)
}
