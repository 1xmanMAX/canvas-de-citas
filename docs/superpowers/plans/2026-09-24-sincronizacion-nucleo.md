# Núcleo de sincronización PC ↔ celular — Plan de implementación (Plan 1 de 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que dos instancias de Canvas de Citas (celular y PC) se sincronicen por la red local con una fusión a tres vías, cifrada, contra un servidor Rust que lee y escribe la carpeta de datos de la PC.

**Architecture:** La lógica vive en JavaScript puro y probado (`sincro.js` fusión, `cifrado.js` AES-GCM, `sincro-http.js` conexión, `sincro-cliente.js` orquestación) y se usa desde la app con un adaptador del almacén. El servidor es un crate Rust **sin PixPin** (`receptor/sincro`, binario `canvas-sincro`) que compila y se prueba en Linux; en la PC de Max se integra al receptor de Windows (Tarea 8, fuera de la nube). El empaquetado Android (Capacitor) es el Plan 2.

**Tech Stack:** Svelte 5 + Vite (app existente), WebCrypto (AES-256-GCM), `node:test`; Rust 2021 con `aes-gcm 0.10`, `tiny_http 0.12`, `serde_json` (`preserve_order`), `sha2`, `base64 0.22`, `getrandom 0.2`.

**Spec:** `docs/superpowers/specs/2026-09-24-android-sincronizacion-design.md` (léelo antes de empezar) y `CLAUDE.md` en la raíz.

## Global Constraints

- Idioma: nombres de funciones, comentarios, mensajes de UI y commits **en español** (como el resto del repo).
- La app debe seguir ligera: **ninguna dependencia nueva en `app/`** para esta parte (WebCrypto y `fetch` son nativos).
- Formato de los JSON de la carpeta: `{"<coleccion>": [...]}` con 2 espacios y salto de línea final, **mismo orden de claves** que envía la app (el contrato con la skill `citas-tesis` no cambia).
- Puerto de sincronización en la red local: **47481**. Esquema del código de vinculación: `canvas-sync://<ip>:<puerto>/#<clave base64>`.
- Cifrado: AES-256-GCM, IV de 12 bytes al inicio, datos adicionales `canvas-sincro-v1`, marca de tiempo de 8 bytes (ms, big-endian) antes del contenido, **ventana de 5 minutos**.
- Conflicto (ambos lados cambiaron lo mismo): **gana el lado que sincroniza (celular)**; borrado contra edición: **gana la edición**.
- Nunca escribir en el repo de PixPin; el crate `receptor/sincro` no depende de PixPin.
- Commits con `git -c user.email=139194352+1xmanMAX@users.noreply.github.com commit …` y la línea de sesión que indique el entorno.

## Review Focus

