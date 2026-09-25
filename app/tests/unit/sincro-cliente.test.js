// app/tests/unit/sincro-cliente.test.js — orquestación con una PC y un almacén falsos
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sincronizar } from '../../src/lib/sincro-cliente.js'

function almacenFalso(local = { proyectos: [], fuentes: [], citas: [] }, docs = {}) {
  const a = { local, base: null, docs: { ...docs } }
  return Object.assign(a, {
    leerLocal: () => structuredClone(a.local), escribirLocal: d => { a.local = structuredClone(d) },
    leerBase: () => a.base, guardarBase: d => { a.base = structuredClone(d) },
    docsLocales: () => Object.keys(a.docs).map(ruta => ({ ruta })), tieneDoc: ruta => ruta in a.docs,
    leerDoc: ruta => a.docs[ruta], guardarDoc: (ruta, b) => { a.docs[ruta] = b }
  })
}
function pcFalsa(datos, docs = {}, cambiaUnaVez = false) {
  const pc = { datos, docs: { ...docs }, etiqueta: 'v1', guardados: 0, eliminados: [] }
  return Object.assign(pc, {
    estado: async () => ({ etiqueta: pc.etiqueta, ...structuredClone(pc.datos), docs: Object.keys(pc.docs).map(ruta => ({ ruta, bytes: pc.docs[ruta].length })) }),
    guardar: async d => {
      if (cambiaUnaVez) { cambiaUnaVez = false; pc.etiqueta = 'v2'; const e = new Error('La PC cambió'); e.codigo = 409; throw e }
      if (d.etiqueta !== pc.etiqueta) { const e = new Error('La PC cambió'); e.codigo = 409; throw e }
      pc.datos = { proyectos: d.proyectos, fuentes: d.fuentes, citas: d.citas }; pc.eliminados.push(d.eliminados); pc.guardados++
      pc.etiqueta = 'v' + (pc.guardados + 2); return { etiqueta: pc.etiqueta }
    },
    bajarDoc: async ruta => pc.docs[ruta], subirDoc: async (ruta, b) => { pc.docs[ruta] = b }
  })
}
const f = id => ({ id, titulo: id, documento_original: `fuentes/${id}/documento.pdf` })

test('primera vez: el celular recibe todo y los documentos', async () => {
  const pc = pcFalsa({ proyectos: [], fuentes: [f('fuente_001')], citas: [] }, { 'fuentes/fuente_001/documento.pdf': new Uint8Array([1, 2]) })
  const al = almacenFalso()
  const r = await sincronizar({ conexion: pc, almacen: al })
  assert.equal(al.local.fuentes[0].id, 'fuente_001')
  assert.deepEqual([...al.docs['fuentes/fuente_001/documento.pdf']], [1, 2])
  assert.equal(r.bajados, 1)
  assert.deepEqual(al.base, al.local)
})

test('sube lo nuevo del celular y sus documentos', async () => {
  const pc = pcFalsa({ proyectos: [], fuentes: [], citas: [] })
  const al = almacenFalso({ proyectos: [], fuentes: [f('fuente_002')], citas: [] }, { 'fuentes/fuente_002/documento.pdf': new Uint8Array([9]) })
  const r = await sincronizar({ conexion: pc, almacen: al })
  assert.equal(pc.datos.fuentes[0].id, 'fuente_002')
  assert.ok(pc.docs['fuentes/fuente_002/documento.pdf'])
  assert.equal(r.subidos, 1)
})

test('si la PC cambió durante la sincronización, reintenta', async () => {
  const pc = pcFalsa({ proyectos: [], fuentes: [f('fuente_001')], citas: [] }, {}, true)
  const al = almacenFalso()
  const r = await sincronizar({ conexion: pc, almacen: al })
  assert.equal(r.reintentos, 1)
  assert.equal(pc.guardados, 1)
})

test('lo borrado en el celular se informa a la PC', async () => {
  const pc = pcFalsa({ proyectos: [], fuentes: [f('fuente_001'), f('fuente_002')], citas: [] })
  const al = almacenFalso()
  await sincronizar({ conexion: pc, almacen: al })
  al.local.fuentes = al.local.fuentes.filter(x => x.id !== 'fuente_002')
  await sincronizar({ conexion: pc, almacen: al })
  assert.deepEqual(pc.eliminados.at(-1).fuentes, ['fuente_002'])
  assert.deepEqual(pc.datos.fuentes.map(x => x.id), ['fuente_001'])
})
