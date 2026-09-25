// app/tests/unit/sincro-red.test.js — buscar la PC en la red si cambió su IP (src/lib/sincro-red.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ipDe, codigoCon, candidatas, buscarPc } from '../../src/lib/sincro-red.js'
import { claveNueva, importarClave, cifrarJson, descifrarJson } from '../../src/lib/cifrado.js'

const CLAVE = claveNueva()
const codigo = ip => `canvas-sync://${ip}:47481/#${CLAVE}`

/** Una red falsa: `pcs` = { ip: claveB64 } responden /sync/hola; el resto no contesta. */
function redFalsa(pcs) {
  const pedidas = []
  const fetchFn = async (url, opciones) => {
    const ip = new URL(url).hostname
    pedidas.push(ip)
    if (!pcs[ip]) throw new TypeError('Failed to fetch')
    const k = await importarClave(pcs[ip])
    try { await descifrarJson(k, opciones.headers['x-canvas-prueba']) } catch { return { ok: false, status: 401 } }
    const cuerpo = await cifrarJson(k, { app: 'canvas-sincro', v: 1 })
    return { ok: true, status: 200, text: async () => cuerpo }
  }
  return { fetchFn, pedidas }
}

test('ipDe y codigoCon', () => {
  assert.deepEqual(ipDe(codigo('192.168.1.5')), { ip: '192.168.1.5', puerto: '47481' })
  assert.equal(codigoCon(codigo('192.168.1.5'), '192.168.1.77'), codigo('192.168.1.77'))
})

test('candidatas: la IP anterior primero y toda su /24, sin repetir', () => {
  const c = candidatas('10.0.0.9')
  assert.equal(c[0], '10.0.0.9')
  assert.equal(c.length, 254)
  assert.equal(new Set(c).size, 254)
  assert.deepEqual(candidatas('pc-de-max.local'), [])
})

test('encuentra la PC en otra IP de la misma red', async () => {
  const { fetchFn } = redFalsa({ '192.168.1.140': CLAVE })
  assert.equal(await buscarPc({ codigo: codigo('192.168.1.5'), fetchFn }), codigo('192.168.1.140'))
})

test('no acepta un equipo que responde con otra clave', async () => {
  const { fetchFn } = redFalsa({ '192.168.1.20': claveNueva() })
  assert.equal(await buscarPc({ codigo: codigo('192.168.1.5'), fetchFn }), null)
})

test('sin PC en la red: null tras probar las 254 direcciones', async () => {
  const { fetchFn, pedidas } = redFalsa({})
  assert.equal(await buscarPc({ codigo: codigo('192.168.1.5'), fetchFn }), null)
  assert.equal(pedidas.length, 254)
})