- **Relojes desincronizados** (celular y PC con >5 min de diferencia): se espera un error claro "revisa la hora", no un fallo genérico → prueba en Tarea 2 (`vencido`).
- **Primera sincronización con datos en ambos lados** (p. ej. los dos cargaron el ejemplo): no debe perder datos ni romperse; los choques se cuentan → prueba en Tarea 1 (`primera sincronización con datos en ambos lados`).
- **La PC guarda mientras el celular sincroniza** (Comet abierto): el servidor responde 409 y el cliente reintenta → pruebas en Tareas 5 (409) y 6 (reintento).
- **Rutas maliciosas o rotas** en `/sync/doc` (`../`, rutas absolutas): 400 sin tocar nada fuera de la carpeta → prueba en Tarea 4.
- **Documentos grandes** (PDF de 20 MB): pasan completos; lo que excede el tope responde 413 → prueba en Tarea 5 (tope pequeño).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/src/lib/sincro.js` | Fusión a tres vías pura (`igual`, `fusionar3`) |
| `app/src/lib/cifrado.js` | AES-GCM con WebCrypto (`importarClave`, `claveNueva`, `cifrarBytes`/`descifrarBytes`, `cifrarJson`/`descifrarJson`) |
| `app/tests/vectores/crear-cifrado.mjs` → `cifrado.json` | Vector de prueba compartido JS ↔ Rust |
| `receptor/sincro/` (crate `canvas-sincro`) | `cifrado.rs`, `carpeta.rs` (leer/escribir la carpeta), `servidor.rs` (HTTP), `main.rs` (binario) |
| `app/src/lib/sincro-http.js` | Conexión cifrada con el servidor (`leerCodigo`, `crearConexion`) |
| `app/src/lib/sincro-cliente.js` | Orquestación (`sincronizar`) con almacén inyectado |
| `app/src/lib/sincro-almacen.js` | Adaptador del almacén de la app (IndexedDB) |
| `app/src/components/Sincronizar.svelte` | Pantalla "Sincronizar con la PC" (dentro de Configuración) |
| `app/tests/unit/*.test.js`, `app/tests/integracion/sincro.test.js`, `app/tests/e2e/todas.mjs` | Pruebas |

---

### Task 1: Fusión a tres vías

**Files:**
- Create: `app/src/lib/sincro.js`
- Test: `app/tests/unit/sincro.test.js`

**Interfaces:**
- Produces: `igual(a, b) → boolean`; `fusionar3(base, local, remoto) → { resultado: {proyectos, fuentes, citas}, conflictos: [{ruta, tipo}], borrados: {proyectos: string[], fuentes: string[], citas: string[]} }`. `base`/`local`/`remoto` son objetos `{proyectos, fuentes, citas}` (arreglos de objetos con `id`); `base` puede ser `null` (primera vez). `borrados` = ids que estaban en `remoto` y no quedan en `resultado` (la PC debe borrarlos).

- [x] **Step 1: Escribir las pruebas (fallan)**

```js
// app/tests/unit/sincro.test.js — fusión a tres vías (src/lib/sincro.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fusionar3, igual } from '../../src/lib/sincro.js'

const fuente = (id, extra = {}) => ({ id, titulo: `T ${id}`, anio: 2020, ...extra })
const proyecto = (canvas = {}) => ({ id: 'proyecto_001', titulo: 'Tesis', canvas: { modo: 'libre', posiciones: {}, notas: [], conexiones: [], objetivos: {}, ...canvas } })
const datos = (fuentes = [], proyectos = [], citas = []) => ({ proyectos, fuentes, citas })

test('igual ignora el orden de las claves', () => {
  assert.ok(igual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }))
  assert.ok(!igual({ a: 1 }, { a: 2 }))
})

test('primera sincronización con el celular vacío trae todo de la PC', () => {
  const pc = datos([fuente('fuente_001')], [proyecto()])
  const r = fusionar3(null, datos(), pc)
  assert.deepEqual(r.resultado.fuentes, pc.fuentes)
  assert.deepEqual(r.resultado.proyectos, pc.proyectos)
  assert.equal(r.conflictos.length, 0)
  assert.deepEqual(r.borrados, { proyectos: [], fuentes: [], citas: [] })
})

test('primera sincronización con datos en ambos lados no pierde nada', () => {
  const r = fusionar3(null, datos([fuente('fuente_001', { anio: 2021 })]), datos([fuente('fuente_001'), fuente('fuente_002')]))
  assert.equal(r.resultado.fuentes.length, 2)
  assert.equal(r.resultado.fuentes[0].anio, 2021) // choque: gana el celular
  assert.equal(r.conflictos.length, 1)
})

test('cambios en campos distintos de la misma fuente se combinan', () => {
  const base = datos([fuente('fuente_001')])
  const r = fusionar3(base, datos([fuente('fuente_001', { titulo: 'Nuevo título' })]), datos([fuente('fuente_001', { anio: 2024 })]))
  assert.deepEqual(r.resultado.fuentes[0], fuente('fuente_001', { titulo: 'Nuevo título', anio: 2024 }))
  assert.equal(r.conflictos.length, 0)
})

test('mismo campo cambiado en ambos lados: gana el celular y se cuenta', () => {
  const base = datos([fuente('fuente_001')])
  const r = fusionar3(base, datos([fuente('fuente_001', { anio: 2001 })]), datos([fuente('fuente_001', { anio: 2002 })]))
  assert.equal(r.resultado.fuentes[0].anio, 2001)
  assert.deepEqual(r.conflictos, [{ ruta: 'fuentes[fuente_001].anio', tipo: 'ambos-cambiaron' }])
})

test('lo que borra el celular se borra y se informa a la PC', () => {
  const base = datos([fuente('fuente_001'), fuente('fuente_002')])
  const r = fusionar3(base, datos([fuente('fuente_001')]), base)
  assert.deepEqual(r.resultado.fuentes.map(f => f.id), ['fuente_001'])
  assert.deepEqual(r.borrados.fuentes, ['fuente_002'])
})

test('lo que borró la PC desaparece del celular', () => {
  const base = datos([fuente('fuente_001'), fuente('fuente_002')])
  const r = fusionar3(base, base, datos([fuente('fuente_002')]))
  assert.deepEqual(r.resultado.fuentes.map(f => f.id), ['fuente_002'])
  assert.deepEqual(r.borrados.fuentes, [])
})

test('borrado contra edición: se conserva la edición', () => {
  const base = datos([fuente('fuente_001')])
  const r = fusionar3(base, datos([]), datos([fuente('fuente_001', { anio: 1999 })]))
  assert.equal(r.resultado.fuentes[0].anio, 1999)
  assert.equal(r.conflictos[0].tipo, 'borrado-vs-edicion')
})

test('notas nuevas en ambos lados del mismo lienzo se conservan todas', () => {
  const base = datos([], [proyecto()])
  const l = datos([], [proyecto({ notas: [{ id: 'nota_a', texto: 'A', x: 0, y: 0 }] })])
  const r = datos([], [proyecto({ notas: [{ id: 'nota_b', texto: 'B', x: 9, y: 9 }] })])
  const res = fusionar3(base, l, r)
  assert.deepEqual(res.resultado.proyectos[0].canvas.notas.map(n => n.id), ['nota_a', 'nota_b'])
  assert.equal(res.conflictos.length, 0)
})

test('posiciones y sub-lienzos de objetivos se combinan por clave', () => {
  const base = datos([], [proyecto({ posiciones: { fuente_001: { x: 0, y: 0 } }, objetivos: { oe1: { notas: [] } } })])
  const l = datos([], [proyecto({ posiciones: { fuente_001: { x: 50, y: 0 } }, objetivos: { oe1: { notas: [{ id: 'nota_c', texto: 'C' }] } } })])
  const r = datos([], [proyecto({ posiciones: { fuente_001: { x: 0, y: 0 }, fuente_002: { x: 7, y: 7 } }, objetivos: { oe1: { notas: [] }, oe2: { notas: [] } } })])
  const c = fusionar3(base, l, r).resultado.proyectos[0].canvas
  assert.deepEqual(c.posiciones, { fuente_001: { x: 50, y: 0 }, fuente_002: { x: 7, y: 7 } })
  assert.deepEqual(Object.keys(c.objetivos).sort(), ['oe1', 'oe2'])
  assert.equal(c.objetivos.oe1.notas[0].id, 'nota_c')
})
```

- [x] **Step 2: Correr y ver que fallan**

Run: `cd app && npm test`
Expected: FAIL — `Cannot find module '../../src/lib/sincro.js'`

- [x] **Step 3: Implementar**

```js
// app/src/lib/sincro.js
// Fusión a tres vías de los datos de Canvas de Citas. `base` es cómo quedaron los datos en la
// última sincronización; se compara elemento por elemento (por `id` en las listas, por clave en
// los objetos). Si solo un lado cambió algo, gana ese lado; si ambos cambiaron lo mismo, gana el
// local (quien sincroniza) y se anota el conflicto; entre borrar y editar, gana la edición.
export const COLECCIONES = ['proyectos', 'fuentes', 'citas']

export function igual(a, b) {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => igual(x, b[i]))
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined)
  return ka.length === kb.length && ka.every(k => igual(a[k], b[k]))
}

const esObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const conIds = v => v === undefined || (Array.isArray(v) && v.every(x => esObjeto(x) && typeof x.id === 'string'))

function fusionarValor(b, l, r, ruta, conflictos) {
  if (igual(l, r)) return l
  if (igual(b, l)) return r
  if (igual(b, r)) return l
  // Ambos lados cambiaron.
  if (l === undefined || r === undefined) {
    conflictos.push({ ruta, tipo: 'borrado-vs-edicion' })
    return l === undefined ? r : l
  }
  if (esObjeto(l) && esObjeto(r) && (b === undefined || esObjeto(b))) {
    const out = {}
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const v = fusionarValor(b?.[k], l[k], r[k], `${ruta}.${k}`, conflictos)
      if (v !== undefined) out[k] = v
    }
    return out
  }
  if (Array.isArray(l) && Array.isArray(r) && conIds(l) && conIds(r) && conIds(b)) return fusionarLista(b || [], l, r, ruta, conflictos)
  conflictos.push({ ruta, tipo: 'ambos-cambiaron' })
  return l
}

function fusionarLista(b, l, r, ruta, conflictos) {
  const mb = new Map(b.map(x => [x.id, x])), ml = new Map(l.map(x => [x.id, x])), mr = new Map(r.map(x => [x.id, x]))
  const orden = [...l.map(x => x.id), ...r.filter(x => !ml.has(x.id)).map(x => x.id)]
  const out = []
  for (const id of orden) {
    const v = fusionarValor(mb.get(id), ml.get(id), mr.get(id), `${ruta}[${id}]`, conflictos)
    if (v !== undefined) out.push(v)
  }
  return out
}

export function fusionar3(base, local, remoto) {
  const conflictos = [], resultado = {}, borrados = {}
  for (const c of COLECCIONES) {
    const r = remoto?.[c] || []
    resultado[c] = fusionarLista(base?.[c] || [], local?.[c] || [], r, c, conflictos)
    const quedan = new Set(resultado[c].map(x => x.id))
    borrados[c] = r.filter(x => !quedan.has(x.id)).map(x => x.id)
  }
  return { resultado, conflictos, borrados }
}
```

- [x] **Step 4: Correr y ver que pasan**

Run: `cd app && npm test`
Expected: PASS (todas, incluidas las de `referencias.test.js`)

- [x] **Step 5: Commit**

```bash
git add app/src/lib/sincro.js app/tests/unit/sincro.test.js
git commit -m "Sincronización: fusión a tres vías con pruebas"
```

---

### Task 2: Cifrado en JavaScript y vector compartido

**Files:**
- Create: `app/src/lib/cifrado.js`, `app/tests/vectores/crear-cifrado.mjs`, `app/tests/vectores/cifrado.json` (generado)
- Test: `app/tests/unit/cifrado.test.js`

**Interfaces:**
- Produces: `claveNueva() → string` (base64 de 32 bytes); `importarClave(b64) → Promise<CryptoKey>`; `cifrarBytes(clave, bytes, iv?, ahora?) → Promise<Uint8Array>`; `descifrarBytes(clave, sobre, ahora?) → Promise<Uint8Array>`; `cifrarJson(clave, obj, iv?, ahora?) → Promise<string>`; `descifrarJson(clave, texto, ahora?) → Promise<any>`; `b64.a(Uint8Array) → string`, `b64.de(string) → Uint8Array`; `EDAD_MAX` (ms). Errores con mensajes: `'Clave incorrecta o mensaje alterado'`, `'Mensaje vencido (revisa la hora del celular y de la PC)'`, `'La clave debe tener 32 bytes'`.
- Produces (archivo): `app/tests/vectores/cifrado.json` = `{ clave, iv, ahora, texto, sobre }` (base64 salvo `ahora` número y `texto` string).

- [x] **Step 1: Escribir las pruebas (fallan)**

```js
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
```

- [x] **Step 2: Correr y ver que fallan**

Run: `cd app && npm test`
Expected: FAIL — no existe `src/lib/cifrado.js`

- [x] **Step 3: Implementar el cifrado**

```js
// app/src/lib/cifrado.js
// Cifrado de la sincronización: AES-256-GCM (WebCrypto). Sobre = IV (12 bytes) + texto cifrado
// con etiqueta. El contenido lleva delante la hora (8 bytes, ms, big-endian): se rechaza lo que
// tenga más de EDAD_MAX de diferencia (contra repeticiones). Mismo formato que receptor/sincro.
const AAD = new TextEncoder().encode('canvas-sincro-v1')
export const EDAD_MAX = 5 * 60 * 1000

export const b64 = {
  a(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) },
  de(s) { return Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0)) }
}

export const claveNueva = () => b64.a(crypto.getRandomValues(new Uint8Array(32)))

export async function importarClave(claveB64) {
  const raw = b64.de(claveB64)
  if (raw.length !== 32) throw new Error('La clave debe tener 32 bytes')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function cifrarBytes(clave, bytes, iv = crypto.getRandomValues(new Uint8Array(12)), ahora = Date.now()) {
  const plano = new Uint8Array(8 + bytes.length)
  new DataView(plano.buffer).setBigUint64(0, BigInt(ahora))
  plano.set(bytes, 8)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, clave, plano))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return out
}

export async function descifrarBytes(clave, sobre, ahora = Date.now()) {
  if (sobre.length < 12 + 8 + 16) throw new Error('Clave incorrecta o mensaje alterado')
  let plano
  try {
    plano = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sobre.subarray(0, 12), additionalData: AAD }, clave, sobre.subarray(12)))
  } catch { throw new Error('Clave incorrecta o mensaje alterado') }
  const t = Number(new DataView(plano.buffer, plano.byteOffset).getBigUint64(0))
  if (Math.abs(ahora - t) > EDAD_MAX) throw new Error('Mensaje vencido (revisa la hora del celular y de la PC)')
  return plano.subarray(8)
}

export const cifrarJson = async (clave, obj, iv, ahora) => b64.a(await cifrarBytes(clave, new TextEncoder().encode(JSON.stringify(obj)), iv, ahora))
export const descifrarJson = async (clave, texto, ahora) => JSON.parse(new TextDecoder().decode(await descifrarBytes(clave, b64.de(texto), ahora)))
```

- [x] **Step 4: Generar el vector compartido**

```js
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
```

Run: `cd app && node tests/vectores/crear-cifrado.mjs`
Expected: `Vector escrito en tests/vectores/cifrado.json`

- [x] **Step 5: Correr las pruebas**

Run: `cd app && npm test`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add app/src/lib/cifrado.js app/tests/unit/cifrado.test.js app/tests/vectores/
git commit -m "Sincronización: cifrado AES-GCM en JavaScript con vector compartido"
```

---

### Task 3: Crate `canvas-sincro` — cifrado compatible en Rust

**Files:**
- Create: `receptor/sincro/Cargo.toml`, `receptor/sincro/src/lib.rs`, `receptor/sincro/src/cifrado.rs`, `receptor/sincro/.gitignore`
- Test: `receptor/sincro/tests/cifrado.rs`

**Interfaces:**
- Consumes: `app/tests/vectores/cifrado.json` (Tarea 2).
- Produces: `canvas_sincro::cifrado::{Clave, ErrorCifrado, ahora_ms, EDAD_MAX_MS}`; `Clave::desde_base64(&str) -> Result<Clave, ErrorCifrado>`, `Clave::nueva() -> (Clave, String)`, `cifrar(&self, &[u8]) -> Vec<u8>`, `cifrar_con(&self, &[u8], [u8; 12], u64) -> Vec<u8>`, `descifrar(&self, &[u8]) -> Result<Vec<u8>, ErrorCifrado>`, `descifrar_en(&self, &[u8], u64) -> Result<…>`, `cifrar_json(&self, &Value) -> String`, `descifrar_json(&self, &str) -> Result<Value, ErrorCifrado>`.

- [x] **Step 1: Crear el crate y la prueba (falla)**

```toml
# receptor/sincro/Cargo.toml
[package]
name = "canvas-sincro"
version = "0.1.0"
edition = "2021"
description = "Sincronización por Wi-Fi de Canvas de Citas (sin PixPin: compila y se prueba en cualquier sistema)"
publish = false

# Proyecto propio: no pertenece al workspace del receptor (que depende de PixPin).
[workspace]

[dependencies]
aes-gcm = "0.10.3"
base64 = "0.22"
getrandom = "0.2"
serde_json = { version = "1.0", features = ["preserve_order"] }
sha2 = "0.10"
tiny_http = "0.12"

[dev-dependencies]
tempfile = "3"
```

```
# receptor/sincro/.gitignore
target/
```

```rust
// receptor/sincro/src/lib.rs
//! Sincronización por la red local de Canvas de Citas: cifrado compatible con la app
//! (`app/src/lib/cifrado.js`), acceso a la carpeta de datos y servidor HTTP.
pub mod cifrado;
```

```rust
// receptor/sincro/tests/cifrado.rs
use base64::{engine::general_purpose::STANDARD, Engine};
use canvas_sincro::cifrado::{Clave, ErrorCifrado, EDAD_MAX_MS};

fn vector() -> serde_json::Value {
    let ruta = concat!(env!("CARGO_MANIFEST_DIR"), "/../../app/tests/vectores/cifrado.json");
    serde_json::from_str(&std::fs::read_to_string(ruta).expect("falta el vector (Tarea 2)")).unwrap()
}

#[test]
fn cifra_igual_que_javascript() {
    let v = vector();
    let clave = Clave::desde_base64(v["clave"].as_str().unwrap()).unwrap();
    let iv: [u8; 12] = STANDARD.decode(v["iv"].as_str().unwrap()).unwrap().try_into().unwrap();
    let ahora = v["ahora"].as_u64().unwrap();
    let sobre = clave.cifrar_con(v["texto"].as_str().unwrap().as_bytes(), iv, ahora);
    assert_eq!(STANDARD.encode(&sobre), v["sobre"].as_str().unwrap());
    let plano = clave.descifrar_en(&sobre, ahora).unwrap();
    assert_eq!(String::from_utf8(plano).unwrap(), v["texto"].as_str().unwrap());
}

#[test]
fn ida_y_vuelta_json() {
    let (clave, _) = Clave::nueva();
    let v = serde_json::json!({"a": 1, "b": "ñ"});
    assert_eq!(clave.descifrar_json(&clave.cifrar_json(&v)).unwrap(), v);
}

#[test]
fn rechaza_clave_ajena_alterado_y_vencido() {
    let (k1, _) = Clave::nueva();
    let (k2, _) = Clave::nueva();
    let mut sobre = k1.cifrar(b"hola");
    assert_eq!(k2.descifrar(&sobre), Err(ErrorCifrado::Alterado));
    let ultimo = sobre.len() - 1;
    sobre[ultimo] ^= 1;
    assert_eq!(k1.descifrar(&sobre), Err(ErrorCifrado::Alterado));
    let viejo = k1.cifrar_con(b"hola", [0; 12], 1_000);
    assert_eq!(k1.descifrar_en(&viejo, 1_000 + EDAD_MAX_MS + 1), Err(ErrorCifrado::Vencido));
    assert_eq!(Clave::desde_base64("AAAA").err(), Some(ErrorCifrado::Clave));
}
```

Run: `cd receptor/sincro && cargo test`
Expected: FAIL — no existe el módulo `cifrado`.

- [x] **Step 2: Implementar**

```rust
// receptor/sincro/src/cifrado.rs
//! AES-256-GCM con el mismo formato que `app/src/lib/cifrado.js`: IV (12) + cifrado con etiqueta;
//! el contenido lleva delante la hora en ms (8 bytes, big-endian). Datos adicionales fijos.
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::time::{SystemTime, UNIX_EPOCH};

pub const AAD: &[u8] = b"canvas-sincro-v1";
pub const EDAD_MAX_MS: u64 = 5 * 60 * 1000;

#[derive(Debug, PartialEq, Eq)]
pub enum ErrorCifrado {
    /// La clave no es base64 de 32 bytes.
    Clave,
    /// Otra clave, o el mensaje fue modificado / está incompleto.
    Alterado,
    /// La hora del mensaje difiere más de EDAD_MAX_MS.
    Vencido,
}

pub fn ahora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub struct Clave(Aes256Gcm);

impl Clave {
    pub fn desde_base64(s: &str) -> Result<Self, ErrorCifrado> {
        let raw = STANDARD.decode(s.trim()).map_err(|_| ErrorCifrado::Clave)?;
        if raw.len() != 32 {
            return Err(ErrorCifrado::Clave);
        }
        Aes256Gcm::new_from_slice(&raw).map(Clave).map_err(|_| ErrorCifrado::Clave)
    }

    /// Clave nueva al azar y su texto base64 (para el QR de vinculación).
    pub fn nueva() -> (Self, String) {
        let mut k = [0u8; 32];
        getrandom::getrandom(&mut k).expect("sin fuente de azar");
        let s = STANDARD.encode(k);
        (Self::desde_base64(&s).expect("clave recién creada"), s)
    }

    pub fn cifrar_con(&self, bytes: &[u8], iv: [u8; 12], ahora: u64) -> Vec<u8> {
        let mut plano = ahora.to_be_bytes().to_vec();
        plano.extend_from_slice(bytes);
        let ct = self.0.encrypt(Nonce::from_slice(&iv), Payload { msg: &plano, aad: AAD }).expect("cifrar");
        let mut out = iv.to_vec();
        out.extend(ct);
        out
    }

    pub fn cifrar(&self, bytes: &[u8]) -> Vec<u8> {
        let mut iv = [0u8; 12];
        getrandom::getrandom(&mut iv).expect("sin fuente de azar");
        self.cifrar_con(bytes, iv, ahora_ms())
    }

    pub fn descifrar_en(&self, sobre: &[u8], ahora: u64) -> Result<Vec<u8>, ErrorCifrado> {
        if sobre.len() < 12 + 8 + 16 {
            return Err(ErrorCifrado::Alterado);
        }
        let plano = self
            .0
            .decrypt(Nonce::from_slice(&sobre[..12]), Payload { msg: &sobre[12..], aad: AAD })
            .map_err(|_| ErrorCifrado::Alterado)?;
        let t = u64::from_be_bytes(plano[..8].try_into().expect("8 bytes"));
        if ahora.abs_diff(t) > EDAD_MAX_MS {
            return Err(ErrorCifrado::Vencido);
        }
        Ok(plano[8..].to_vec())
    }

    pub fn descifrar(&self, sobre: &[u8]) -> Result<Vec<u8>, ErrorCifrado> {
        self.descifrar_en(sobre, ahora_ms())
    }

    pub fn cifrar_json(&self, v: &serde_json::Value) -> String {
        STANDARD.encode(self.cifrar(&serde_json::to_vec(v).expect("json")))
    }

    pub fn descifrar_json(&self, texto: &str) -> Result<serde_json::Value, ErrorCifrado> {
        let b = STANDARD.decode(texto.trim()).map_err(|_| ErrorCifrado::Alterado)?;
        serde_json::from_slice(&self.descifrar(&b)?).map_err(|_| ErrorCifrado::Alterado)
    }
}
```

Run: `cd receptor/sincro && cargo test`
Expected: PASS (3 pruebas)

- [x] **Step 3: Commit**

```bash
git add receptor/sincro
git commit -m "Sincronización: crate canvas-sincro con cifrado compatible con la app"
```

---

### Task 4: Carpeta de datos (leer, escribir, documentos, rutas seguras)

**Files:**
- Create: `receptor/sincro/src/carpeta.rs`
- Modify: `receptor/sincro/src/lib.rs` (agregar `pub mod carpeta;`)
- Test: `receptor/sincro/tests/carpeta.rs`

**Interfaces:**
- Produces: `canvas_sincro::carpeta::{Carpeta, COLECCIONES}`; `Carpeta::nueva(impl Into<PathBuf>)`, `etiqueta(&self) -> String` (sha256 hex de los tres JSON), `coleccion(&self, &str) -> io::Result<Value>`, `leer(&self) -> io::Result<Value>` (`{etiqueta, proyectos, fuentes, citas, docs:[{ruta, bytes}]}`), `escribir(&self, datos: &Value, eliminados: &Value) -> io::Result<()>`, `documentos(&self) -> Vec<Value>`, `ruta_segura(&self, &str) -> Option<PathBuf>`, `escribir_doc(&self, &Path, &[u8]) -> io::Result<()>`.

- [x] **Step 1: Pruebas (fallan)**

```rust
// receptor/sincro/tests/carpeta.rs
use canvas_sincro::carpeta::Carpeta;
use serde_json::json;
use std::fs;

fn con_datos() -> (tempfile::TempDir, Carpeta) {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("fuentes.json"), "{\n  \"fuentes\": [\n    {\n      \"id\": \"fuente_001\",\n      \"titulo\": \"A\"\n    }\n  ]\n}\n").unwrap();
    fs::create_dir_all(dir.path().join("fuentes/fuente_001")).unwrap();
    fs::write(dir.path().join("fuentes/fuente_001/documento.pdf"), b"%PDF-1.4 prueba").unwrap();
    fs::write(dir.path().join("fuentes/fuente_001/texto.md"), b"no es documento").unwrap();
    let c = Carpeta::nueva(dir.path());
    (dir, c)
}

#[test]
fn lee_colecciones_documentos_y_etiqueta() {
    let (_d, c) = con_datos();
    let v = c.leer().unwrap();
    assert_eq!(v["fuentes"][0]["id"], "fuente_001");
    assert_eq!(v["proyectos"], json!([]));
    assert_eq!(v["docs"], json!([{"ruta": "fuentes/fuente_001/documento.pdf", "bytes": 15}]));
    assert_eq!(v["etiqueta"].as_str().unwrap().len(), 64);
}

#[test]
fn escribe_con_el_formato_de_la_app_y_cambia_la_etiqueta() {
    let (d, c) = con_datos();
    let antes = c.etiqueta();
    c.escribir(&json!({"fuentes": [{"id": "fuente_002", "titulo": "B", "anio": 2020}]}), &json!({})).unwrap();
    let txt = fs::read_to_string(d.path().join("fuentes.json")).unwrap();
    assert_eq!(txt, "{\n  \"fuentes\": [\n    {\n      \"id\": \"fuente_002\",\n      \"titulo\": \"B\",\n      \"anio\": 2020\n    }\n  ]\n}\n");
    assert_ne!(c.etiqueta(), antes);
    assert!(!d.path().join("proyectos.json").exists(), "solo escribe las colecciones enviadas");
}

#[test]
fn acumula_eliminados_sin_repetir() {
    let (d, c) = con_datos();
    c.escribir(&json!({}), &json!({"fuentes": ["fuente_009"], "citas": []})).unwrap();
    c.escribir(&json!({}), &json!({"fuentes": ["fuente_009", "fuente_010"]})).unwrap();
    let e: serde_json::Value = serde_json::from_str(&fs::read_to_string(d.path().join("eliminados.json")).unwrap()).unwrap();
    assert_eq!(e, json!({"fuentes": ["fuente_009", "fuente_010"]}));
}

#[test]
fn solo_acepta_rutas_de_documentos_dentro_de_la_carpeta() {
    let (d, c) = con_datos();
    assert_eq!(c.ruta_segura("fuentes/fuente_001/documento.pdf"), Some(d.path().join("fuentes").join("fuente_001").join("documento.pdf")));
    for mala in ["../x/documento.pdf", "fuentes/../../documento.pdf", "/etc/passwd", "fuentes/fuente_001/texto.md", "fuentes/a/b/documento.pdf", "fuentes/fuente_001/documento.", "C:\\x\\documento.pdf"] {
        assert_eq!(c.ruta_segura(mala), None, "{mala}");
    }
}
```

Run: `cd receptor/sincro && cargo test --test carpeta`
Expected: FAIL — no existe `carpeta`.

- [x] **Step 2: Implementar**

```rust
// receptor/sincro/src/carpeta.rs
//! La carpeta de datos de la app en la PC: los tres JSON (mismo formato que escribe la app),
//! `eliminados.json` (la app borra esos ids al recogerlos) y `fuentes/<id>/documento.<ext>`.
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const COLECCIONES: [&str; 3] = ["proyectos", "fuentes", "citas"];

pub struct Carpeta {
    pub raiz: PathBuf,
}

impl Carpeta {
    pub fn nueva(raiz: impl Into<PathBuf>) -> Self {
        Carpeta { raiz: raiz.into() }
    }

    fn archivo(&self, col: &str) -> PathBuf {
        self.raiz.join(format!("{col}.json"))
    }

    fn bytes(&self, col: &str) -> Vec<u8> {
        fs::read(self.archivo(col)).unwrap_or_default()
    }

    /// Cambia cada vez que cambia cualquiera de los tres JSON (detecta ediciones concurrentes).
    pub fn etiqueta(&self) -> String {
        let mut h = Sha256::new();
        for c in COLECCIONES {
            h.update(c.as_bytes());
            h.update(self.bytes(c));
        }
        h.finalize().iter().map(|b| format!("{b:02x}")).collect()
    }

    pub fn coleccion(&self, col: &str) -> io::Result<Value> {
        let b = self.bytes(col);
        if b.is_empty() {
            return Ok(json!([]));
        }
        let v: Value = serde_json::from_slice(&b).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("{col}.json: {e}")))?;
        Ok(match v {
            Value::Array(_) => v,
            Value::Object(mut m) => m.remove(col).unwrap_or_else(|| json!([])),
            _ => json!([]),
        })
    }

    pub fn leer(&self) -> io::Result<Value> {
        let mut m = Map::new();
        m.insert("etiqueta".into(), json!(self.etiqueta()));
        for c in COLECCIONES {
            m.insert(c.into(), self.coleccion(c)?);
        }
        m.insert("docs".into(), Value::Array(self.documentos()));
        Ok(Value::Object(m))
    }

    fn escribir_atomico(&self, destino: &Path, datos: &[u8]) -> io::Result<()> {
        if let Some(p) = destino.parent() {
            fs::create_dir_all(p)?;
        }
        let tmp = destino.with_extension("tmp-sincro");
        fs::write(&tmp, datos)?;
        fs::rename(&tmp, destino)
    }

    fn json_bonito(v: &Value) -> io::Result<Vec<u8>> {
        let mut txt = serde_json::to_string_pretty(v)?;
        txt.push('\n');
        Ok(txt.into_bytes())
    }

    /// Escribe solo las colecciones presentes en `datos` y suma a `eliminados.json` los ids de
    /// `eliminados` (`{"fuentes": [...], ...}`).
    pub fn escribir(&self, datos: &Value, eliminados: &Value) -> io::Result<()> {
        for c in COLECCIONES {
            if let Some(items) = datos.get(c) {
                let mut m = Map::new();
                m.insert(c.into(), items.clone());
                self.escribir_atomico(&self.archivo(c), &Self::json_bonito(&Value::Object(m))?)?;
            }
        }
        let nuevos = |c: &str| eliminados.get(c).and_then(|v| v.as_array()).cloned().unwrap_or_default();
        if COLECCIONES.iter().all(|c| nuevos(c).is_empty()) {
            return Ok(());
        }
        let ruta = self.raiz.join("eliminados.json");
        let mut actual: Value = fs::read(&ruta).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_else(|| json!({}));
        for c in COLECCIONES {
            let mut ids = actual.get(c).and_then(|v| v.as_array()).cloned().unwrap_or_default();
            for id in nuevos(c) {
                if !ids.contains(&id) {
                    ids.push(id);
                }
            }
            if !ids.is_empty() {
                actual[c] = Value::Array(ids);
            }
        }
        self.escribir_atomico(&ruta, &Self::json_bonito(&actual)?)
    }

    pub fn documentos(&self) -> Vec<Value> {
        let mut l = vec![];
        let Ok(dirs) = fs::read_dir(self.raiz.join("fuentes")) else { return l };
        for d in dirs.flatten() {
            let Ok(archivos) = fs::read_dir(d.path()) else { continue };
            for a in archivos.flatten() {
                let nombre = a.file_name().to_string_lossy().to_string();
                if !nombre.starts_with("documento.") || nombre.ends_with(".tmp-sincro") {
                    continue;
                }
                let Ok(meta) = a.metadata() else { continue };
                l.push(json!({"ruta": format!("fuentes/{}/{}", d.file_name().to_string_lossy(), nombre), "bytes": meta.len()}));
            }
        }
        l.sort_by(|a, b| a["ruta"].as_str().cmp(&b["ruta"].as_str()));
        l
    }

    /// Solo `fuentes/<id>/documento.<ext>` (id y extensión alfanuméricos): nada fuera de la carpeta.
    pub fn ruta_segura(&self, ruta: &str) -> Option<PathBuf> {
        let partes: Vec<&str> = ruta.split('/').collect();
        let [raiz, id, nombre] = partes.as_slice() else { return None };
        let id_ok = !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        let ext = nombre.strip_prefix("documento.")?;
        let ext_ok = !ext.is_empty() && ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric());
        (*raiz == "fuentes" && id_ok && ext_ok).then(|| self.raiz.join("fuentes").join(id).join(nombre))
    }

    pub fn escribir_doc(&self, destino: &Path, bytes: &[u8]) -> io::Result<()> {
        self.escribir_atomico(destino, bytes)
    }
}
```

Agregar a `receptor/sincro/src/lib.rs`: `pub mod carpeta;`

Run: `cd receptor/sincro && cargo test`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add receptor/sincro
git commit -m "Sincronización: lectura y escritura segura de la carpeta de datos"
```

---

### Task 5: Servidor HTTP y binario `canvas-sincro`

**Files:**
- Create: `receptor/sincro/src/servidor.rs`, `receptor/sincro/src/main.rs`
- Modify: `receptor/sincro/src/lib.rs` (agregar `pub mod servidor;`)
- Test: `receptor/sincro/tests/servidor.rs`

**Interfaces:**
- Consumes: `Clave` (Tarea 3), `Carpeta` (Tarea 4).
- Produces: `canvas_sincro::servidor::{Sincro, Respuesta, servir, ip_local, TOPE_CUERPO}`; `Sincro { carpeta, clave, clave_b64, puerto, tope }`, `Sincro::atender(&self, metodo: &str, url: &str, prueba: Option<&str>, cuerpo: &[u8], local: bool) -> Respuesta`, `Sincro::codigo(&self) -> String`, `servir(Arc<Sincro>, tiny_http::Server)`.
- Protocolo HTTP (lo usa la Tarea 6):
  - Todas las rutas salvo `OPTIONS` y `/sync/emparejar` exigen la cabecera `X-Canvas-Prueba: cifrarJson({ ruta: <url exacta con query> })`; si no, **401**.
  - `GET /sync/estado` → 200, cuerpo `cifrarJson({etiqueta, proyectos, fuentes, citas, docs})`.
  - `PUT /sync/estado` (cuerpo `cifrarJson({etiqueta, proyectos, fuentes, citas, eliminados})`) → 200 `cifrarJson({etiqueta})` | **409** si la etiqueta ya no es la actual.
  - `GET /sync/doc?ruta=<codificada>` → 200 binario `cifrarBytes(bytes)` | 400 ruta inválida | 404.
  - `PUT /sync/doc?ruta=…` (cuerpo binario `cifrarBytes(bytes)`) → 200.
  - `GET /sync/emparejar` → solo desde la misma PC (loopback): `{ip, puerto, clave, codigo}`; desde la red **403**.
  - Cuerpo mayor que `tope` → **413**. CORS abierto (`*`): todo va cifrado.
- Binario: `canvas-sincro --carpeta <ruta> [--puerto 47481] [--clave <base64>]`; con `--puerto 0` elige uno libre. Imprime en la primera línea `{"puerto":…,"codigo":"canvas-sync://…","clave":"…"}`.

- [x] **Step 1: Pruebas (fallan)**

```rust
// receptor/sincro/tests/servidor.rs
use canvas_sincro::carpeta::Carpeta;
use canvas_sincro::cifrado::Clave;
use canvas_sincro::servidor::Sincro;
use serde_json::json;

fn sincro(tope: usize) -> (tempfile::TempDir, Sincro) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("fuentes.json"), "{\"fuentes\":[{\"id\":\"fuente_001\"}]}").unwrap();
    let (clave, clave_b64) = Clave::nueva();
    let s = Sincro { carpeta: Carpeta::nueva(dir.path()), clave, clave_b64, puerto: 47481, tope };
    (dir, s)
}
fn prueba(s: &Sincro, url: &str) -> String {
    s.clave.cifrar_json(&json!({ "ruta": url }))
}
fn leer(s: &Sincro, r: &canvas_sincro::servidor::Respuesta) -> serde_json::Value {
    s.clave.descifrar_json(std::str::from_utf8(&r.cuerpo).unwrap()).unwrap()
}

#[test]
fn sin_prueba_o_con_otra_clave_responde_401() {
    let (_d, s) = sincro(1 << 20);
    assert_eq!(s.atender("GET", "/sync/estado", None, b"", false).estado, 401);
    let (otra, _) = Clave::nueva();
    let falsa = otra.cifrar_json(&json!({"ruta": "/sync/estado"}));
    assert_eq!(s.atender("GET", "/sync/estado", Some(&falsa), b"", false).estado, 401);
    // Una prueba válida para otra ruta tampoco sirve.
    assert_eq!(s.atender("GET", "/sync/estado", Some(&prueba(&s, "/sync/doc?ruta=x")), b"", false).estado, 401);
}

#[test]
fn estado_y_guardado_con_control_de_version() {
    let (d, s) = sincro(1 << 20);
    let r = s.atender("GET", "/sync/estado", Some(&prueba(&s, "/sync/estado")), b"", false);
    assert_eq!(r.estado, 200);
    let estado = leer(&s, &r);
    assert_eq!(estado["fuentes"][0]["id"], "fuente_001");
    let etiqueta = estado["etiqueta"].as_str().unwrap().to_string();

    let cuerpo = s.clave.cifrar_json(&json!({"etiqueta": etiqueta, "fuentes": [{"id": "fuente_002"}], "eliminados": {"fuentes": ["fuente_001"]}}));
    let r = s.atender("PUT", "/sync/estado", Some(&prueba(&s, "/sync/estado")), cuerpo.as_bytes(), false);
    assert_eq!(r.estado, 200);
    assert!(std::fs::read_to_string(d.path().join("fuentes.json")).unwrap().contains("fuente_002"));
    assert!(std::fs::read_to_string(d.path().join("eliminados.json")).unwrap().contains("fuente_001"));

    // Con la etiqueta vieja (la PC cambió entre medio): 409 y nada se escribe.
    let viejo = s.clave.cifrar_json(&json!({"etiqueta": etiqueta, "fuentes": []}));
    assert_eq!(s.atender("PUT", "/sync/estado", Some(&prueba(&s, "/sync/estado")), viejo.as_bytes(), false).estado, 409);
    assert!(std::fs::read_to_string(d.path().join("fuentes.json")).unwrap().contains("fuente_002"));
}

#[test]
fn documentos_ida_y_vuelta_y_rutas_invalidas() {
    let (_d, s) = sincro(1 << 20);
    let url = "/sync/doc?ruta=fuentes%2Ffuente_001%2Fdocumento.pdf";
    let r = s.atender("PUT", url, Some(&prueba(&s, url)), &s.clave.cifrar(b"%PDF-1.4 hola"), false);
    assert_eq!(r.estado, 200);
    let r = s.atender("GET", url, Some(&prueba(&s, url)), b"", false);
    assert_eq!(r.estado, 200);
    assert_eq!(s.clave.descifrar(&r.cuerpo).unwrap(), b"%PDF-1.4 hola");
    let malo = "/sync/doc?ruta=..%2F..%2Fsecreto.txt";
    assert_eq!(s.atender("GET", malo, Some(&prueba(&s, malo)), b"", false).estado, 400);
}

#[test]
fn emparejar_solo_desde_la_misma_pc_y_tope_de_cuerpo() {
    let (_d, s) = sincro(64);
    assert_eq!(s.atender("GET", "/sync/emparejar", None, b"", false).estado, 403);
    let r = s.atender("GET", "/sync/emparejar", None, b"", true);
    assert_eq!(r.estado, 200);
    let v: serde_json::Value = serde_json::from_slice(&r.cuerpo).unwrap();
    assert!(v["codigo"].as_str().unwrap().starts_with("canvas-sync://"));
    assert!(v["codigo"].as_str().unwrap().ends_with(&s.clave_b64));
    assert_eq!(s.atender("PUT", "/sync/estado", None, &[0u8; 65], false).estado, 413);
}
```

Run: `cd receptor/sincro && cargo test --test servidor`
Expected: FAIL — no existe `servidor`.

- [x] **Step 2: Implementar el servidor**

```rust
// receptor/sincro/src/servidor.rs
//! Servidor HTTP de sincronización (red local). Todo lo que viaja va cifrado con la clave de
//! vinculación; cada petición demuestra conocerla con la cabecera X-Canvas-Prueba.
use crate::carpeta::Carpeta;
use crate::cifrado::Clave;
use serde_json::json;
use std::io::Read;
use std::net::UdpSocket;
use std::sync::Arc;
use tiny_http::{Header, Request, Response, Server};

pub const TOPE_CUERPO: usize = 200 * 1024 * 1024;

pub struct Sincro {
    pub carpeta: Carpeta,
    pub clave: Clave,
    pub clave_b64: String,
    pub puerto: u16,
    /// Tamaño máximo de un cuerpo (TOPE_CUERPO en producción; menor en pruebas).
    pub tope: usize,
}

pub struct Respuesta {
    pub estado: u16,
    pub tipo: &'static str,
    pub cuerpo: Vec<u8>,
}

impl Respuesta {
    fn texto(estado: u16, s: String) -> Self {
        Respuesta { estado, tipo: "text/plain; charset=utf-8", cuerpo: s.into_bytes() }
    }
    fn binario(b: Vec<u8>) -> Self {
        Respuesta { estado: 200, tipo: "application/octet-stream", cuerpo: b }
    }
    fn vacia(estado: u16) -> Self {
        Respuesta { estado, tipo: "text/plain; charset=utf-8", cuerpo: vec![] }
    }
}

/// IP de esta PC en la red local (sin enviar nada: solo elige la interfaz de salida).
pub fn ip_local() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("192.168.0.1:9")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".into())
}

fn decodificar(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => {
                if let Ok(x) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(x);
                    i += 3;
                    continue;
                }
                out.push(b'%');
            }
            b'+' => out.push(b' '),
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parametro(url: &str, clave: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|p| {
        let (k, v) = p.split_once('=')?;
        (k == clave).then(|| decodificar(v))
    })
}

impl Sincro {
    pub fn codigo(&self) -> String {
        format!("canvas-sync://{}:{}/#{}", ip_local(), self.puerto, self.clave_b64)
    }

    /// `prueba`: cabecera X-Canvas-Prueba. `local`: la petición viene de esta misma PC.
    pub fn atender(&self, metodo: &str, url: &str, prueba: Option<&str>, cuerpo: &[u8], local: bool) -> Respuesta {
        if cuerpo.len() > self.tope {
            return Respuesta::vacia(413);
        }
        let ruta = url.split('?').next().unwrap_or("");
        if metodo == "OPTIONS" {
            return Respuesta::vacia(204);
        }
        if metodo == "GET" && ruta == "/sync/emparejar" {
            if !local {
                return Respuesta::vacia(403);
            }
            let v = json!({"ip": ip_local(), "puerto": self.puerto, "clave": self.clave_b64, "codigo": self.codigo()});
            return Respuesta::texto(200, v.to_string());
        }
        let autorizado = prueba
            .and_then(|p| self.clave.descifrar_json(p).ok())
            .map_or(false, |v| v["ruta"].as_str() == Some(url));
        if !autorizado {
            return Respuesta::vacia(401);
        }
        match (metodo, ruta) {
            ("GET", "/sync/estado") => match self.carpeta.leer() {
                Ok(v) => Respuesta::texto(200, self.clave.cifrar_json(&v)),
                Err(e) => Respuesta::texto(500, e.to_string()),
            },
            ("PUT", "/sync/estado") => {
                let Ok(texto) = std::str::from_utf8(cuerpo) else { return Respuesta::vacia(400) };
                let Ok(v) = self.clave.descifrar_json(texto) else { return Respuesta::vacia(401) };
                if v["etiqueta"].as_str() != Some(self.carpeta.etiqueta().as_str()) {
                    return Respuesta::texto(409, self.clave.cifrar_json(&json!({"error": "cambio"})));
                }
                match self.carpeta.escribir(&v, &v["eliminados"]) {
                    Ok(()) => Respuesta::texto(200, self.clave.cifrar_json(&json!({"etiqueta": self.carpeta.etiqueta()}))),
                    Err(e) => Respuesta::texto(500, e.to_string()),
                }
            }
            ("GET", "/sync/doc") => {
                let Some(p) = parametro(url, "ruta").and_then(|r| self.carpeta.ruta_segura(&r)) else { return Respuesta::vacia(400) };
                match std::fs::read(p) {
                    Ok(b) => Respuesta::binario(self.clave.cifrar(&b)),
                    Err(_) => Respuesta::vacia(404),
                }
            }
            ("PUT", "/sync/doc") => {
                let Some(p) = parametro(url, "ruta").and_then(|r| self.carpeta.ruta_segura(&r)) else { return Respuesta::vacia(400) };
                let Ok(b) = self.clave.descifrar(cuerpo) else { return Respuesta::vacia(401) };
                match self.carpeta.escribir_doc(&p, &b) {
                    Ok(()) => Respuesta::texto(200, self.clave.cifrar_json(&json!({"ok": true}))),
                    Err(e) => Respuesta::texto(500, e.to_string()),
                }
            }
            _ => Respuesta::vacia(404),
        }
    }
}

fn cabecera(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).expect("cabecera válida")
}

fn atender_http(s: &Sincro, mut rq: Request) {
    let local = rq.remote_addr().map_or(false, |a| a.ip().is_loopback());
    let metodo = rq.method().to_string().to_uppercase();
    let url = rq.url().to_string();
    let prueba = rq.headers().iter().find(|h| h.field.equiv("X-Canvas-Prueba")).map(|h| h.value.as_str().to_string());
    let mut cuerpo = Vec::new();
    if rq.as_reader().take(s.tope as u64 + 1).read_to_end(&mut cuerpo).is_err() {
        return;
    }
    let r = s.atender(&metodo, &url, prueba.as_deref(), &cuerpo, local);
    let resp = Response::from_data(r.cuerpo)
        .with_status_code(r.estado)
        .with_header(cabecera("Content-Type", r.tipo))
        .with_header(cabecera("Cache-Control", "no-store"))
        .with_header(cabecera("Access-Control-Allow-Origin", "*"))
        .with_header(cabecera("Access-Control-Allow-Methods", "GET, PUT, OPTIONS"))
        .with_header(cabecera("Access-Control-Allow-Headers", "content-type, x-canvas-prueba"))
        .with_header(cabecera("Access-Control-Allow-Private-Network", "true"));
    let _ = rq.respond(resp);
}

/// Atiende peticiones hasta que se cierre el servidor (un hilo por petición).
pub fn servir(s: Arc<Sincro>, server: Server) {
    for rq in server.incoming_requests() {
        let s = s.clone();
        std::thread::spawn(move || atender_http(&s, rq));
    }
}
```

```rust
// receptor/sincro/src/main.rs
//! canvas-sincro: servidor de sincronización independiente (pruebas y desarrollo en cualquier
//! sistema). En la PC de Max lo lanza el receptor de Windows (Tarea 8).
use canvas_sincro::carpeta::Carpeta;
use canvas_sincro::cifrado::Clave;
use canvas_sincro::servidor::{servir, Sincro, TOPE_CUERPO};
use std::sync::Arc;

fn arg(nombre: &str) -> Option<String> {
    let a: Vec<String> = std::env::args().collect();
    a.iter().position(|x| x == nombre).and_then(|i| a.get(i + 1).cloned())
}

fn main() {
    let carpeta = arg("--carpeta").expect("Uso: canvas-sincro --carpeta <ruta> [--puerto 47481] [--clave <base64>]");
    let puerto: u16 = arg("--puerto").and_then(|p| p.parse().ok()).unwrap_or(47481);
    let (clave, clave_b64) = match arg("--clave") {
        Some(k) => (Clave::desde_base64(&k).expect("clave inválida (base64 de 32 bytes)"), k),
        None => Clave::nueva(),
    };
    let server = tiny_http::Server::http(("0.0.0.0", puerto)).expect("no se pudo abrir el puerto");
    let puerto = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(puerto);
    let s = Arc::new(Sincro { carpeta: Carpeta::nueva(carpeta), clave, clave_b64, puerto, tope: TOPE_CUERPO });
    println!("{}", serde_json::json!({"puerto": puerto, "codigo": s.codigo(), "clave": s.clave_b64}));
    servir(s, server);
}
```

Agregar a `lib.rs`: `pub mod servidor;`

Run: `cd receptor/sincro && cargo test && cargo build --release`
Expected: PASS y binario en `target/release/canvas-sincro`.

- [x] **Step 3: Commit**

```bash
git add receptor/sincro
git commit -m "Sincronización: servidor HTTP cifrado y binario canvas-sincro"
```

---

### Task 6: Conexión y orquestación en JavaScript (+ integración real con Rust)

**Files:**
- Create: `app/src/lib/sincro-http.js`, `app/src/lib/sincro-cliente.js`, `app/tests/integracion/sincro.test.js`
- Modify: `app/package.json` (script `"test:integracion": "node --test \"tests/integracion/**/*.test.js\""`)
- Test: `app/tests/unit/sincro-cliente.test.js`

**Interfaces:**
- Consumes: `fusionar3` (Tarea 1), cifrado (Tarea 2), protocolo HTTP (Tarea 5).
- Produces:
  - `leerCodigo(codigo) → { url: 'http://ip:puerto', clave }` (lanza `'Código de vinculación no válido'`).
  - `crearConexion({ url, clave, fetchFn = fetch }) → Promise<{ estado(), guardar(datos), bajarDoc(ruta) → Uint8Array, subirDoc(ruta, bytes) }>`; errores con `.codigo` (409 en `guardar` si la PC cambió; 401 → mensaje "vuelve a vincular").
  - `sincronizar({ conexion, almacen, alProgreso? }) → Promise<{ conflictos, bajados, subidos, reintentos }>` con el almacén:
    `{ leerLocal(), escribirLocal(datos), leerBase(), guardarBase(datos), docsLocales() → [{ruta}], tieneDoc(ruta), leerDoc(ruta) → Uint8Array, guardarDoc(ruta, bytes) }` (todas pueden ser async).

- [x] **Step 1: Prueba unitaria del orquestador (falla)**

```js
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
```

Run: `cd app && npm test`
Expected: FAIL — no existe `sincro-cliente.js`.

- [x] **Step 2: Implementar conexión y orquestador**

```js
// app/src/lib/sincro-http.js
// Conexión cifrada con el servidor de sincronización de la PC (receptor/sincro).
import { importarClave, cifrarJson, descifrarJson, cifrarBytes, descifrarBytes } from './cifrado.js'

