// app/tests/unit/voz.test.js — conversión a PCM para el reconocedor de Android (src/lib/voz.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flotanteAPcm16 } from '../../src/lib/voz.js'

test('flotante → PCM 16 bits little-endian, con recorte', () => {
  const pcm = flotanteAPcm16(Float32Array.from([0, 1, -1, 0.5, 2, -3]))
  const v = new DataView(pcm.buffer)
  assert.equal(pcm.length, 12)
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => v.getInt16(i * 2, true)), [0, 32767, -32768, 16383, 32767, -32768])
  assert.equal(pcm[2], 0xff) // byte bajo primero
  assert.equal(pcm[3], 0x7f)
})
