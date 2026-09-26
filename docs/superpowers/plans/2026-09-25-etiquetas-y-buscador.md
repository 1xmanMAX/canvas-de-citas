# Etiquetas `#`, menciones `@` y buscador (Ctrl+F) — Plan de implementación (etapa C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poner etiquetas `#tema` y menciones `@Persona` a cualquier elemento (notas, listas, voz, fotos, agrupadores, objetivos, fuentes, citas) —escritas en el texto o como chips— y encontrarlas con un buscador general (Ctrl+F) que también combina palabras.

**Architecture:** Lógica pura y probada en `lib/etiquetas.js` (extraer, normalizar, índice, consulta, colores). Un campo opcional `etiquetas: string[]` por elemento con la **convención ya usada por las fuentes**: los temas se guardan sin `#` (`"concreto"`) y las personas con `@` (`"@Villarreal"`). Componentes: acción `autocompletar` (sugiere al teclear `#`/`@`), `CampoEtiquetas.svelte` (chips), chips en las tarjetas del lienzo, `Buscador.svelte` (diálogo global) y búsqueda del Hub con `#`/`@`.

**Tech Stack:** Svelte 5 + Vite, `node:test`, puppeteer-core. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-25-proyectos-en-carpetas-windows-design.md` (parte 5; atajo **Ctrl+F**).

## Global Constraints

- Idioma: nombres, comentarios, UI y commits en español.
- Sin dependencias nuevas en `app/`.
- Contrato JSON: `fuentes[].etiquetas` ya existe (palabras sueltas, p. ej. `"abierto"`): **no cambia su forma**; las menciones se agregan como entradas que empiezan con `@`. En tarjetas, agrupadores y citas el campo `etiquetas` es nuevo y opcional (se omite si está vacío).
- Ctrl+F abre el buscador general, **salvo** con el visor de documentos abierto (ahí sigue buscando en el PDF/HTML).
- Todo funciona igual en PC y en modo Android (mismo código); no compilar APK.
- Rendimiento del lienzo: chips solo en detalle (no en modo `simple`); `node tests/e2e/rendimiento.mjs` sin bajar.
- Commits: `git -c user.email=139194352+1xmanMAX@users.noreply.github.com commit …`, rama `proyectos-en-carpetas`.

## Review Focus

- **Correos y URLs en el texto** (`max@gmail.com`, `https://x.com/#seccion`): no deben crear menciones ni etiquetas → prueba unitaria en Task 1.
- **Tildes y mayúsculas** (`#Hormigón` vs `#hormigon`, `@villarreal` vs `@Villarreal`): son la misma etiqueta al buscar y en el índice; se muestra la forma más usada → Task 1.
- **Números de capítulo o issues** (`#2`, `#1.3`): no son etiquetas (deben empezar con letra) → Task 1.
- **Ctrl+F dentro de un campo de texto o con el visor de PDF abierto**: no debe robar el foco ni romper la búsqueda del PDF → e2e Task 6.
- **Proyecto con muchas tarjetas (tablero grande)**: el índice se recalcula sin trabar al escribir en el buscador → Task 6 usa `$derived` una vez por cambio de datos, no por tecla.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/src/lib/etiquetas.js` (nuevo, puro) | `extraer`, `normalizar`, `etiquetasDe`, `parsearConsulta`, `coincideConsulta`, `indexar`, `resumen`, `colorEtiqueta`, `sugerencias` |
| `app/src/lib/buscador.svelte.js` (nuevo) | Estado global del buscador (`B.abierto`, `B.q`) y `enfocar` (navegar al resultado) |
| `app/src/lib/autocompletar.js` (nuevo) | Acción Svelte `use:autocompletar={{ sugerir }}` para inputs/textareas |
| `app/src/components/CampoEtiquetas.svelte` (nuevo) | Chips editables del campo `etiquetas` |
| `app/src/components/Buscador.svelte` (nuevo) | Diálogo global: resultados agrupados + "Etiquetas y personas" |
| `app/src/lib/tarjetas.js`, `components/Tarjeta.svelte` | Fila de chips bajo la tarjeta |
| `app/src/components/EditorTarjeta.svelte`, `VisorFoto.svelte`, `FuenteForm.svelte`, `CitaForm.svelte`, `EditorAgrupador.svelte` | Autocompletar + `CampoEtiquetas` |
| `app/src/views/Hub.svelte`, `components/ObjetivoLienzo.svelte`, `components/Lienzo.svelte` | Búsqueda con `#`/`@`; centrar y resaltar un elemento al llegar desde el buscador |
| `app/src/App.svelte`, `views/Proyectos.svelte`, `views/General.svelte` | Ctrl+F, botón lupa, montar `Buscador` |
| `claude-skill/canvas-de-citas/scripts/canvas.mjs` (+ copia instalada) | `buscar "#tema"` / `"@Persona"` |
| `app/tests/unit/etiquetas.test.js`, `app/tests/e2e/todas.mjs` (suite `etiquetas`) | Pruebas |

