// Un proyecto, una carpeta: qué va a cada carpeta (repartir), qué documentos le tocan (docsDe) y
// cómo entra una carpeta de otra instalación sin chocar con los ids de aquí (renumerar).
// Puro: se prueba sin navegador. La misma regla de reparto existe en Rust (receptor/sincro,
// app/tests/vectores/reparto.json): mantenerlas iguales.

/**
 * @param datos {proyectos, fuentes, citas}
 * @param carpetas [{ clave, proyectos: [ids], biblioteca: bool }]
 * @returns Map clave → { proyectos, fuentes, citas }
 */
export function repartir(datos, carpetas) {
  const deProyecto = new Map() // proyecto_id → claves de carpeta
  for (const c of carpetas) for (const pid of c.proyectos) (deProyecto.get(pid) ?? deProyecto.set(pid, []).get(pid)).push(c.clave)
  const partes = new Map(carpetas.map(c => [c.clave, { proyectos: [], fuentes: [], citas: [] }]))
  for (const p of datos.proyectos || []) for (const k of deProyecto.get(p.id) || []) partes.get(k).proyectos.push(p)
  const fuenteEn = new Map() // fuente_id → claves donde tiene citas
  const citadas = new Set()
  for (const c of datos.citas || []) {
    citadas.add(c.fuente_id)
    for (const k of deProyecto.get(c.proyecto_id) || []) {
      partes.get(k).citas.push(c)
      ;(fuenteEn.get(c.fuente_id) ?? fuenteEn.set(c.fuente_id, new Set()).get(c.fuente_id)).add(k)
    }
  }
  const bibliotecas = carpetas.filter(c => c.biblioteca).map(c => c.clave)
  for (const f of datos.fuentes || []) {
    const donde = fuenteEn.get(f.id)
    if (donde) { for (const k of donde) partes.get(k).fuentes.push(f) }
    // Sin citas en ningún proyecto con carpeta (aunque las tenga en uno sin carpeta, así no se pierde).
    else for (const k of bibliotecas) partes.get(k).fuentes.push(f)
  }
  return partes
}

const fotosDe = p => [...(p.canvas?.fotos || []), ...Object.values(p.canvas?.objetivos || {}).flatMap(o => o.fotos || [])]

/** Rutas de los documentos que le tocan a una parte: los de sus fuentes y los originales de sus fotos. */
export function docsDe(parte) {
  const rutas = new Set()
  for (const f of parte.fuentes) if (f.documento_original) rutas.add(f.documento_original)
  for (const p of parte.proyectos) for (const f of fotosDe(p)) if (f.original) rutas.add(f.original)
  return [...rutas]
}

// --- renumerar ---
const norm = t => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const doi = f => { const m = /10\.\d{4,9}\/\S+/i.exec(String(f.doi_o_url || '')); return m ? m[0].toLowerCase().replace(/[.,;]+$/, '') : '' }

function mismaFuente(a, b) {
  if (a.id === b.id && norm(a.titulo) === norm(b.titulo)) return true
  if (doi(a) && doi(a) === doi(b)) return true
  return !!norm(a.titulo) && norm(a.titulo) === norm(b.titulo) && String(a.anio ?? '') === String(b.anio ?? '')
}
const mismaCita = (a, b) => ['proyecto_id', 'fuente_id', 'pagina', 'cita_en_texto'].every(k => String(a[k] ?? '') === String(b[k] ?? ''))

/**
 * Prepara lo que trae una carpeta de otra instalación para combinarlo con lo de aquí.
 * @param nuevoId (col) → id nuevo que no existe aquí
 * @returns { datos (copias), mapa: { proyectos, fuentes, citas } viejo → nuevo }
 */
export function renumerar(entrantes, existentes, nuevoId) {
  const datos = structuredClone({ proyectos: entrantes.proyectos || [], fuentes: entrantes.fuentes || [], citas: entrantes.citas || [] })
  const mapa = { proyectos: {}, fuentes: {}, citas: {} }
  const ex = { proyectos: existentes.proyectos || [], fuentes: existentes.fuentes || [], citas: existentes.citas || [] }

  // Fuentes: la misma que aquí conserva el id de aquí; la distinta con un id ocupado recibe uno nuevo.
  const fuentesAqui = new Map(ex.fuentes.map(f => [f.id, f]))
  for (const f of datos.fuentes) {
    const igual = ex.fuentes.find(e => mismaFuente(f, e))
    if (igual) { if (igual.id !== f.id) mapa.fuentes[f.id] = igual.id }
    else if (fuentesAqui.has(f.id)) mapa.fuentes[f.id] = nuevoId('fuentes')
  }
  const proyectosAqui = new Map(ex.proyectos.map(p => [p.id, p]))
  for (const p of datos.proyectos) {
    const aqui = proyectosAqui.get(p.id)
    if (aqui && norm(aqui.titulo) !== norm(p.titulo)) mapa.proyectos[p.id] = nuevoId('proyectos')
  }

  const F = id => mapa.fuentes[id] ?? id, P = id => mapa.proyectos[id] ?? id
  for (const f of datos.fuentes) {
    const nuevo = F(f.id)
    if (nuevo !== f.id && f.documento_original) f.documento_original = f.documento_original.replace(`fuentes/${f.id}/`, `fuentes/${nuevo}/`)
    f.id = nuevo
  }
  // Dos entrantes que resultan ser la misma fuente de aquí: queda una sola.
  datos.fuentes = datos.fuentes.filter((f, i, l) => l.findIndex(x => x.id === f.id) === i)

  for (const p of datos.proyectos) { p.id = P(p.id); reescribirLienzo(p.canvas, F) }

  const citasAqui = new Map(ex.citas.map(c => [c.id, c]))
  for (const c of datos.citas) {
    c.proyecto_id = P(c.proyecto_id)
    c.fuente_id = F(c.fuente_id)
    const aqui = citasAqui.get(c.id)
    if (aqui && !mismaCita(aqui, c)) { const n = nuevoId('citas'); mapa.citas[c.id] = n; c.id = n }
  }
  return { datos, mapa }
}

/** Cambia los ids de fuentes que aparecen en un lienzo (y en sus sub-lienzos de objetivo). */
function reescribirLienzo(c, F) {
  if (!c) return
  const tablero = t => {
    if (t.posiciones) t.posiciones = Object.fromEntries(Object.entries(t.posiciones).map(([k, v]) => [F(k), v]))
    for (const x of t.conexiones || []) { x.desde = F(x.desde); x.hasta = F(x.hasta) }
    for (const g of t.agrupadores || []) g.miembros = (g.miembros || []).map(F)
    for (const f of t.fuentes || []) f.id = F(f.id)
  }
  tablero(c)
  for (const o of Object.values(c.objetivos || {})) tablero(o)
}
