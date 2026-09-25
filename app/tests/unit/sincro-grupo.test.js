// app/tests/unit/sincro-grupo.test.js — grupo de sincronización: varios aparatos contra la PC,
// enviando solo lo que cambió (protocolo v2 de src/lib/sincro-cliente.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sincronizar } from '../../src/lib/sincro-cliente.js'
import { diferencias, aplicar, huella } from '../../src/lib/parche.js'

const vacio = () => ({ proyectos: [], fuentes: [], citas: [] })
const soloDatos = d => ({ proyectos: d.proyectos, fuentes: d.fuentes, citas: d.citas })
const clon = x => structuredClone(x)
const error = codigo => Object.assign(new Error('HTTP ' + codigo), { codigo })

/** PC falsa con el protocolo v2 (misma lógica que receptor/sincro). */
function pcFalsa(datos = vacio(), { fallarHuellaUnaVez = false } = {}) {
  const pc = { datos: clon(datos), version: 1, bases: {}, escrituras: [], docs: {} }
  return Object.assign(pc, {
    async leer2({ dispositivo, base }) {
      const r = { etiqueta: 'v' + pc.version, huella: await huella(pc.datos), docs: [], grupo: [] }
      const suya = pc.bases[dispositivo]
      if (suya && base === (await huella(suya))) return { ...r, modo: 'parche', parche: diferencias(suya, pc.datos) }
      return { ...r, modo: 'completo', datos: clon(pc.datos) }
    },
    async escribir2(p) {
      if (p.etiqueta !== 'v' + pc.version) throw error(409)
      let res
      if (p.datos) res = soloDatos(clon(p.datos))
      else {
        res = aplicar(pc.datos, p.parche)
        if (fallarHuellaUnaVez) { fallarHuellaUnaVez = false; throw error(422) }
        if (p.huella !== (await huella(res))) throw error(422)
      }
      pc.escrituras.push(p)
      if (JSON.stringify(res) !== JSON.stringify(pc.datos)) pc.version++
      pc.datos = res
      pc.bases[p.dispositivo] = clon(res)
      return { etiqueta: 'v' + pc.version, grupo: [] }
    },
    bajarDoc: async r => pc.docs[r], subirDoc: async (r, b) => { pc.docs[r] = b }
  })
}

function aparato(id, local = vacio()) {
  const a = { id, nombre: id, local: clon(local), base: null }
  a.almacen = {
    leerLocal: () => clon(a.local), escribirLocal: d => { a.local = { ...a.local, ...clon(d) } },
    leerBase: () => a.base, guardarBase: d => { a.base = clon(d) },
    docsLocales: () => [], tieneDoc: () => true, leerDoc: () => null, guardarDoc: () => {}
  }
  a.sincronizar = pc => sincronizar({ conexion: pc, almacen: a.almacen, aparato: { id, nombre: id } })
  return a
}
const proyecto = notas => ({ id: 'p1', titulo: 'Tesis', canvas: { notas, posiciones: {} } })

test('primera vez recibe todo; después, sin cambios no viaja nada', async () => {
  const pc = pcFalsa({ ...vacio(), fuentes: [{ id: 'f1', titulo: 'A' }] })
  const cel = aparato('cel')
  const r1 = await cel.sincronizar(pc)
  assert.equal(r1.recibidos, null) // completo
  assert.deepEqual(cel.local.fuentes, [{ id: 'f1', titulo: 'A' }])
  const r2 = await cel.sincronizar(pc)
  assert.equal(r2.recibidos, 0)
  assert.equal(r2.enviados, 0)
  assert.ok(r2.bytes < 10, `viajaron ${r2.bytes} bytes`)
})

test('celular y laptop editan a la vez y todos terminan con la misma versión', async () => {
  const pc = pcFalsa({ ...vacio(), proyectos: [proyecto([{ id: 'n0', texto: 'base', x: 0 }])] })
  const cel = aparato('cel'), lap = aparato('lap')
  await cel.sincronizar(pc); await lap.sincronizar(pc)
  // Sin conexión: cada uno agrega una nota y el celular mueve la de base.
  cel.local.proyectos[0].canvas.notas.push({ id: 'n_cel', texto: 'desde el celular' })
  cel.local.proyectos[0].canvas.notas[0].x = 50
  lap.local.proyectos[0].canvas.notas.push({ id: 'n_lap', texto: 'desde la laptop' })
  lap.local.fuentes.push({ id: 'f_lap', titulo: 'Paper nuevo' })
  const r1 = await cel.sincronizar(pc)
  assert.ok(r1.enviados >= 2 && r1.enviados <= 3, `el celular envió ${r1.enviados} cambios`)
  await lap.sincronizar(pc)
  await cel.sincronizar(pc) // recoge lo de la laptop
  for (const a of [cel, lap]) assert.deepEqual(a.local, pc.datos, a.id)
  assert.deepEqual(pc.datos.proyectos[0].canvas.notas.map(n => n.id).sort(), ['n0', 'n_cel', 'n_lap'])
  assert.equal(pc.datos.proyectos[0].canvas.notas.find(n => n.id === 'n0').x, 50)
  assert.equal(pc.datos.fuentes[0].id, 'f_lap')
})

test('un cambio en la PC llega como parche de una sola operación', async () => {
  const pc = pcFalsa({ ...vacio(), fuentes: [{ id: 'f1', titulo: 'A', anio: 2020 }] })
  const cel = aparato('cel')
  await cel.sincronizar(pc)
  pc.datos.fuentes[0].anio = 2024; pc.version++
  const r = await cel.sincronizar(pc)
  assert.equal(r.recibidos, 1)
  assert.equal(cel.local.fuentes[0].anio, 2024)
})

test('si la PC no puede aplicar el parche, se envía todo', async () => {
  const pc = pcFalsa(vacio(), { fallarHuellaUnaVez: true })
  const cel = aparato('cel', { ...vacio(), citas: [{ id: 'c1', texto: 'x' }] })
  await cel.sincronizar(pc)
  assert.ok(pc.escrituras.at(-1).datos, 'la última escritura fue completa')
  assert.deepEqual(pc.datos.citas, [{ id: 'c1', texto: 'x' }])
})

test('con un servidor antiguo (sin v2) usa el protocolo anterior', async () => {
  const antiguo = {
    datos: { ...vacio(), fuentes: [{ id: 'f1' }] },
    leer2: async () => { throw error(404) },
    estado: async () => ({ etiqueta: 'e', ...clon(antiguo.datos), docs: [] }),
    guardar: async d => { antiguo.datos = soloDatos(d); return { etiqueta: 'e2' } }
  }
  const cel = aparato('cel')
  await cel.sincronizar(antiguo)
  assert.deepEqual(cel.local.fuentes, [{ id: 'f1' }])
})