---

### Task 1: Núcleo puro `lib/etiquetas.js`

**Files:** Create `app/src/lib/etiquetas.js`; Test `app/tests/unit/etiquetas.test.js`

**Interfaces (Produces):**
- `normalizar(t: string) → string` — minúsculas, sin tildes, sin `#` inicial (conserva `@`).
- `extraer(texto: string) → { temas: string[], personas: string[] }` — formas tal como se escribieron, sin `#`; personas con `@`. Regla: `#` o `@` al inicio o tras un carácter que no sea letra/número/`/`/`.`/`@`, seguido de una letra; continúa con letras (con tilde), números, `_`, `-`, y `.` solo si lo sigue una letra/número.
- `etiquetasDe(textos: string[], campo?: string[]) → { temas, personas }` (sin duplicados por `normalizar`; primero las del campo).
- `parsearConsulta(q) → { temas: string[], personas: string[], palabras: string[] }` (todas normalizadas).
- `coincideConsulta(item: { texto, temas, personas }, consulta) → boolean` — todas las partes deben estar; las palabras se buscan en el texto normalizado y también en temas/personas.
- `indexar({ proyectos, fuentes, citas }) → Item[]` con `Item = { tipo: 'nota'|'lista'|'audio'|'foto'|'agrupador'|'objetivo'|'fuente'|'cita', id, pid: string|null, clave: string|null (sub-lienzo de objetivo), titulo, texto, temas, personas }`.
- `resumen(items) → { temas: [{ etiqueta, cuenta }], personas: [...] }` (ordenado por cuenta desc; `etiqueta` = forma más usada).
- `colorEtiqueta(t) → número 0..7` (hash estable de `normalizar(t)`).
- `sugerencias(items, prefijo: '#'|'@', parcial: string, autores: string[]) → string[]` (máx. 8, por frecuencia; en `@` incluye apellidos de autores como `@Apellido`).

- [ ] **Step 1: Failing test**

