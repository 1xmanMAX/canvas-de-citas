// Envoltorio mínimo de IndexedDB (sin dependencias).
const NOMBRE = 'canvas-de-citas'
let conexion

function abrir() {
  return (conexion ||= new Promise((res, rej) => {
    const r = indexedDB.open(NOMBRE, 1)
    r.onupgradeneeded = () => {
      const d = r.result
      d.createObjectStore('proyectos', { keyPath: 'id' })
      d.createObjectStore('fuentes', { keyPath: 'id' })
      const c = d.createObjectStore('citas', { keyPath: 'id' })
      c.createIndex('proyecto_id', 'proyecto_id')
      c.createIndex('fuente_id', 'fuente_id')
      d.createObjectStore('documentos') // clave: fuente_id → { nombre, tipo, blob }
      d.createObjectStore('meta')
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  }))
}

const terminar = t => new Promise((res, rej) => {
  t.oncomplete = () => res()
  t.onerror = t.onabort = () => rej(t.error)
})

async function tx(stores, modo, fn) {
  const t = (await abrir()).transaction(stores, modo)
  const r = fn(t)
  await terminar(t)
  return r instanceof IDBRequest ? r.result : undefined
}

export const todos = store => tx(store, 'readonly', t => t.objectStore(store).getAll())
export const leer = (store, clave) => tx(store, 'readonly', t => t.objectStore(store).get(clave))
export const claves = store => tx(store, 'readonly', t => t.objectStore(store).getAllKeys())
export const poner = (store, valor, clave) => tx(store, 'readwrite', t => { t.objectStore(store).put(valor, clave) })
export const borrar = (store, clave) => tx(store, 'readwrite', t => { t.objectStore(store).delete(clave) })

export const ponerVarios = (store, valores) =>
  tx(store, 'readwrite', t => { const s = t.objectStore(store); for (const v of valores) s.put(v) })

export const borrarVarios = (store, lista) =>
  tx(store, 'readwrite', t => { const s = t.objectStore(store); for (const k of lista) s.delete(k) })

export const vaciar = stores => tx(stores, 'readwrite', t => { for (const s of stores) t.objectStore(s).clear() })
