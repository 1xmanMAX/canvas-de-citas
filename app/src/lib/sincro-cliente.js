// Una sincronización completa con la PC (la "casa" del grupo de sincronización):
// traer lo que cambió en la PC, fusionar a tres vías con la base, enviar solo lo que cambió aquí
// (reintentando si la PC cambió entre medio), pasar documentos y guardar la nueva base.
// El almacén y la conexión se inyectan (app, pruebas, Android).
import { fusionar3, igual, COLECCIONES } from './sincro.js'
import { diferencias, aplicar, huella, pesoDe } from './parche.js'

/**
 * `aparato`: { id, nombre } de este aparato en el grupo. Con él (y un servidor que lo soporte) se
 * usa el protocolo v2, que envía solo lo que cambió; si no, el v1 (los JSON completos).
 */
export async function sincronizar({ conexion, almacen, alProgreso = () => {}, aparato = null }) {
  if (aparato && conexion.leer2) {
    try {
      return await sincronizarV2({ conexion, almacen, alProgreso, aparato })
    } catch (e) {
      if (e.codigo !== 404) throw e // servidor antiguo: se sigue con v1
    }
  }
  return sincronizarV1({ conexion, almacen, alProgreso })
}

/** Solo las colecciones que cambiaron (para no reescribir todo en el almacén local). */
function cambiadas(antes, despues) {
  const out = {}
  for (const c of COLECCIONES) if (!igual(antes?.[c] || [], despues[c])) out[c] = despues[c]
  return out
}

async function sincronizarV2({ conexion, almacen, alProgreso, aparato }) {
  let reintentos = 0, todo = false, sinBase = false
  for (;;) {
    alProgreso('Leyendo la PC…')
    const local = await almacen.leerLocal()
    const base = sinBase ? null : await almacen.leerBase()
    const r = await conexion.leer2({ dispositivo: aparato.id, nombre: aparato.nombre, base: base ? await huella(base) : null })
    let remoto
    try {
      remoto = r.modo === 'parche' ? aplicar(base, r.parche) : r.datos
    } catch { remoto = null }
    // Si al aplicar el parche no queda igual que en la PC, se pide todo (base perdida o distinta).
    if (!remoto || (await huella(remoto)) !== r.huella) {
      if (r.modo === 'parche' && !sinBase) { sinBase = true; continue }
      throw new Error('Los datos de la PC no llegaron completos')
    }
    const { resultado, conflictos, borrados } = fusionar3(base, local, remoto)
    const ops = diferencias(remoto, resultado)
    let w
    try {
      alProgreso(ops.length ? `Enviando ${ops.length} cambio${ops.length === 1 ? '' : 's'}…` : 'Sin cambios que enviar…')
      w = await conexion.escribir2(todo
        ? { dispositivo: aparato.id, etiqueta: r.etiqueta, datos: resultado, eliminados: borrados }
        : { dispositivo: aparato.id, etiqueta: r.etiqueta, parche: ops, huella: await huella(resultado), eliminados: borrados })
    } catch (e) {
      if (e.codigo === 409 && reintentos < 3) { reintentos++; continue }
      if (e.codigo === 422 && !todo) { todo = true; continue }
      throw e
    }
    const aqui = cambiadas(local, resultado)
    if (Object.keys(aqui).length) await almacen.escribirLocal(aqui)
    const { bajados, subidos } = await pasarDocs({ conexion, almacen, alProgreso, docsPc: r.docs })
    await almacen.guardarBase(resultado)
    return {
      conflictos: conflictos.length, bajados, subidos, reintentos,
      recibidos: r.modo === 'parche' ? r.parche.length : null,
      enviados: ops.length,
      bytes: pesoDe(r.modo === 'parche' ? r.parche : r.datos) + pesoDe(todo ? resultado : ops),
      grupo: w.grupo || r.grupo || []
    }
  }
}

async function sincronizarV1({ conexion, almacen, alProgreso }) {
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
    const { bajados, subidos } = await pasarDocs({ conexion, almacen, alProgreso, docsPc: remoto.docs })
    await almacen.guardarBase(resultado)
    return { conflictos: conflictos.length, bajados, subidos, reintentos }
  }
}

/** Documentos (PDF/HTML): baja los que faltan aquí y sube los que faltan en la PC. */
async function pasarDocs({ conexion, almacen, alProgreso, docsPc = [] }) {
  let bajados = 0, subidos = 0
  for (const d of docsPc) {
    if (await almacen.tieneDoc(d.ruta)) continue
    alProgreso(`Bajando ${d.ruta.split('/')[1]}…`)
    await almacen.guardarDoc(d.ruta, await conexion.bajarDoc(d.ruta))
    bajados++
  }
  const enPc = new Set(docsPc.map(d => d.ruta))
  for (const d of await almacen.docsLocales()) {
    if (enPc.has(d.ruta)) continue
    alProgreso(`Subiendo ${d.ruta.split('/')[1]}…`)
    await conexion.subirDoc(d.ruta, await almacen.leerDoc(d.ruta))
    subidos++
  }
  return { bajados, subidos }
}
