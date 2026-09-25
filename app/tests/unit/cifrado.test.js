// app/tests/unit/cifrado.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { claveNueva, importarClave, cifrarJson, descifrarJson, cifrarBytes, descifrarBytes, b64, EDAD_MAX } from '../../src/lib/cifrado.js'

test('ida y vuelta de JSON', async () => {
  const k = await importarClave(claveNueva())
  assert.deepEqual(await descifrarJson(k, await cifrarJson(k, { a: 1, t: 'ñandú' })), { a: 1, t: 'ñandú' })
})

test('otra clave no puede leerlo', async () => {
  const k1 = await importarClave(claveNueva()), k2 = await importarClave(claveNueva())
  await assert.rejects(descifrarJson(k2, await cifrarJson(k1, { a: 1 })), /Clave incorrecta/)
})

test('un byte alterado se detecta', async () => {
  const k = await importarClave(claveNueva())
  const s = await cifrarBytes(k, new Uint8Array([1, 2, 3]))
  s[s.length - 1] ^= 1
  await assert.rejects(descifrarBytes(k, s), /alterado/)
})

test('mensajes viejos se rechazan (relojes desincronizados)', async () => {
  const k = await importarClave(claveNueva())
  const s = await cifrarBytes(k, new Uint8Array([7]), undefined, Date.now() - EDAD_MAX - 1000)
  await assert.rejects(descifrarBytes(k, s), /revisa la hora/)
})

test('la clave debe tener 32 bytes', async () => {
  await assert.rejects(importarClave(b64.a(new Uint8Array(16))), /32 bytes/)
})

test('el vector compartido con Rust sigue siendo válido', async () => {
  const v = JSON.parse(fs.readFileSync(new URL('../vectores/cifrado.json', import.meta.url), 'utf8'))
  const k = await importarClave(v.clave)
  const s = await cifrarBytes(k, new TextEncoder().encode(v.texto), b64.de(v.iv), v.ahora)
  assert.equal(b64.a(s), v.sobre)
  assert.equal(new TextDecoder().decode(await descifrarBytes(k, b64.de(v.sobre), v.ahora)), v.texto)
})
