// app/src/lib/sincro.js
// Fusión a tres vías de los datos de Canvas de Citas. `base` es cómo quedaron los datos en la
// última sincronización; se compara elemento por elemento (por `id` en las listas, por clave en
// los objetos). Si solo un lado cambió algo, gana ese lado; si ambos cambiaron lo mismo, gana el
// local (quien sincroniza) y se anota el conflicto; entre borrar y editar, gana la edición.
export const COLECCIONES = ['proyectos', 'fuentes', 'citas']

export function igual(a, b) {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => igual(x, b[i]))
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined)
  return ka.length === kb.length && ka.every(k => igual(a[k], b[k]))
}

const esObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const conIds = v => v === undefined || (Array.isArray(v) && v.every(x => esObjeto(x) && typeof x.id === 'string'))

function fusionarValor(b, l, r, ruta, conflictos) {
  if (igual(l, r)) return l
  if (igual(b, l)) return r
  if (igual(b, r)) return l
  // Ambos lados cambiaron.
  if (l === undefined || r === undefined) {
    conflictos.push({ ruta, tipo: 'borrado-vs-edicion' })
    return l === undefined ? r : l
  }
  if (esObjeto(l) && esObjeto(r) && (b === undefined || esObjeto(b))) {
    const out = {}
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const v = fusionarValor(b?.[k], l[k], r[k], `${ruta}.${k}`, conflictos)
      if (v !== undefined) out[k] = v
    }
    return out
  }
  if (Array.isArray(l) && Array.isArray(r) && conIds(l) && conIds(r) && conIds(b)) return fusionarLista(b || [], l, r, ruta, conflictos)
  conflictos.push({ ruta, tipo: 'ambos-cambiaron' })
  return l
}

function fusionarLista(b, l, r, ruta, conflictos) {
  const mb = new Map(b.map(x => [x.id, x])), ml = new Map(l.map(x => [x.id, x])), mr = new Map(r.map(x => [x.id, x]))
  const orden = [...l.map(x => x.id), ...r.filter(x => !ml.has(x.id)).map(x => x.id)]
  const out = []
  for (const id of orden) {
    const v = fusionarValor(mb.get(id), ml.get(id), mr.get(id), `${ruta}[${id}]`, conflictos)
    if (v !== undefined) out.push(v)
  }
  return out
}

export function fusionar3(base, local, remoto) {
  const conflictos = [], resultado = {}, borrados = {}
  for (const c of COLECCIONES) {
    const r = remoto?.[c] || []
    resultado[c] = fusionarLista(base?.[c] || [], local?.[c] || [], r, c, conflictos)
    const quedan = new Set(resultado[c].map(x => x.id))
    borrados[c] = r.filter(x => !quedan.has(x.id)).map(x => x.id)
  }
  return { resultado, conflictos, borrados }
}
