// Lienzo de lectura de cada fuente (p.canvas.lecturas[<fuente_id>]): las citas, recortes y notas de
// un paper viven en su propio tablero, y solo las que se "clavan" aparecen también en el lienzo
// general del proyecto. Una tarjeta clavada guarda su lugar en el general en `en_general: { x, y }`
// (campo opcional); la tarjeta sigue siendo una sola: se edita igual desde los dos lienzos.
// Puro (sin navegador): las medidas se reciben como `medir(lista, obj)` → { w, h }.

export const LISTAS = ['notas', 'listas', 'audios', 'fotos']

export const vacia = () => ({ notas: [], listas: [], audios: [], fotos: [], conexiones: [], agrupadores: [] })

/** Tablero de lectura de la fuente, creado la primera vez que se le agrega algo. */
export function asegurarLectura(cv, fid) {
  cv.lecturas ||= {}
  cv.lecturas[fid] ||= vacia()
  const t = cv.lecturas[fid]
  for (const l of [...LISTAS, 'conexiones', 'agrupadores']) t[l] ||= []
  return t
}

/** Cuántas tarjetas tiene el lienzo de lectura de una fuente (y cuántas están clavadas en el general). */
export function cuentaLectura(cv, fid) {
  const t = cv?.lecturas?.[fid]
  let total = 0, clavadas = 0
  for (const l of LISTAS) for (const o of t?.[l] || []) { total++; if (o.en_general) clavadas++ }
  return { total, clavadas }
}

/** Tarjetas de todos los lienzos de lectura que están clavadas en el general: [{ fid, lista, obj }]. */
export function clavadasDe(cv) {
  const out = []
  for (const [fid, t] of Object.entries(cv?.lecturas || {}))
    for (const lista of LISTAS) for (const obj of t[lista] || []) if (obj.en_general) out.push({ fid, lista, obj })
  return out
}

/** Cajas de las tarjetas clavadas en el general (como `cajas()`, pero en su lugar del general). */
export function cajasClavadas(cv, medir) {
  const m = new Map()
  for (const { fid, lista, obj } of clavadasDe(cv)) {
    const d = medir(lista, obj)
    m.set(obj.id, { x: obj.en_general.x, y: obj.en_general.y, w: d.w, h: d.h, lista, obj, fid })
  }
  return m
}

/** Lienzo de lectura donde vive una tarjeta: { fid, t, lista } o null. */
export function buscarEnLecturas(cv, id) {
  for (const [fid, t] of Object.entries(cv?.lecturas || {}))
    for (const lista of LISTAS) if ((t[lista] || []).some(o => o.id === id)) return { fid, t, lista }
  return null
}

/**
 * Clava o desclava una tarjeta en el lienzo general. `lugar(w, h)` da el sitio libre donde
 * aparece al clavarla; al desclavarla se olvida ese sitio (vuelve a elegirse al clavarla otra vez).
 * Devuelve true si quedó clavada.
 */
export function alternarClavada(lista, obj, lugar, medir) {
  if (obj.en_general) {
    delete obj.en_general
    return false
  }
  const d = medir(lista, obj)
  const q = lugar(d.w, d.h)
  obj.en_general = { x: Math.round(q.x), y: Math.round(q.y) }
  return true
}

/**
 * Lleva a su lienzo de lectura las tarjetas del lienzo general que salieron de un documento
 * (`origen.fuente`, notas con cita y recortes de antes de que existieran las lecturas). Quedan
 * clavadas en el mismo lugar del general, así que allí no cambia nada a la vista; en la lectura se
 * acomodan a la derecha de la fuente, conservando cómo estaban entre sí (debajo de lo que ya haya).
 * El hilo "cita" que las unía a su fuente pasa también a la lectura. Las de los sub-lienzos de
 * objetivo se quedan donde están. `existe(fid)` dice si la fuente sigue en la biblioteca.
 * Devuelve cuántas tarjetas se movieron.
 */
export function migrarALecturas(cv, existe, medir) {
  const copia = o => JSON.parse(JSON.stringify(o))
  const porFuente = new Map() // fid → [{ lista, o }]
  for (const lista of LISTAS)
    for (const o of cv[lista] || []) {
      const fid = o.origen?.fuente
      if (fid && existe(fid)) (porFuente.get(fid) ?? porFuente.set(fid, []).get(fid)).push({ lista, o })
    }
  if (!porFuente.size) return 0
  const movidas = new Set()
  for (const [fid, ts] of porFuente) {
    const t = asegurarLectura(cv, fid)
    // Debajo de lo que ya tenga la lectura (o arriba a la derecha de la fuente, si está vacía).
    let techo = -120
    for (const l of LISTAS) for (const x of t[l]) techo = Math.max(techo, x.y + medir(l, x).h + 40)
    const x0 = Math.min(...ts.map(({ o }) => o.x)), y0 = Math.min(...ts.map(({ o }) => o.y))
    for (const { lista, o } of ts) {
      t[lista].push({ ...copia(o), en_general: { x: o.x, y: o.y }, x: Math.round(o.x - x0 + 280), y: Math.round(o.y - y0 + techo) })
      movidas.add(o.id)
    }
    const hilos = (cv.conexiones || []).filter(k => k.etiqueta === 'cita' && ((k.desde === fid && movidas.has(k.hasta)) || (k.hasta === fid && movidas.has(k.desde))))
    if (hilos.length) {
      t.conexiones.push(...hilos.map(copia))
      cv.conexiones = cv.conexiones.filter(k => !hilos.includes(k))
    }
  }
  for (const lista of LISTAS) if (cv[lista]?.some(o => movidas.has(o.id))) cv[lista] = cv[lista].filter(o => !movidas.has(o.id))
  return movidas.size
}
