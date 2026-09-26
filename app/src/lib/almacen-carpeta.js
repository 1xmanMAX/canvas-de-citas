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
  const ruta = await navigator.storage?.getDirectory?.().then(r => r.resolve(almacen.handle)).catch(() => null)
  return ruta ? { opfs: ruta } : { handle: almacen.handle }
}

export async function almacenDeRegistro(r) {
  if (r?.opfs) {
    let d = await navigator.storage.getDirectory()
    for (const p of r.opfs) d = await d.getDirectoryHandle(p, { create: true })
    return almacenDeHandle(d)
  }
  return r?.handle ? almacenDeHandle(r.handle) : null
}
