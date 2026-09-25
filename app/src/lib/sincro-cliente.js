// app/src/lib/sincro-cliente.js
// Una sincronización completa: traer el estado de la PC, fusionar a tres vías con la base,
// enviar el resultado (reintentando si la PC cambió entre medio), pasar documentos y guardar la
// nueva base. El almacén y la conexión se inyectan (app, pruebas, Android).
import { fusionar3 } from './sincro.js'

export async function sincronizar({ conexion, almacen, alProgreso = () => {} }) {
  let reintentos = 0
  for (;;) {
    alProgreso('Leyendo la PC…')
    const remoto = await conexion.estado()
    const local = await almacen.leerLocal()
    const base = await almacen.leerBase()
    const { resultado, conflictos, borrados } = fusionar3(base, local, remoto)
    try {
      alProgreso('Enviando cambios…')
      await conexion.guardar({ etiqueta: remoto.etiqueta, ...resultado, eliminados: borrados })
    } catch (e) {
      if (e.codigo === 409 && reintentos < 3) { reintentos++; continue }
      throw e
    }
    await almacen.escribirLocal(resultado)

    let bajados = 0, subidos = 0
    for (const d of remoto.docs || []) {
      if (await almacen.tieneDoc(d.ruta)) continue
      alProgreso(`Bajando ${d.ruta.split('/')[1]}…`)
      await almacen.guardarDoc(d.ruta, await conexion.bajarDoc(d.ruta))
      bajados++
    }
    const enPc = new Set((remoto.docs || []).map(d => d.ruta))
    for (const d of await almacen.docsLocales()) {
      if (enPc.has(d.ruta)) continue
      alProgreso(`Subiendo ${d.ruta.split('/')[1]}…`)
      await conexion.subirDoc(d.ruta, await almacen.leerDoc(d.ruta))
      subidos++
    }
    await almacen.guardarBase(resultado)
    return { conflictos: conflictos.length, bajados, subidos, reintentos }
  }
}