```js
// app/tests/unit/etiquetas.test.js — etiquetas # y menciones @ (src/lib/etiquetas.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraer, normalizar, etiquetasDe, parsearConsulta, coincideConsulta, indexar, resumen, colorEtiqueta, sugerencias } from '../../src/lib/etiquetas.js'

test('extrae etiquetas y menciones del texto', () => {
  assert.deepEqual(extraer('Revisar #retrabajo con @Villarreal y #Hormigón-armado.'), { temas: ['retrabajo', 'Hormigón-armado'], personas: ['@Villarreal'] })
})

test('correos, URLs y números no son etiquetas', () => {
  assert.deepEqual(extraer('max@gmail.com https://x.com/#seccion cap. #2 y #1.3 a@b'), { temas: [], personas: [] })
})

test('el punto final no forma parte de la etiqueta; el interno sí', () => {
  assert.deepEqual(extraer('ver #norma.E060. y @J.Pérez.').temas, ['norma.E060'])
  assert.deepEqual(extraer('ver @J.Pérez.').personas, ['@J.Pérez'])
})

test('normalizar ignora tildes, mayúsculas y el #', () => {
  assert.equal(normalizar('#Hormigón'), 'hormigon')
  assert.equal(normalizar('@Villarreal'), '@villarreal')
})

test('etiquetasDe une el campo y el texto sin duplicados', () => {
  assert.deepEqual(etiquetasDe(['#concreto y @Ana', 'otra vez #Concreto'], ['abierto', '@ana']), { temas: ['abierto', 'concreto'], personas: ['@ana'] })
})

test('consulta combinada: todas las partes deben coincidir', () => {
  const c = parsearConsulta('#retrabajo @Villarreal costo')
  assert.deepEqual(c, { temas: ['retrabajo'], personas: ['@villarreal'], palabras: ['costo'] })
  const item = { texto: 'El costo del retrabajo', temas: ['retrabajo'], personas: ['@Villarreal'] }
  assert.ok(coincideConsulta(item, c))
  assert.ok(!coincideConsulta({ ...item, personas: [] }, c))
  assert.ok(coincideConsulta(item, parsearConsulta('COSTÓ')) === false)
  assert.ok(coincideConsulta(item, parsearConsulta('Retrabájo')))
})

test('indexar recorre tarjetas, sub-lienzos, agrupadores, objetivos, fuentes y citas', () => {
  const p = {
    id: 'proyecto_001', objetivos_especificos: ['Medir #retrabajo'], objetivo_general: '',
    canvas: {
      notas: [{ id: 'n1', texto: 'idea #vial', etiquetas: ['@Ana'] }], listas: [{ id: 'l1', titulo: 'Pendientes', items: [{ t: 'llamar @Luis' }] }],
      audios: [{ id: 'a1', transcripcion: 'hablar de #costos' }], fotos: [{ id: 'f1', titulo: 'Grieta', etiquetas: ['patologia'] }],
      agrupadores: [{ id: 'g1', titulo: 'Marco #teórico' }],
      objetivos: { oe1: { notas: [{ id: 'n2', texto: '#dentro' }], listas: [], audios: [], fotos: [] } }
    }
  }
  const items = indexar({ proyectos: [p], fuentes: [{ id: 'fuente_001', titulo: 'T', autores: ['Villarreal, J.'], etiquetas: ['abierto'] }], citas: [{ id: 'cita_001', proyecto_id: 'proyecto_001', fuente_id: 'fuente_001', contexto: 'cap. 2 #antecedentes' }] })
  const por = id => items.find(i => i.id === id)
  assert.deepEqual(por('n1').personas, ['@Ana'])
  assert.deepEqual(por('l1').personas, ['@Luis'])
  assert.deepEqual(por('a1').temas, ['costos'])
  assert.deepEqual(por('f1').temas, ['patologia'])
  assert.equal(por('g1').tipo, 'agrupador')
  assert.equal(por('n2').clave, 'oe1')
  assert.deepEqual(por('proyecto_001:oe1').temas, ['retrabajo'])
  assert.deepEqual(por('fuente_001').temas, ['abierto'])
  assert.deepEqual(por('cita_001').temas, ['antecedentes'])
})

test('resumen cuenta y muestra la forma más usada', () => {
  const r = resumen([{ temas: ['Vial'], personas: [] }, { temas: ['vial'], personas: [] }, { temas: ['vial', 'costos'], personas: ['@Ana'] }])
  assert.deepEqual(r.temas, [{ etiqueta: 'vial', cuenta: 3 }, { etiqueta: 'costos', cuenta: 1 }])
  assert.deepEqual(r.personas, [{ etiqueta: '@Ana', cuenta: 1 }])
})

test('color estable por etiqueta', () => {
  assert.equal(colorEtiqueta('#Hormigón'), colorEtiqueta('hormigon'))
  assert.ok(colorEtiqueta('x') >= 0 && colorEtiqueta('x') < 8)
})

test('sugerencias por prefijo y autores', () => {
  const items = [{ temas: ['vial', 'vivienda'], personas: ['@Vera'] }, { temas: ['vial'], personas: [] }]
  assert.deepEqual(sugerencias(items, '#', 'vi', []), ['vial', 'vivienda'])
  assert.deepEqual(sugerencias(items, '@', 'v', ['Villarreal, J.', 'Otro, A.']), ['@Vera', '@Villarreal'])
})
```

- [ ] **Step 2: Run** — `cd app && node --test tests/unit/etiquetas.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementation**

```js
// app/src/lib/etiquetas.js
// Etiquetas (#tema) y menciones (@Persona) en todo el lienzo. Puro: se prueba sin navegador.
// Convención del campo `etiquetas` (la misma que ya usan las fuentes): temas sin "#", personas con "@".

const LETRA = '\\p{L}'
const CUERPO = '[\\p{L}\\p{N}_-]*(?:\\.[\\p{L}\\p{N}_-]+)*'
// # o @ al inicio o tras algo que no sea letra, número, "/", "." o "@" (así no entran correos ni URLs).
const RE = new RegExp(`(^|[^\\p{L}\\p{N}/.@&])([#@])(${LETRA}${CUERPO})`, 'gu')

export const normalizar = t => String(t ?? '').replace(/^#/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function extraer(texto) {
  const temas = [], personas = []
  for (const m of String(texto ?? '').matchAll(RE)) (m[2] === '@' ? personas : temas).push(m[2] === '@' ? '@' + m[3] : m[3])
  return { temas, personas }
}

function unicos(lista) {
  const vistos = new Set(), out = []
  for (const t of lista) { const n = normalizar(t); if (!vistos.has(n)) { vistos.add(n); out.push(t) } }
  return out
}

