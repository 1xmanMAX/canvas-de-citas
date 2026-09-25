// app/tests/vectores/crear-cifrado.mjs — vector fijo para comprobar que JS y Rust cifran igual.
// Uso: node tests/vectores/crear-cifrado.mjs  (solo si cambia el formato; el .json se versiona)
import fs from 'node:fs'
import { importarClave, cifrarBytes, b64 } from '../../src/lib/cifrado.js'
const clave = b64.a(Uint8Array.from({ length: 32 }, (_, i) => i))
const iv = Uint8Array.from({ length: 12 }, (_, i) => i + 1)
const ahora = 1760000000000, texto = '{"hola":"canvas","ñ":1}'
const sobre = await cifrarBytes(await importarClave(clave), new TextEncoder().encode(texto), iv, ahora)
fs.writeFileSync(new URL('./cifrado.json', import.meta.url), JSON.stringify({ clave, iv: b64.a(iv), ahora, texto, sobre: b64.a(sobre) }, null, 2) + '\n')
console.log('Vector escrito en tests/vectores/cifrado.json')
