// app/tests/integracion/sincro.test.js — cliente JS ↔ servidor Rust real (receptor/sincro).
// Requiere cargo. Ejecutar: npm run test:integracion
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { leerCodigo, crearConexion } from '../../src/lib/sincro-http.js'
import { sincronizar } from '../../src/lib/sincro-cliente.js'
import { buscarPc } from '../../src/lib/sincro-red.js'

const CRATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../receptor/sincro')
let proceso, carpeta, codigo

before(async () => {
  const b = spawnSync('cargo', ['build', '--release', '--quiet'], { cwd: CRATE, stdio: 'inherit' })
  assert.equal(b.status, 0, 'cargo build falló')
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-sincro-'))
  fs.writeFileSync(path.join(carpeta, 'fuentes.json'), JSON.stringify({ fuentes: [{ id: 'fuente_001', titulo: 'En la PC', documento_original: 'fuentes/fuente_001/documento.pdf' }] }, null, 2) + '\n')
  fs.mkdirSync(path.join(carpeta, 'fuentes', 'fuente_001'), { recursive: true })
  fs.writeFileSync(path.join(carpeta, 'fuentes', 'fuente_001', 'documento.pdf'), '%PDF-1.4 de la PC')
  const bin = path.join(CRATE, 'target', 'release', process.platform === 'win32' ? 'canvas-sincro.exe' : 'canvas-sincro')
  proceso = spawn(bin, ['--carpeta', carpeta, '--puerto', '0'])
  const linea = await new Promise(res => proceso.stdout.once('data', d => res(String(d).split('\n')[0])))
  const info = JSON.parse(linea)
  codigo = `canvas-sync://127.0.0.1:${info.puerto}/#${info.clave}`
})
after(() => proceso?.kill())

test('celular vacío ↔ PC real: trae datos y documento, luego sube una fuente nueva', async () => {
  const { url, clave } = leerCodigo(codigo)
  const conexion = await crearConexion({ url, clave })
  const mem = { local: { proyectos: [], fuentes: [], citas: [] }, base: null, docs: {} }
  const almacen = {
    leerLocal: () => structuredClone(mem.local), escribirLocal: d => { mem.local = structuredClone(d) },
    leerBase: () => mem.base, guardarBase: d => { mem.base = structuredClone(d) },
    docsLocales: () => Object.keys(mem.docs).map(ruta => ({ ruta })), tieneDoc: r => r in mem.docs,
    leerDoc: r => mem.docs[r], guardarDoc: (r, b) => { mem.docs[r] = b }
  }
  const r1 = await sincronizar({ conexion, almacen })
  assert.equal(mem.local.fuentes[0].titulo, 'En la PC')
  assert.equal(new TextDecoder().decode(mem.docs['fuentes/fuente_001/documento.pdf']), '%PDF-1.4 de la PC')
  assert.equal(r1.bajados, 1)

  mem.local.fuentes.push({ id: 'fuente_002', titulo: 'Del celular' })
  await sincronizar({ conexion, almacen })
  const enDisco = JSON.parse(fs.readFileSync(path.join(carpeta, 'fuentes.json'), 'utf8'))
  assert.deepEqual(enDisco.fuentes.map(f => f.id), ['fuente_001', 'fuente_002'])
})

test('con otra clave la PC rechaza', async () => {
  const { url } = leerCodigo(codigo)
  const otra = await crearConexion({ url, clave: Buffer.alloc(32, 7).toString('base64') })
  await assert.rejects(otra.estado(), /vuelve a vincularlo/)
})

test('hola responde con la clave correcta y la búsqueda encuentra la PC', async () => {
  const { url, clave } = leerCodigo(codigo)
  assert.deepEqual(await (await crearConexion({ url, clave })).hola(), { app: 'canvas-sincro', v: 1 })
  // Código con una IP vieja de 127.0.0.x: la búsqueda la encuentra en 127.0.0.1.
  const viejo = codigo.replace('127.0.0.1', '127.0.0.9')
  assert.equal(await buscarPc({ codigo: viejo, tiempo: 500 }), codigo)
})