export function etiquetasDe(textos, campo = []) {
  const temas = [], personas = []
  for (const e of campo || []) (String(e).startsWith('@') ? personas : temas).push(String(e).replace(/^#/, ''))
  for (const t of textos) { const x = extraer(t); temas.push(...x.temas); personas.push(...x.personas) }
  return { temas: unicos(temas), personas: unicos(personas) }
}

export function parsearConsulta(q) {
  const temas = [], personas = [], palabras = []
  for (const p of String(q ?? '').trim().split(/\s+/).filter(Boolean)) {
    if (p.length > 1 && p[0] === '#') temas.push(normalizar(p))
    else if (p.length > 1 && p[0] === '@') personas.push(normalizar(p))
    else palabras.push(normalizar(p))
  }
  return { temas, personas, palabras }
}

export function coincideConsulta(item, c) {
  const temas = item.temas.map(normalizar), personas = item.personas.map(normalizar)
  const texto = normalizar(item.texto) + ' ' + temas.join(' ') + ' ' + personas.join(' ')
  return c.temas.every(t => temas.includes(t)) && c.personas.every(p => personas.includes(p)) && c.palabras.every(w => texto.includes(w))
}

const TIPO_LISTA = { notas: 'nota', listas: 'lista', audios: 'audio', fotos: 'foto' }
const textosTarjeta = o => [o.titulo, o.texto, o.anotacion, o.transcripcion, ...(o.items || []).map(i => i.t)].filter(Boolean)

function item(tipo, id, pid, clave, titulo, textos, campo) {
  return { tipo, id, pid, clave, titulo, texto: textos.join(' '), ...etiquetasDe(textos, campo) }
}

export function indexar({ proyectos = [], fuentes = [], citas = [] }) {
  const out = []
  for (const p of proyectos) {
    const c = p.canvas || {}
    const tablero = (t, clave) => {
      for (const [lista, tipo] of Object.entries(TIPO_LISTA))
        for (const o of t[lista] || []) out.push(item(tipo, o.id, p.id, clave, o.titulo || '', textosTarjeta(o), o.etiquetas))
      for (const g of t.agrupadores || []) out.push(item('agrupador', g.id, p.id, clave, g.titulo || '', [g.titulo || ''], g.etiquetas))
    }
    tablero(c, null)
    for (const [clave, t] of Object.entries(c.objetivos || {})) tablero(t, clave)
    const objetivos = [['og', p.objetivo_general], ...(p.objetivos_especificos || []).map((o, i) => [`oe${i + 1}`, o])]
    for (const [clave, texto] of objetivos) if (texto) out.push(item('objetivo', `${p.id}:${clave}`, p.id, clave, texto, [texto]))
  }
  for (const f of fuentes) out.push(item('fuente', f.id, null, null, f.titulo || '', [f.titulo, f.tema, ...(f.autores || []), f.revista_o_editorial, f.notas_correccion].filter(Boolean), f.etiquetas))
  for (const k of citas) out.push(item('cita', k.id, k.proyecto_id, null, k.cita_en_texto || '', [k.cita_en_texto, k.contexto].filter(Boolean), k.etiquetas))
  return out
}

function contar(listas) {
  const m = new Map()
  for (const t of listas.flat()) {
    const n = normalizar(t), e = m.get(n) || { formas: new Map(), cuenta: 0 }
    e.cuenta++
    e.formas.set(t, (e.formas.get(t) || 0) + 1)
    m.set(n, e)
  }
  return [...m.values()]
    .map(e => ({ etiqueta: [...e.formas].sort((a, b) => b[1] - a[1])[0][0], cuenta: e.cuenta }))
    .sort((a, b) => b.cuenta - a.cuenta || a.etiqueta.localeCompare(b.etiqueta))
}

export const resumen = items => ({ temas: contar(items.map(i => i.temas)), personas: contar(items.map(i => i.personas)) })

export function colorEtiqueta(t) {
  let h = 0
  for (const ch of normalizar(t)) h = (h * 31 + ch.codePointAt(0)) >>> 0
  return h % 8
}

export function sugerencias(items, prefijo, parcial, autores = []) {
  const r = resumen(items)
  let lista = (prefijo === '@' ? r.personas : r.temas).map(x => x.etiqueta)
  if (prefijo === '@') for (const a of autores) { const ap = String(a).split(',')[0].trim().replace(/\s+/g, ''); if (ap) lista.push('@' + ap) }
  const q = normalizar(prefijo === '@' ? '@' + parcial : parcial)
  return unicos(lista.filter(t => normalizar(t).startsWith(q))).slice(0, 8)
}
```

- [ ] **Step 4: Run** → PASS (10 tests). Si falla "el punto final…": revisar `CUERPO` (el `.` solo si lo sigue letra/número).

- [ ] **Step 5: Commit** — `git commit -m "Etiquetas: núcleo de # y @ (extraer, índice, consulta)"`

---

### Task 2: Chips en las tarjetas del lienzo

**Files:** Modify `app/src/lib/tarjetas.js` (`medir` añade `chips`), `app/src/components/Tarjeta.svelte`; Test: e2e en Task 6.

**Interfaces:** Consumes `etiquetasDe`, `colorEtiqueta`. Produces: `medir(lista, o)` devuelve además `chips: [{ t, x, w, color, persona }]` y `chipsY` (fila bajo el contenido; `h` crece 24 px si hay chips). Máx. 3 chips + uno `+n`.

- [ ] **Step 1:** En `tarjetas.js`, envolver `medir`: tras `MEDIR[lista](obj)`, calcular
```js
import { etiquetasDe, colorEtiqueta } from './etiquetas.js'
import { F, medirTexto } from './texto.js' // usar la función de ancho de texto que ya exista en texto.js (buscarla: `grep -n "export" app/src/lib/texto.js`)
const PALETA_CHIP = ['#E8E1F5', '#DDEBF7', '#DFF2E4', '#FBEBD3', '#F8DEDC', '#E3F1F1', '#F2EED9', '#ECE3DA']
function chipsDe(o, w) {
  const { temas, personas } = etiquetasDe(textoDe(o) ? [textoDe(o)] : [], o.etiquetas)
  const todas = [...temas.map(t => ({ t: '#' + t, persona: false })), ...personas.map(t => ({ t, persona: true }))]
  const out = []; let x = 8
  for (const [i, c] of todas.entries()) {
    const ancho = Math.ceil(medirTexto(c.t, '600 10.5px "Work Sans", system-ui, sans-serif')) + 12
    const resto = todas.length - i
    if (x + ancho > w - 8 || i === 3) { if (resto) out.push({ t: `+${resto}`, x, w: 26, color: '#EEE', persona: false }); break }
    out.push({ ...c, x, w: ancho, color: c.persona ? '#FFFFFF' : PALETA_CHIP[colorEtiqueta(c.t)] })
    x += ancho + 4
  }
  return out
}
```
y en `medir`: `const chips = chipsDe(obj, d.w); if (chips.length) d = { ...d, chips, chipsY: d.h - 6, h: d.h + 24 }`. Añadir `o.etiquetas?.join('|')` a `firma`. (Si `texto.js` no exporta una medición de ancho, usar el mismo canvas 2D que usa `envolver` y exportarlo como `anchoTexto`.)

- [ ] **Step 2:** En `Tarjeta.svelte`, al final del contenido no-simple de cada tipo (antes del cierre del `Arrastrable`), si `d.chips`:
```svelte
{#if !simple && d.chips}
  {#each d.chips as c}
    <g transform="translate({c.x} {d.chipsY})" class="chip" class:persona={c.persona}>
      <rect width={c.w} height="17" rx="8.5" fill={c.color} />
      <text x={c.w / 2} y="12" text-anchor="middle">{c.t}</text>
    </g>
  {/each}
{/if}
```
estilos: `.chip text { font: 600 10.5px 'Work Sans', system-ui, sans-serif; fill: #3A372F; } .chip.persona rect { stroke: #2F4FB5; stroke-width: 1; } .chip.persona text { fill: #2F4FB5; }`.

- [ ] **Step 3:** `npm test && npm run build && npm run test:e2e -- lienzo && node tests/e2e/rendimiento.mjs` → PASS y fps sin bajar.
- [ ] **Step 4: Commit** — `git commit -m "Lienzo: chips de etiquetas y menciones en las tarjetas"`

---

### Task 3: Autocompletar `#`/`@` y campo de chips

**Files:** Create `app/src/lib/autocompletar.js`, `app/src/components/CampoEtiquetas.svelte`, `app/src/lib/buscador.svelte.js`; Modify `EditorTarjeta.svelte`, `VisorFoto.svelte`, `FuenteForm.svelte`, `CitaForm.svelte`, `EditorAgrupador.svelte` (+ `lib/agrupadores.js`/Hub para guardar `etiquetas` del agrupador).

**Interfaces:**
- `lib/buscador.svelte.js` produce `B = $state({ abierto: false, q: '', resaltar: null })`, `indiceActual()` (`$derived` sobre `S`: `indexar({ proyectos: S.proyectos, fuentes: S.fuentes, citas: S.citas })`), `sugerir(prefijo, parcial)` → `sugerencias(indiceActual(), prefijo, parcial, S.fuentes.flatMap(f => f.autores || []))`.
- Acción `autocompletar(nodo, { sugerir })`: al teclear, mira la palabra bajo el cursor; si empieza con `#` o `@` (y cumple la regla de `extraer`), muestra una lista flotante (div con `position: fixed` en `document.body`, bajo el campo) con `sugerir(prefijo, parcial)`; ↑/↓ elige, Enter/Tab inserta (reemplaza la palabra y deja un espacio), Esc cierra (sin cerrar el diálogo: `stopPropagation`). Clic en una sugerencia inserta. Se destruye con el campo.
- `<CampoEtiquetas bind:valor />` (`valor: string[]`): chips (temas con `#` delante al mostrarse, personas tal cual), una `x` para quitar, input que acepta `#tema`, `@Persona` o `tema` al pulsar Enter/coma, con `use:autocompletar`. Guarda temas sin `#`.

- [ ] **Step 1:** e2e (en Task 6 se amplía): añadir a la suite nueva `etiquetas` el paso "autocompletar al escribir #": crear nota con texto `#vial`, guardar; abrir otra nota nueva, escribir `#vi` → aparece `.autocompletar li` con `vial`; Enter → el textarea contiene `#vial `. Correr → FAIL.
- [ ] **Step 2:** Implementar los tres archivos.
- [ ] **Step 3:** Usar `use:autocompletar={{ sugerir }}` en: textarea/título de nota, título y cada tarea de lista, transcripción de audio, título/texto/anotación de foto (`VisorFoto`), contexto de cita, nombre del agrupador. Añadir `<CampoEtiquetas bind:valor={o.etiquetas} />` en `EditorTarjeta` (todas las listas), `VisorFoto` (panel), `CitaForm` y `EditorAgrupador`; en `FuenteForm` reemplazar el input "Etiquetas (separadas por coma)" por `CampoEtiquetas` (mismo campo, misma forma). Al guardar, si `etiquetas` queda vacío se elimina (`delete o.etiquetas`).
- [ ] **Step 4:** `npm run build && npm run test:e2e -- etiquetas lienzo fotos` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Etiquetas: autocompletar # y @ y campo de chips en todos los elementos"`

---

### Task 4: Centrar y resaltar un elemento en el lienzo

**Files:** Modify `app/src/components/Lienzo.svelte` (export `centrarEn`), `app/src/views/Hub.svelte`, `app/src/components/ObjetivoLienzo.svelte`.

**Interfaces:** Produces `lienzo.centrarEn({ x, y, w, h })` (zoom a `min(1, ajuste)` y centra la caja); Hub/ObjetivoLienzo leen `B.resaltar` (`{ id }`), buscan la caja del elemento (`cajas(cv)`, fuentes por `posiciones`, agrupadores), llaman `centrarEn` y la marcan `resaltado` 2.5 s; luego `B.resaltar = null`.

- [ ] **Step 1:** e2e en la suite `etiquetas`: "ir a una tarjeta desde el buscador la centra y resalta" (se completa en Task 6). FAIL.
- [ ] **Step 2:** Implementar `centrarEn` en `Lienzo.svelte`:
```js
  /** Centra una caja del mundo en la vista (con zoom para verla cómoda). */
  export function centrarEn(c) {
    if (!W || !H) return
    const nk = acotar(Math.min(1, (W * 0.6) / c.w, (H * 0.6) / c.h))
    k = nk
    tx = W / 2 - (c.x + c.w / 2) * nk
    ty = H / 2 - (c.y + c.h / 2) * nk
    programar(true)
  }
```
y el `$effect` en Hub/ObjetivoLienzo que reacciona a `B.resaltar`.
- [ ] **Step 3/4:** verificar con la suite de Task 6. **Commit** — `git commit -m "Lienzo: centrar y resaltar un elemento pedido por el buscador"`

---

### Task 5: Búsqueda del Hub con `#`/`@`

**Files:** Modify `app/src/views/Hub.svelte`, `app/src/components/ObjetivoLienzo.svelte` (si tiene buscador), `app/src/lib/tarjetas.js` (`coincideTarjeta`), `app/src/lib/citas.js` (`coincide` de fuentes).

- [ ] **Step 1:** Unit test en `etiquetas.test.js`: `coincideConsulta` ya cubre; añadir e2e en suite `etiquetas`: en el Hub escribir `#vial` en `#buscar-fuente` → la nota con `#vial` no está `.atenuada` y otra nota sí. FAIL.
- [ ] **Step 2:** `coincideTarjeta(o, q)` pasa a `coincideConsulta({ texto: textoDe(o), ...etiquetasDe([textoDe(o)], o.etiquetas) }, parsearConsulta(q))`; `coincide(f, q)` de fuentes: si `q` contiene `#` o `@`, usar `coincideConsulta` con `etiquetasDe([...], f.etiquetas)`; si no, igual que hoy. Placeholder del buscador del Hub: "Buscar (usa #tema o @persona)…".
- [ ] **Step 3:** e2e PASS. **Commit** — `git commit -m "Hub: el buscador entiende #tema y @persona"`

---

### Task 6: Buscador general (Ctrl+F)

**Files:** Create `app/src/components/Buscador.svelte`; Modify `App.svelte` (montar, Ctrl+F), `views/Proyectos.svelte`, `views/Hub.svelte`, `views/General.svelte` (botón lupa `aria-label="Buscar en todo"`), `lib/buscador.svelte.js` (`enfocar(item)`).

**Comportamiento:**
- `App.svelte` `teclas`: `if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !V.archivo) { e.preventDefault(); B.abierto = true }` (`V` = estado del visor de documentos, `lib/visor.svelte.js`; con un documento abierto, Ctrl+F sigue en el visor).
- `Buscador.svelte`: `<Modal titulo="Buscar en todo" ancho={720}>`; input con `use:autocompletar`, foco al abrir, `bind:value={B.q}`; pestañas "Resultados" / "Etiquetas y personas". Resultados = `indiceActual().filter(i => coincideConsulta(i, parsearConsulta(B.q)))`, agrupados por tipo (orden: notas, listas, voz, fotos, agrupadores, objetivos, fuentes, citas), máx. 30 por grupo con "ver más"; cada fila: icono, título o fragmento (60 caracteres alrededor de la primera palabra encontrada), chips de sus etiquetas, nombre del proyecto. "Etiquetas y personas": `resumen(indiceActual())` como nubes de chips con cuenta; tocar uno pone `B.q = '#tema'` y vuelve a Resultados.
- `enfocar(item)`: cierra el buscador y navega: tarjeta/agrupador → `#/p/<pid>` o `#/p/<pid>/o/<clave>` y `B.resaltar = { id }`; objetivo → `#/p/<pid>/o/<clave>`; fuente → `#/citas` con la fuente seleccionada (si `General` admite selección por hash usarla; si no, `#/p/<pid>/f/<fid>` del primer proyecto con cita); cita → `#/p/<pid>/f/<fuente_id>`.

- [ ] **Step 1: e2e** — suite `etiquetas` completa en `todas.mjs`:
```js
  // Etiquetas #/@ y buscador general (Ctrl+F).
  async etiquetas(b) {
    const s = suite('Etiquetas y buscador'), pg = await pagina(b)
    await conEjemplo(pg)
    const nota = async texto => {
      await pg.click('button[aria-label="Añadir nota"]')
      await pg.type('dialog[open] textarea', texto)
      await clicTexto(pg, 'Guardar'); await esperar(400)
    }
    await s.paso('una nota con #tema y @persona muestra sus chips', async () => {
      await nota('Revisar #vial con @Villarreal')
      const chips = await pg.$$eval('g.tarjeta.notas .chip text', ts => ts.map(t => t.textContent))
      if (!chips.includes('#vial') || !chips.includes('@Villarreal')) throw new Error('chips: ' + chips)
    })
    await s.paso('autocompletar al escribir #', async () => {
      await pg.click('button[aria-label="Añadir nota"]')
      await pg.type('dialog[open] textarea', 'otra idea #vi')
      await pg.waitForSelector('.autocompletar li', { timeout: 3000 })
      await pg.keyboard.press('Enter')
      const v = await pg.$eval('dialog[open] textarea', t => t.value)
      if (!v.includes('#vial ')) throw new Error('quedó: ' + v)
      await clicTexto(pg, 'Guardar'); await esperar(300)
    })
    await s.paso('el buscador del lienzo filtra por #tema', async () => {
      await nota('sin etiqueta')
      await pg.type('#buscar-fuente', '#vial'); await esperar(300)
      const atenuadas = await pg.$$eval('g.tarjeta.notas', gs => gs.map(g => [g.textContent.includes('sin etiqueta'), g.classList.contains('atenuada')]))
      if (!atenuadas.some(([sin, at]) => sin && at)) throw new Error('no atenuó la nota sin etiqueta')
      if (atenuadas.some(([sin, at]) => !sin && at)) throw new Error('atenuó una nota con #vial')
      await pg.$eval('#buscar-fuente', i => { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })) })
    })
    await s.paso('Ctrl+F abre el buscador general y encuentra por @persona', async () => {
      await pg.keyboard.down('Control'); await pg.keyboard.press('f'); await pg.keyboard.up('Control')
      await pg.waitForSelector('dialog[open] .buscador input', { timeout: 3000 })
      await pg.type('dialog[open] .buscador input', '@villarreal')
      await pg.waitForSelector('dialog[open] .resultado', { timeout: 3000 })
      await pg.screenshot({ path: path.join(SALIDA, 'buscador.png') })
    })
    await s.paso('elegir un resultado centra y resalta la tarjeta', async () => {
      await pg.click('dialog[open] .resultado'); await esperar(900)
      if (await pg.$('dialog[open]')) throw new Error('no cerró el buscador')
      if (!(await pg.$('g.tarjeta.notas rect.marca'))) throw new Error('no resaltó la tarjeta')
    })
    await s.paso('pestaña Etiquetas y personas cuenta cada una', async () => {
      await pg.click('button[aria-label="Buscar en todo"]')
      await clicTexto(pg, 'Etiquetas y personas')
      const txt = await pg.$eval('dialog[open] .buscador', d => d.textContent)
      if (!/#vial\s*2/.test(txt)) throw new Error('no cuenta #vial: ' + txt.slice(0, 200))
      await pg.keyboard.press('Escape')
    })
    if (pg.errores.length) s.fallas.push(...pg.errores)
    return s
  },
```
Run → FAIL.

- [ ] **Step 2:** Implementar `Buscador.svelte`, `enfocar`, Ctrl+F y los botones lupa.
- [ ] **Step 3:** `npm run build && npm run test:e2e -- etiquetas visor lienzo` → PASS (la suite `visor` confirma que Ctrl+F sigue buscando en el PDF).
- [ ] **Step 4: Commit** — `git commit -m "Buscador general: Ctrl+F, resultados por tipo y nube de etiquetas y personas"`

---

### Task 7: Skill de Claude — buscar por `#` y `@`

**Files:** Modify `claude-skill/canvas-de-citas/scripts/canvas.mjs` (`C.buscar`), `claude-skill/canvas-de-citas/SKILL.md` (una línea); luego copiar a `~/.claude/skills/canvas-de-citas/`.

- [ ] **Step 1:** Prueba manual reproducible (la skill no tiene suite): crear carpeta temporal con `proyectos.json` que tenga una nota `#vial @Ana`, correr `node claude-skill/canvas-de-citas/scripts/canvas.mjs buscar "#vial" --carpeta <tmp>` (revisar en el script cómo recibe la carpeta: `carpeta.txt` o `--carpeta`) → hoy no la encuentra por etiqueta de campo (`etiquetas: ["vial"]` sin texto). FAIL.
- [ ] **Step 2:** En `C.buscar`, si la consulta tiene `#`/`@`, usar la misma lógica: copiar `extraer`/`normalizar`/`etiquetasDe`/`parsearConsulta`/`coincideConsulta` en `claude-skill/canvas-de-citas/scripts/etiquetas.mjs` (copia exacta de `app/src/lib/etiquetas.js`, con comentario "copia de app/src/lib/etiquetas.js: mantener iguales") y aplicarla a fuentes, citas y tarjetas con su campo `etiquetas`. En `SKILL.md`: "`buscar "#tema"` o `"@Persona"` encuentra por etiquetas y menciones (campo `etiquetas`: temas sin `#`, personas con `@`)".
- [ ] **Step 3:** Repetir el comando → la encuentra. Copiar la carpeta de la skill a `~/.claude/skills/canvas-de-citas/` (sin tocar `carpeta.txt` instalado).
- [ ] **Step 4: Commit** — `git commit -m "Skill canvas-de-citas: buscar por #tema y @persona"`

---

### Task 8: Verificación final de la etapa

- [ ] `cd app && npm test` → PASS.
- [ ] `npm run build && npm run test:e2e` → PASS (salvo la intermitencia preexistente de `android › nota de voz`, anotada).
- [ ] `node tests/e2e/rendimiento.mjs` → fps comparables.
- [ ] `CLAUDE.md`: línea sobre etiquetas y buscador (Ctrl+F). Commit.
