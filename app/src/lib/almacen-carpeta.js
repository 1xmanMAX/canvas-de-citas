import { puente } from './plataforma.js'

// Una carpeta del disco vista por la app: leer, escribir y borrar archivos por ruta ("a/b.json").
// Hoy con File System Access (Chrome/Edge/Comet de escritorio); la app de Windows (etapa E) da la
// misma interfaz con su puente local, sin permisos del navegador.

/** Nombre de carpeta válido en Windows a partir de un título. */
export function nombreSeguro(titulo) {
  const t = String(titulo || 'Proyecto').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')
  return (t.length > 60 ? t.slice(0, 60).trim() : t) || 'Proyecto'
}

export function almacenDeHandle(dir) {
  const bajar = async (ruta, crear) => {
    const partes = ruta.split('/').filter(Boolean)
    const nombre = partes.pop()
    let d = dir
    for (const p of partes) d = await d.getDirectoryHandle(p, { create: crear })
    return { d, nombre }
  }
  return {
    tipo: 'navegador',
    nombre: dir.name,
    handle: dir,
    async permiso() {
      if (!dir.queryPermission) return 'granted'
      return dir.queryPermission({ mode: 'readwrite' })
    },
    async pedirPermiso() {
      if (!dir.requestPermission) return true
      return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted'
    },
    /** File (con lastModified) o null si no existe. */
    async leer(ruta) {
      try {
        const { d, nombre } = await bajar(ruta, false)
        return await (await d.getFileHandle(nombre)).getFile()
      } catch { return null }
    },
    async escribir(ruta, contenido) {
      const { d, nombre } = await bajar(ruta, true)
      const w = await (await d.getFileHandle(nombre, { create: true })).createWritable()
      await w.write(contenido)
      await w.close()
    },
    async borrar(ruta) {
      try {
        const { d, nombre } = await bajar(ruta, false)
        await d.removeEntry(nombre)
      } catch { /* ya no estaba */ }
    },
    /** Crea una subcarpeta nueva (si el nombre existe: "Nombre (2)", "Nombre (3)"…). */
    async subcarpetaNueva(nombre) {
      for (let i = 1; ; i++) {
        const n = i === 1 ? nombre : `${nombre} (${i})`
        try { await dir.getDirectoryHandle(n); continue } catch { /* libre */ }
        return almacenDeHandle(await dir.getDirectoryHandle(n, { create: true }))
      }
    },
    mismo: otro => (otro?.handle && dir.isSameEntry ? dir.isSameEntry(otro.handle) : Promise.resolve(false))
  }
}

/**
 * Qué se guarda en IndexedDB para volver a abrir la carpeta. Las carpetas del sistema de archivos
 * privado del navegador (OPFS) se guardan por su ruta: guardar su handle hace caer a Chrome al leerlo.
 */
export async function registroDe(almacen) {
  if (almacen.tipo === 'windows') return { ruta: almacen.ruta }
  const ruta = await navigator.storage?.getDirectory?.().then(r => r.resolve(almacen.handle)).catch(() => null)
  return ruta ? { opfs: ruta } : { handle: almacen.handle }
}

export async function almacenDeRegistro(r) {
  if (r?.ruta) return almacenWindows(r.ruta, r.nombre)
  if (r?.opfs) {
    let d = await navigator.storage.getDirectory()
    for (const p of r.opfs) d = await d.getDirectoryHandle(p, { create: true })
    return almacenDeHandle(d)
  }
  return r?.handle ? almacenDeHandle(r.handle) : null
}

/** La misma interfaz sobre el puente de la app de Windows: sin permisos del navegador. */
export function almacenWindows(ruta, nombre = ruta.split(/[\\/]/).filter(Boolean).pop()) {
  const p = r => ({ carpeta: ruta, ruta: r })
  return {
    tipo: 'windows',
    nombre,
    ruta,
    permiso: async () => 'granted',
    pedirPermiso: async () => true,
    async leer(r) {
      const res = await puente('leer', { params: p(r) })
      if (res.status === 204 || res.status === 404) return null // no existe
      if (!res.ok) throw new Error(`No se pudo leer ${r} (${res.status})`)
      return new File([await res.blob()], r.split('/').pop(), { lastModified: +res.headers.get('X-Modificado') || 0 })
    },
    /** Con `si` (la fecha que la app vio), el puente rechaza (409) si otro lo cambió entre medio. Devuelve la fecha nueva. */
    async escribir(r, contenido, { si } = {}) {
      const res = await puente('escribir', { metodo: 'PUT', params: si ? { ...p(r), si } : p(r), cuerpo: contenido })
      if (res.status === 409) throw Object.assign(new Error(`${r} cambió mientras se guardaba`), { name: 'CambiadoAfuera' })
      if (res.status === 404) throw Object.assign(new Error('No se encuentra la carpeta (¿se movió o se desconectó el disco?)'), { name: 'NotFoundError' })
      if (!res.ok) throw new Error(`No se pudo escribir ${r} (${res.status})`)
      return (await res.json()).modificado
    },
    async borrar(r) { await puente('borrar', { metodo: 'POST', params: p(r) }) },
    async subcarpetaNueva(n) {
      const res = await puente('crear-subcarpeta', { metodo: 'POST', params: { carpeta: ruta, nombre: n } })
      if (!res.ok) throw new Error(`No se pudo crear la carpeta (${res.status})`)
      const d = await res.json()
      return almacenWindows(d.ruta, d.nombre)
    },
    mismo: async otro => !!otro?.ruta && otro.ruta.toLowerCase() === ruta.toLowerCase()
  }
}

/** Diálogo nativo de Windows para elegir una carpeta; null si se cancela. */
export async function elegirCarpetaWindows(titulo) {
  const res = await puente('elegir-carpeta', { metodo: 'POST', params: { titulo } })
  if (res.status === 204) return null
  const d = await res.json()
  return almacenWindows(d.ruta, d.nombre)
}
