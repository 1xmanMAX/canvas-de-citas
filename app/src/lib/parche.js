// Parches: solo lo que cambió entre dos versiones de los datos. Mismo algoritmo que
// receptor/sincro/src/parche.rs (los dos lados se comprueban con tests/vectores/parche.json).
//
// Un parche es una lista de operaciones sobre una ruta. Cada paso de la ruta es una clave de
// objeto ("proyectos") o un elemento de una lista por su id ({ "id": "nota_1" }):
//   { r: [...], v: valor }      poner (reemplaza o agrega)
//   { r: [...], x: 1 }          quitar
//   { r: [...], orden: [ids] }  reordenar una lista con ids
import { igual } from './sincro.js'

const esObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v)
function conIds(v) {
  if (!Array.isArray(v)) return false
  const vistos = new Set()
  for (const x of v) {
    if (!esObjeto(x) || typeof x.id !== 'string' || vistos.has(x.id)) return false
    vistos.add(x.id)
  }
  return true
}

/** Operaciones que convierten `a` en `b`. */
export function diferencias(a, b, ruta = [], ops = []) {
  if (igual(a, b)) return ops
  if (esObjeto(a) && esObjeto(b)) {
    for (const k of Object.keys(b)) {
      if (b[k] === undefined) continue
      if (!(k in a) || a[k] === undefined) ops.push({ r: [...ruta, k], v: b[k] })
      else diferencias(a[k], b[k], [...ruta, k], ops)
    }
    for (const k of Object.keys(a)) if (a[k] !== undefined && (!(k in b) || b[k] === undefined)) ops.push({ r: [...ruta, k], x: 1 })
    return ops
  }
  if (conIds(a) && conIds(b)) {
    const ma = new Map(a.map(x => [x.id, x])), mb = new Set(b.map(x => x.id))
    for (const x of a) if (!mb.has(x.id)) ops.push({ r: [...ruta, { id: x.id }], x: 1 })
    for (const x of b) {
      if (!ma.has(x.id)) ops.push({ r: [...ruta, { id: x.id }], v: x })
      else diferencias(ma.get(x.id), x, [...ruta, { id: x.id }], ops)
    }
    // Tras quitar y agregar al final, ¿queda en el orden de `b`?
    const queda = [...a.filter(x => mb.has(x.id)).map(x => x.id), ...b.filter(x => !ma.has(x.id)).map(x => x.id)]
    if (queda.some((id, i) => id !== b[i].id)) ops.push({ r: ruta, orden: b.map(x => x.id) })
    return ops
  }
  ops.push({ r: ruta, v: b })
  return ops
}

const copia = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

function hijo(contenedor, paso) {
  if (typeof paso === 'string') return esObjeto(contenedor) ? contenedor[paso] : undefined
  return Array.isArray(contenedor) ? contenedor.find(x => x?.id === paso.id) : undefined
}

/** Aplica un parche a una copia de `a` y la devuelve. */
export function aplicar(a, ops) {
  let raiz = copia(a)
  for (const op of ops) {
    if (!op.r.length) {
      if ('v' in op) raiz = copia(op.v)
      continue
    }
    let c = raiz
    for (const paso of op.r.slice(0, -1)) {
      c = hijo(c, paso)
      if (c === undefined) throw new Error('El parche no corresponde a esta versión de los datos')
    }
    const ultimo = op.r.at(-1)
    if ('orden' in op) {
      const lista = hijo(c, ultimo)
      if (!Array.isArray(lista)) throw new Error('El parche no corresponde a esta versión de los datos')
      const pos = new Map(op.orden.map((id, i) => [id, i]))
      const ordenada = [...lista].sort((x, y) => (pos.get(x.id) ?? Infinity) - (pos.get(y.id) ?? Infinity))
      lista.splice(0, lista.length, ...ordenada)
    } else if (typeof ultimo === 'string') {
      if (!esObjeto(c)) throw new Error('El parche no corresponde a esta versión de los datos')
      if (op.x) delete c[ultimo]
      else c[ultimo] = copia(op.v)
    } else {
      if (!Array.isArray(c)) throw new Error('El parche no corresponde a esta versión de los datos')
      const i = c.findIndex(x => x?.id === ultimo.id)
      if (op.x) { if (i >= 0) c.splice(i, 1) }
      else if (i >= 0) c[i] = copia(op.v)
      else c.push(copia(op.v))
    }
  }
  return raiz
}

/** JSON con las claves ordenadas: el mismo texto en JS y en Rust para los mismos datos. */
export function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : canonico(x))).join(',') + ']'
  if (esObjeto(v)) {
    const ks = Object.keys(v).filter(k => v[k] !== undefined).sort()
    return '{' + ks.map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}'
  }
  return JSON.stringify(v)
}

/** Huella (sha-256, 32 hex) de los datos: ambos lados la comparan para saber si tienen la misma base. */
export async function huella(datos) {
  const v = { proyectos: datos?.proyectos || [], fuentes: datos?.fuentes || [], citas: datos?.citas || [] }
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonico(v))))
  return [...h.subarray(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Tamaño aproximado (bytes) de un parche, para mostrar cuánto viajó. */
export const pesoDe = v => new TextEncoder().encode(JSON.stringify(v)).length
