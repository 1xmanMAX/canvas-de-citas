// Sub-lienzos por objetivo del proyecto (p.canvas.objetivos) y su vínculo con los indicadores.
// Claves: 'og' (objetivo general) y 'oe1', 'oe2'… (específicos, por posición en la lista).
// Cada sub-lienzo: { indicadores: [{ id, texto, x, y }], fuentes: [{ id, x, y }], notas, conexiones }.

export function listaObjetivos(p) {
  const l = []
  if (p.objetivo_general?.trim()) l.push({ clave: 'og', corto: 'OG', rotulo: 'Objetivo general', texto: p.objetivo_general.trim() })
  ;(p.objetivos_especificos || []).forEach((t, i) =>
    l.push({ clave: `oe${i + 1}`, corto: `OE${i + 1}`, rotulo: `Objetivo específico ${i + 1}`, texto: t }))
  return l
}

export const vacio = () => ({ indicadores: [], fuentes: [], notas: [], listas: [], audios: [], fotos: [], conexiones: [] })

const tieneContenido = o => !!(o && ['indicadores', 'fuentes', 'notas', 'listas', 'audios', 'fotos'].some(l => o[l]?.length))
const corto = clave => (clave === 'og' ? 'OG' : clave.toUpperCase())

/** Objetivos (cortos) a los que está vinculado cada indicador: Map texto → ['OE1', …]. */
export function objetivosPorIndicador(p) {
  const m = new Map()
  for (const [clave, o] of Object.entries(p.canvas?.objetivos || {}))
    for (const x of o.indicadores) (m.get(x.texto) ?? m.set(x.texto, []).get(x.texto)).push(corto(clave))
  for (const l of m.values()) l.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return m
}

/**
 * Empareja una lista editada con la anterior: índice nuevo → índice viejo.
 * Primero por texto idéntico (reordenar), luego por posición si la línea se reescribió.
 */
function emparejar(antes, despues) {
  const m = new Map(), usados = new Set()
  despues.forEach((t, j) => {
    const i = antes.findIndex((x, k) => x === t && !usados.has(k))
    if (i >= 0) { m.set(j, i); usados.add(i) }
  })
  despues.forEach((t, j) => {
    if (!m.has(j) && j < antes.length && !usados.has(j) && !despues.includes(antes[j])) { m.set(j, j); usados.add(j) }
  })
  return m
}

/**
 * Al guardar la ficha: reubica los sub-lienzos si los objetivos se reordenaron o reescribieron,
 * renombra los indicadores vinculados y desvincula los que se borraron.
 * `p` es una copia (snapshot) del proyecto antes de editar; no se modifica el estado global.
 * Devuelve { objetivos, perdidos: ['OE3', …] } (sub-lienzos con contenido que desaparecen).
 */
export function remapear(p, general, especificos, indicadores) {
  const viejo = p.canvas?.objetivos || {}
  const nuevo = {}
  if (general?.trim() && viejo.og) nuevo.og = viejo.og
  for (const [j, i] of emparejar(p.objetivos_especificos || [], especificos))
    if (viejo[`oe${i + 1}`]) nuevo[`oe${j + 1}`] = viejo[`oe${i + 1}`]

  const renombre = new Map([...emparejar(p.indicadores || [], indicadores)].map(([j, i]) => [p.indicadores[i], indicadores[j]]))
  for (const o of Object.values(nuevo)) {
    const quitados = new Set(o.indicadores.filter(x => !renombre.has(x.texto)).map(x => x.id))
    o.indicadores = o.indicadores.filter(x => !quitados.has(x.id)).map(x => ({ ...x, texto: renombre.get(x.texto) }))
    o.conexiones = o.conexiones.filter(c => !quitados.has(c.desde) && !quitados.has(c.hasta))
  }
  const conservados = new Set(Object.values(nuevo))
  const perdidos = Object.keys(viejo).filter(k => tieneContenido(viejo[k]) && !conservados.has(viejo[k])).map(corto)
  return { objetivos: nuevo, perdidos }
}
