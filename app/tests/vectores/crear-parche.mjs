// Vector de parches para comprobar que JS y Rust calculan lo mismo (receptor/sincro/tests/parche.rs).
// Uso: node tests/vectores/crear-parche.mjs  (solo si cambian los casos o el algoritmo)
import fs from 'node:fs'
import { CASOS } from './casos-parche.mjs'
import { diferencias, canonico, huella } from '../../src/lib/parche.js'
const casos = []
for (const c of CASOS) casos.push({ ...c, ops: diferencias(c.a, c.b), canonico: canonico(c.b), huella: await huella(c.b) })
fs.writeFileSync(new URL('./parche.json', import.meta.url), JSON.stringify(casos, null, 2) + '\n')
console.log(`Vector escrito en tests/vectores/parche.json (${casos.length} casos)`)