/** "canvas-sync://192.168.1.5:47481/#<clave>" → { url, clave } */
export function leerCodigo(codigo) {
  const m = /^canvas-sync:\/\/([^/#\s]+)\/?#(\S+)$/.exec(String(codigo || '').trim())
  if (!m) throw new Error('Código de vinculación no válido')
  return { url: `http://${m[1]}`, clave: decodeURIComponent(m[2]) }
}

function errorHttp(r) {
  const e = new Error(r.status === 401 ? 'La PC no reconoce este celular: vuelve a vincularlo' : r.status === 409 ? 'La PC cambió durante la sincronización' : `La PC respondió ${r.status}`)
  e.codigo = r.status
  return e
}

export async function crearConexion({ url, clave, fetchFn = fetch }) {
  const k = await importarClave(clave)
  async function pedir(metodo, ruta, cuerpo, binario = false) {
    let r
    try {
      r = await fetchFn(url + ruta, {
        method: metodo,
        headers: { 'x-canvas-prueba': await cifrarJson(k, { ruta }), 'content-type': binario ? 'application/octet-stream' : 'text/plain' },
        body: cuerpo
      })
    } catch {
      throw new Error('No se pudo conectar con la PC: ¿están en el mismo Wi-Fi y el receptor está abierto?')
    }
    if (!r.ok) throw errorHttp(r)
    return r
  }
  const doc = ruta => `/sync/doc?ruta=${encodeURIComponent(ruta)}`
  return {
    estado: async () => descifrarJson(k, await (await pedir('GET', '/sync/estado')).text()),
    guardar: async datos => descifrarJson(k, await (await pedir('PUT', '/sync/estado', await cifrarJson(k, datos))).text()),
    bajarDoc: async ruta => descifrarBytes(k, new Uint8Array(await (await pedir('GET', doc(ruta))).arrayBuffer())),
    subirDoc: async (ruta, bytes) => { await pedir('PUT', doc(ruta), await cifrarBytes(k, bytes), true) }
  }
}
```

```js
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
```

Run: `cd app && npm test`
Expected: PASS

- [x] **Step 3: Prueba de integración contra el binario Rust**

```js
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
```

Agregar en `app/package.json` → `"scripts"`: `"test:integracion": "node --test \"tests/integracion/**/*.test.js\""`.

Run: `cd app && npm run test:integracion`
Expected: PASS (2 pruebas)

- [x] **Step 4: Commit**

```bash
git add app/src/lib/sincro-http.js app/src/lib/sincro-cliente.js app/tests/unit/sincro-cliente.test.js app/tests/integracion app/package.json
git commit -m "Sincronización: conexión cifrada, orquestación y prueba de integración con Rust"
```

---

### Task 7: En la app — almacén y pantalla "Sincronizar con la PC"

**Files:**
- Create: `app/src/lib/sincro-almacen.js`, `app/src/components/Sincronizar.svelte`
- Modify: `app/src/components/Datos.svelte` (el modal de Configuración: renderizar `<Sincronizar />` como último bloque dentro de su `<Modal>`)
- Test: `app/tests/e2e/todas.mjs` (nueva suite `sincro`)

**Interfaces:**
- Consumes: `sincronizar`, `crearConexion`, `leerCodigo` (Tarea 6); del store: `S`, `importar(datos, 'reemplazar')`, `leerMeta`, `ponerMeta`, `leerDocumento(fid)`, `guardarDocumentoImportado(fid, nombre, blob)`, `idsConDocumento()`.
- Produces: `almacenApp` (implementa el almacén de la Tarea 6); meta `baseSincro`, `sincroCodigo`, `sincroUltima` en IndexedDB.

- [x] **Step 1: Adaptador del almacén**

```js
// app/src/lib/sincro-almacen.js
// El almacén de la app (IndexedDB) visto por el orquestador de sincronización.
import { S, importar, leerMeta, ponerMeta, leerDocumento, guardarDocumentoImportado, idsConDocumento } from './store.svelte.js'

const copia = x => JSON.parse(JSON.stringify(x))
const MIME = { pdf: 'application/pdf', html: 'text/html', htm: 'text/html', md: 'text/markdown', txt: 'text/plain' }
const fuenteDe = ruta => S.fuentes.find(f => f.documento_original === ruta)

export const almacenApp = {
  leerLocal: () => ({ proyectos: copia(S.proyectos), fuentes: copia(S.fuentes), citas: copia(S.citas) }),
  escribirLocal: datos => importar(datos, 'reemplazar'),
  leerBase: () => leerMeta('baseSincro'),
  guardarBase: datos => ponerMeta('baseSincro', datos),
  async docsLocales() {
    const ids = new Set(await idsConDocumento())
    return S.fuentes.filter(f => f.documento_original && ids.has(f.id)).map(f => ({ ruta: f.documento_original }))
  },
  async tieneDoc(ruta) {
    const f = fuenteDe(ruta)
    return !!(f && (await leerDocumento(f.id))?.blob)
  },
  async leerDoc(ruta) {
    const d = await leerDocumento(fuenteDe(ruta).id)
    return new Uint8Array(await d.blob.arrayBuffer())
  },
  async guardarDoc(ruta, bytes) {
    const f = fuenteDe(ruta)
    if (!f) return
    const ext = ruta.split('.').pop().toLowerCase()
    await guardarDocumentoImportado(f.id, f.documento_nombre || ruta.split('/').pop(), new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' }))
  }
}
```

- [x] **Step 2: Pantalla**

```svelte
<!-- app/src/components/Sincronizar.svelte -->
<script>
  // "Sincronizar con la PC": se pega (o escanea, en Android) el código de vinculación de la PC y
  // se sincroniza por la red local. El código queda guardado en este aparato.
  import { leerMeta, ponerMeta, avisar } from '../lib/store.svelte.js'
  import { leerCodigo, crearConexion } from '../lib/sincro-http.js'
  import { sincronizar } from '../lib/sincro-cliente.js'
  import { almacenApp } from '../lib/sincro-almacen.js'

  let codigo = $state('')
  let ultima = $state(null)
  let trabajando = $state(false)
  let progreso = $state('')
  let error = $state('')
  leerMeta('sincroCodigo').then(c => (codigo = c || ''))
  leerMeta('sincroUltima').then(u => (ultima = u || null))

  async function sincronizarAhora() {
    error = ''
    trabajando = true
    try {
      const { url, clave } = leerCodigo(codigo)
      await ponerMeta('sincroCodigo', codigo.trim())
      const r = await sincronizar({ conexion: await crearConexion({ url, clave }), almacen: almacenApp, alProgreso: t => (progreso = t) })
      ultima = { fecha: new Date().toISOString(), ...r }
      await ponerMeta('sincroUltima', ultima)
      avisar(`Sincronizado${r.conflictos ? ` · ${r.conflictos} cambios en ambos lados (ganó este aparato)` : ''}`)
    } catch (e) {
      error = e.message
    } finally {
      trabajando = false
      progreso = ''
    }
  }
</script>

<section class="sincro">
  <h3 class="serif">Sincronizar con la PC</h3>
  <p class="suave">En la PC: Configuración → Vincular celular. Copia aquí su código (o escanea el QR en la app Android). Deben estar en el mismo Wi-Fi.</p>
  <label class="campo"><span>Código de vinculación</span>
    <input type="text" bind:value={codigo} placeholder="canvas-sync://192.168.1.10:47481/#…" autocomplete="off" spellcheck="false" /></label>
  <div class="fila entre">
    <span class="suave estado">{trabajando ? progreso || 'Sincronizando…' : ultima ? `Última: ${new Date(ultima.fecha).toLocaleString('es-PE')} · ↓${ultima.bajados} ↑${ultima.subidos}` : 'Aún no se sincronizó'}</span>
    <button class="btn primario" disabled={trabajando || !codigo.trim()} onclick={sincronizarAhora}>Sincronizar</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .sincro { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--line); padding-top: 16px; }
  h3 { margin: 0; font-size: 16px; }
  p { margin: 0; font-size: 13px; }
  .estado { font-size: 12px; }
  .error { color: var(--unreviewed); }
</style>
```

En `app/src/components/Datos.svelte`: agregar `import Sincronizar from './Sincronizar.svelte'` y colocar `<Sincronizar />` como último hijo dentro de `<Modal …>`.

Run: `cd app && npm run build`
Expected: `✓ built`

- [x] **Step 3: Suite de navegador `sincro`**

Agregar a `SUITES` en `app/tests/e2e/todas.mjs` (y los imports `spawn` de `node:child_process`, `os` de `node:os`):

```js
  // Sincronización: la app (como "celular") contra canvas-sincro sobre una carpeta temporal.
  async sincro(b) {
    const s = suite('Sincronización con la PC')
    const crate = path.resolve(APP, '../receptor/sincro')
    if (spawnSync('cargo', ['build', '--release', '--quiet'], { cwd: crate, stdio: 'inherit' }).status !== 0) { s.fallas.push('cargo build'); return s }
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-e2e-'))
    fs.writeFileSync(path.join(carpeta, 'proyectos.json'), JSON.stringify({ proyectos: [{ id: 'proyecto_001', tipo: 'tesis', titulo: 'Tesis en la PC', objetivos_especificos: [], indicadores: [], canvas: { modo: 'radial', posiciones: {}, notas: [], fotos: [], listas: [], audios: [], conexiones: [], objetivos: {} } }] }, null, 2) + '\n')
    const bin = path.join(crate, 'target', 'release', process.platform === 'win32' ? 'canvas-sincro.exe' : 'canvas-sincro')
    const srv = spawn(bin, ['--carpeta', carpeta, '--puerto', '0'])
    const info = JSON.parse(await new Promise(res => srv.stdout.once('data', d => res(String(d).split('\n')[0]))))
    const codigo = `canvas-sync://127.0.0.1:${info.puerto}/#${info.clave}`
    const pg = await pagina(b)
    try {
      await pg.goto(URL_APP, { waitUntil: 'networkidle0' }); await esperar(600)
      await s.paso('trae el proyecto de la PC', async () => {
        await pg.click('button[aria-label="Configuración"]')
        await pg.type('dialog[open] input[placeholder^="canvas-sync"]', codigo)
        await clicTexto(pg, 'Sincronizar')
        await pg.waitForFunction(() => /Última:/.test(document.querySelector('.sincro .estado')?.textContent || ''), { timeout: 15000 })
        await pg.keyboard.press('Escape'); await esperar(400)
        if (!(await pg.evaluate(() => document.body.textContent.includes('Tesis en la PC')))) throw new Error('no llegó el proyecto')
      })
      await s.paso('una nota creada aquí llega a la carpeta de la PC', async () => {
        await pg.evaluate(() => (location.hash = '#/p/proyecto_001')); await esperar(800)
        await pg.click('button[aria-label="Añadir nota"]')
        await pg.type('dialog[open] textarea', 'Nota desde el celular')
        await clicTexto(pg, 'Guardar'); await esperar(300)
        await pg.click('button[aria-label="Configuración"]')
        await clicTexto(pg, 'Sincronizar'); await esperar(2500)
        const disco = fs.readFileSync(path.join(carpeta, 'proyectos.json'), 'utf8')
        if (!disco.includes('Nota desde el celular')) throw new Error('no llegó a la PC')
      })
    } finally { srv.kill() }
    if (pg.errores.length) s.fallas.push(...pg.errores)
    return s
  },
```

Run: `cd app && npm run build && npm run test:e2e -- sincro`
Expected: `2 pasos correctos, 0 fallas` (si no hay Chrome en el entorno, anótalo y confía en `npm test` + `npm run test:integracion`).

- [x] **Step 4: Todas las pruebas y commit**

Run: `cd app && npm test && npm run test:integracion && npm run build`
Expected: todo PASS

```bash
git add app/src/lib/sincro-almacen.js app/src/components/Sincronizar.svelte app/src/components/Datos.svelte app/tests/e2e/todas.mjs
git commit -m "Sincronización: pantalla Sincronizar con la PC y prueba de punta a punta"
```

---

### Task 8 (en la PC de Max, no en la nube): integrar en el receptor de Windows y "Vincular celular"

El receptor (`receptor/src/main.rs`) depende de PixPin por ruta local: **esta tarea solo compila en la PC de Max** (`cargo build --release` en `receptor/` con PixPin en `F:\THE FORGE\PIXPIN PC VERSION MAX`). Deja la rama lista y pide a Max que la ejecute con Claude Code local.

**Files:**
- Modify: `receptor/Cargo.toml` (agregar `canvas-sincro = { path = "sincro" }`), `receptor/src/main.rs`, `app/scripts/instalar-receptor.ps1`, `app/src/components/Datos.svelte`

- [ ] **Step 1: Arrancar el servidor LAN desde el receptor**

En `receptor/src/main.rs`, dentro de `fn main()` después de crear `app` y antes del bucle `for rq in servidor.incoming_requests()`:

```rust
    // Sincronización con el celular (red local, puerto 47481). La carpeta de datos la fija la app
    // (POST /sync/carpeta) y queda en carpeta.txt; la clave de vinculación en sincro-clave.txt.
    let carpeta_txt = raiz.join("carpeta.txt");
    let clave_txt = raiz.join("sincro-clave.txt");
    let (clave, clave_b64) = match std::fs::read_to_string(&clave_txt).ok().and_then(|k| canvas_sincro::cifrado::Clave::desde_base64(&k).ok().map(|c| (c, k.trim().to_string()))) {
        Some(x) => x,
        None => {
            let (c, k) = canvas_sincro::cifrado::Clave::nueva();
            let _ = std::fs::write(&clave_txt, &k);
            (c, k)
        }
    };
    if let (Ok(ruta), Ok(lan)) = (std::fs::read_to_string(&carpeta_txt), tiny_http::Server::http(("0.0.0.0", 47481))) {
        let s = std::sync::Arc::new(canvas_sincro::servidor::Sincro {
            carpeta: canvas_sincro::carpeta::Carpeta::nueva(ruta.trim()),
            clave,
            clave_b64,
            puerto: 47481,
            tope: canvas_sincro::servidor::TOPE_CUERPO,
        });
        std::thread::spawn(move || canvas_sincro::servidor::servir(s, lan));
    }
```

En `atender_http` del receptor, agregar dos rutas locales (127.0.0.1:47480, con la misma política de origen que el resto):

```rust
        (Method::Get, "/sync/emparejar") => {
            // El servidor LAN atiende /sync/emparejar solo por loopback: se le pregunta a él.
            match std::net::TcpStream::connect("127.0.0.1:47481") {
                Ok(mut c) => {
                    let _ = c.write_all(b"GET /sync/emparejar HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n");
                    let mut r = String::new();
                    let _ = c.read_to_string(&mut r);
                    let cuerpo = r.split("\r\n\r\n").nth(1).unwrap_or("{}").to_string();
                    let v: serde_json::Value = serde_json::from_str(&cuerpo).unwrap_or_default();
                    json(serde_json::json!({ "codigo": v["codigo"], "qr": svg_qr(v["codigo"].as_str().unwrap_or("")) }))
                }
                Err(_) => error(503, "sincronización apagada: fija la carpeta y reinicia el receptor"),
            }
        }
        (Method::Post, "/sync/carpeta") => match cuerpo(&mut rq, 4096) {
            Ok(b) => {
                let ruta = String::from_utf8_lossy(&b).trim().to_string();
                if std::path::Path::new(&ruta).join("proyectos.json").exists() {
                    let _ = std::fs::write(app.raiz.join("carpeta.txt"), &ruta);
                    json(serde_json::json!({ "ok": true, "reiniciar": true }))
                } else {
                    error(400, "esa carpeta no tiene proyectos.json")
                }
            }
            Err(e) => error(400, &e),
        },
```

- [ ] **Step 2: Firewall y reinicio en el instalador**

En `app/scripts/instalar-receptor.ps1`, antes de `Start-Process $exe`:

```powershell
# Permiso de red privada para que el celular llegue al puerto 47481 (pide confirmación si no hay
# permisos de administrador; si se omite, Windows preguntará la primera vez).
try { New-NetFirewallRule -DisplayName 'Canvas de Citas (sincronizar)' -Direction Inbound -Protocol TCP -LocalPort 47481 -Profile Private -Action Allow -ErrorAction Stop | Out-Null } catch {}
```

- [ ] **Step 3: "Vincular celular" en Configuración (escritorio)**

En `app/src/components/Datos.svelte`, un bloque visible cuando el receptor responde en `http://127.0.0.1:47480/estado`:

```svelte
<script>
  // (agregar al script existente)
  let vinculo = $state(null) // { codigo, qr } | { error }
  async function vincular() {
    try {
      // La ruta la escribe Max una vez (la app no conoce la ruta real de la carpeta elegida).
      const ruta = localStorage.getItem('rutaCarpeta') || prompt('Ruta completa de tu carpeta de datos (ej. F:\\THE FORGE\\THESIS\\New folder):')
      if (!ruta) return
      localStorage.setItem('rutaCarpeta', ruta)
      await fetch('http://127.0.0.1:47480/sync/carpeta', { method: 'POST', headers: { 'X-Canvas': '1' }, body: ruta })
      const r = await fetch('http://127.0.0.1:47480/sync/emparejar')
      vinculo = r.ok ? await r.json() : { error: 'Reinicia el receptor (o la PC) para activar la sincronización y vuelve a intentar.' }
    } catch { vinculo = { error: 'El receptor no está corriendo en esta PC.' } }
  }
</script>

<section class="vincular">
  <button class="btn" onclick={vincular}>Vincular celular</button>
  {#if vinculo?.qr}<div class="qr">{@html vinculo.qr}</div><code>{vinculo.codigo}</code>
  {:else if vinculo?.error}<p class="suave">{vinculo.error}</p>{/if}
</section>
```

- [ ] **Step 4: Verificar en la PC y commit**

Run (PowerShell): `powershell -ExecutionPolicy Bypass -File app\scripts\instalar-receptor.ps1`, abrir la app en Comet → Configuración → Vincular celular → aparece el QR. En otra ventana (modo incógnito, `npm run dev` en `http://localhost:5173`) pegar el código en "Sincronizar con la PC" y sincronizar.
Expected: el proyecto de la PC aparece; una nota creada allí llega a `proyectos.json` de la carpeta.

```bash
git add receptor app/scripts/instalar-receptor.ps1 app/src/components/Datos.svelte
git commit -m "Receptor: sincronización LAN integrada, vincular celular con QR y regla de firewall"
```

---

## Siguiente plan (Plan 2): app Android con Capacitor

Se escribe cuando este plan esté terminado y probado. Alcance previsto:
- `android/` con Capacitor (`@capacitor/core`, `@capacitor/android`) empaquetando `app/dist`.
- Adaptador `fetchFn` sobre `CapacitorHttp` (evita contenido mixto: la app corre en `https://localhost` y la PC es `http://`).
- Escaneo del QR de vinculación (cámara) y permisos (`CAMERA`, `RECORD_AUDIO`, `INTERNET`, `ACCESS_NETWORK_STATE`).
- Ocultar en Android lo que no aplica (carpeta de almacenamiento, receptor local) y mostrar "Sincronizar" siempre; sincronización automática al abrir.
- Búsqueda de la PC en la subred si cambió su IP (puerto 47481).
- Compilación del APK (en la nube: instalar Android SDK en el script de preparación; ~3 GB).
