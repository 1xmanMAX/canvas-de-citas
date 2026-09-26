# Gestos del lienzo y fotos — Plan de implementación (etapas A y B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En PC la rueda del mouse hace zoom y el botón central mueve el lienzo; las fotos se ven completas en el lienzo, guardan su original en alta y se abren en un visor a pantalla casi completa con zoom y anotaciones.

**Architecture:** Lógica pura y probada en `lib/gestos.js` (mouse vs trackpad) y `lib/vista.js` (matemática de zoom/desplazamiento del visor); la tarjeta de foto se mide sin recortar y admite ancho propio; el original se guarda en el almacén `documentos` de IndexedDB con la clave del id de la foto y en la carpeta como `fotos/<id>.<ext>`; `VisorFoto.svelte` sustituye al editor modal para fotos.

**Tech Stack:** Svelte 5 + Vite, `node:test`, puppeteer-core (e2e existente). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-25-proyectos-en-carpetas-windows-design.md` (partes 3 y 4).

## Global Constraints

- Idioma: nombres, comentarios, UI y commits en español.
- Sin dependencias nuevas en `app/`.
- Formato de `proyectos.json` / `fuentes.json` / `citas.json`: no cambiar campos existentes; los nuevos (`ancho`, `original` en fotos; preferencia en `meta`) son opcionales.
- Trackpad y pantalla táctil: comportamiento **sin cambios** en el lienzo.
- La sincronización actual no debe romperse: los originales de fotos **no** entran todavía en `sincro-almacen.js` (el servidor actual rechaza rutas `fotos/`; se añade en la etapa E con la capacidad `fotos`).
- Commits: `git -c user.email=139194352+1xmanMAX@users.noreply.github.com commit …`, rama `proyectos-en-carpetas`.
- Tras tocar el lienzo: `node tests/e2e/rendimiento.mjs` sin bajar los fps.

## Review Focus

- **Trackpad de Windows (precision touchpad) desplazando con dos dedos**: debe seguir desplazando, no hacer zoom → prueba unitaria con deltas fraccionarios en Task 1.
- **Mouse con rueda "suave" o alta resolución** (deltaY no múltiplo de 100, p. ej. 33.3 en Edge con scroll suave): debe hacer zoom → Task 1 (`wheelDeltaY` múltiplo de 120).
- **Botón central sobre una tarjeta**: debe mover el lienzo, no arrastrar la tarjeta ni abrirla, y no activar el autoscroll del navegador → e2e Task 2.
- **Foto muy alta o muy ancha (panorámica 5:1, captura de pantalla 1:4)**: se ve completa, con un tamaño razonable en el lienzo → unitaria Task 3.
- **Foto enorme (cámara de 48 MP, 20 MB)**: se guarda un original reducido a 4096 px, sin congelar la app ni reventar la memoria → unitaria Task 4 (`tamanoOriginal`).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/src/lib/gestos.js` (nuevo) | `esRuedaDeMouse(e)`, `crearDetectorRueda()` |
| `app/src/lib/preferencias.svelte.js` (nuevo) | Preferencias locales (`P.ruedaMouse`) persistidas en `meta` |
| `app/src/components/Lienzo.svelte` | Rueda = zoom con mouse; botón central = mover |
| `app/src/components/Datos.svelte` | Opción "Rueda del mouse" |
| `app/src/lib/tarjetas.js` | Medida de la foto sin recorte y con `ancho` |
| `app/src/components/Tarjeta.svelte` | `meet`, esquina para redimensionar fotos |
| `app/src/lib/imagen.js` | `prepararFoto(archivo)` → miniatura + original; `tamanoOriginal` |
| `app/src/lib/store.svelte.js` | `guardarOriginalFoto`, `rutaDeDocumento`, `buscarFoto` |
| `app/src/lib/carpeta.svelte.js` | Escribe/lee `fotos/<id>.<ext>` |
| `app/src/lib/vista.js` (nuevo) | Matemática del visor: `ajustar`, `zoomEn`, `aImagen` |
| `app/src/components/VisorFoto.svelte` (nuevo) | Visor a pantalla completa con panel y dibujo |
| `app/src/views/Hub.svelte`, `components/ObjetivoLienzo.svelte`, `components/Celular.svelte` | Usar `prepararFoto` y abrir fotos con `VisorFoto` |
| `app/tests/unit/gestos.test.js`, `fotos.test.js`, `vista.test.js` | Unitarias |
| `app/tests/e2e/todas.mjs` | Suites `gestos` y `fotos` |

---

### Task 1: Detectar rueda de mouse vs trackpad

**Files:**
- Create: `app/src/lib/gestos.js`
- Test: `app/tests/unit/gestos.test.js`

**Interfaces:**
- Produces: `esRuedaDeMouse(e: {deltaMode, deltaX, deltaY, wheelDeltaY?, ctrlKey?}) → boolean`; `crearDetectorRueda(ahora = () => performance.now()) → (e) => 'mouse' | 'trackpad'` (recuerda la última decisión 400 ms para no alternar a mitad de gesto).

- [ ] **Step 1: Write the failing test**

```js
// app/tests/unit/gestos.test.js — mouse vs trackpad (src/lib/gestos.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esRuedaDeMouse, crearDetectorRueda } from '../../src/lib/gestos.js'

test('rueda de mouse clásica: líneas o muescas de 100/120', () => {
  assert.ok(esRuedaDeMouse({ deltaMode: 1, deltaX: 0, deltaY: 3 }))
  assert.ok(esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: 100, wheelDeltaY: -120 }))
  assert.ok(esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: -120, wheelDeltaY: 120 }))
})

test('mouse con desplazamiento suave (deltaY no redondo) sigue siendo mouse', () => {
  assert.ok(esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: 33.33, wheelDeltaY: -120 }))
})

test('trackpad: deltas pequeños, fraccionarios o con componente horizontal', () => {
  assert.ok(!esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: 4.5, wheelDeltaY: -13 }))
  assert.ok(!esRuedaDeMouse({ deltaMode: 0, deltaX: 2, deltaY: 30, wheelDeltaY: -36 }))
  assert.ok(!esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: 12, wheelDeltaY: -15 }))
})

test('pellizco del trackpad (ctrlKey) nunca es mouse', () => {
  assert.ok(!esRuedaDeMouse({ deltaMode: 0, deltaX: 0, deltaY: 100, wheelDeltaY: -120, ctrlKey: true }))
})

test('el detector no cambia de opinión a mitad de un gesto', () => {
  let t = 0
  const det = crearDetectorRueda(() => t)
  assert.equal(det({ deltaMode: 0, deltaX: 0, deltaY: 4, wheelDeltaY: -5 }), 'trackpad')
  t = 100
  // Un evento aislado que parece de mouse dentro del mismo gesto: sigue siendo trackpad.
  assert.equal(det({ deltaMode: 0, deltaX: 0, deltaY: 120, wheelDeltaY: -120 }), 'trackpad')
  t = 700
  assert.equal(det({ deltaMode: 0, deltaX: 0, deltaY: 120, wheelDeltaY: -120 }), 'mouse')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && node --test tests/unit/gestos.test.js`
Expected: FAIL (`Cannot find module '../../src/lib/gestos.js'`).

- [ ] **Step 3: Write minimal implementation**

```js
// app/src/lib/gestos.js
// ¿La rueda viene de un mouse o de un trackpad? Chrome/Edge no lo dicen: se deduce de la forma de
// los eventos. Mouse: líneas (deltaMode 1) o muescas (wheelDeltaY múltiplo de 120, sin componente
// horizontal). Trackpad: deltas pequeños y continuos, a menudo con deltaX. El pellizco del trackpad
// llega con ctrlKey y se trata aparte (zoom).

export function esRuedaDeMouse(e) {
  if (e.ctrlKey) return false
  if (e.deltaMode !== 0) return true
  if (e.deltaX !== 0) return false
  const w = e.wheelDeltaY
  if (typeof w === 'number' && w !== 0) return Math.abs(w) >= 120 && w % 120 === 0
  return Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY)
}

/** Recuerda la decisión mientras llegan eventos seguidos (un mismo gesto): 400 ms de silencio la reinician. */
export function crearDetectorRueda(ahora = () => performance.now()) {
  let ultimo = -Infinity, tipo = null
  return e => {
    const t = ahora()
    if (!tipo || t - ultimo > 400) tipo = esRuedaDeMouse(e) ? 'mouse' : 'trackpad'
    ultimo = t
    return tipo
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && node --test tests/unit/gestos.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/gestos.js app/tests/unit/gestos.test.js
git -c user.email=139194352+1xmanMAX@users.noreply.github.com commit -m "Gestos: distinguir la rueda del mouse del trackpad"
```

---

### Task 2: Lienzo — rueda = zoom, botón central = mover, preferencia

**Files:**
- Create: `app/src/lib/preferencias.svelte.js`
- Modify: `app/src/components/Lienzo.svelte` (efecto de la rueda ~l.110-143; `abajo` ~l.160; `arrastrar` ~l.215)
- Modify: `app/src/components/Datos.svelte` (nueva fila de opción)
- Modify: `app/src/views/Hub.svelte:455` (texto de ayuda)
- Modify: `app/src/App.svelte` (llamar `cargarPreferencias()` junto a `cargar()`)
- Test: `app/tests/e2e/todas.mjs` (suite `gestos`)

**Interfaces:**
- Consumes: `crearDetectorRueda` (Task 1).
- Produces: `P` (`$state` con `ruedaMouse: 'zoom' | 'desplazar'`), `cargarPreferencias(): Promise<void>`, `ponerPreferencia(clave, valor)`.

- [ ] **Step 1: Write the failing e2e test** — añadir a `SUITES` en `tests/e2e/todas.mjs`:

```js
  // Gestos del lienzo en PC: rueda del mouse = zoom; botón central = mover.
  async gestos(b) {
    const s = suite('Gestos del lienzo'), pg = await pagina(b)
    await conEjemplo(pg)
    const zoom = () => pg.$eval('.zoom .porc', e => parseInt(e.textContent))
    const capa = () => pg.$eval('.capa', e => e.style.transform)
    await s.paso('rueda del mouse (muescas de 120) acerca hacia el cursor', async () => {
      const k0 = await zoom()
      const r = await (await pg.$('.lienzo')).boundingBox()
      await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
      for (let i = 0; i < 3; i++) {
        await pg.$eval('.lienzo', (el, p) => el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, deltaMode: 0, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, wheelDeltaY: 120 })), { x: r.x + r.width / 2, y: r.y + r.height / 2 })
        await esperar(30)
      }
      await esperar(300)
      const k1 = await zoom()
      if (!(k1 > k0)) throw new Error(`no acercó (${k0}% → ${k1}%)`)
    })
    await s.paso('deslizar con el trackpad desplaza sin hacer zoom', async () => {
      const k0 = await zoom(), t0 = await capa()
      for (let i = 0; i < 6; i++) {
        await pg.$eval('.lienzo', el => el.dispatchEvent(new WheelEvent('wheel', { deltaX: 3.5, deltaY: 7.25, deltaMode: 0, bubbles: true, cancelable: true })))
        await esperar(20)
      }
      await esperar(500)
      if (await zoom() !== k0) throw new Error('hizo zoom')
      if (await capa() === t0) throw new Error('no desplazó')
    })
    await s.paso('botón central sobre una tarjeta mueve el lienzo sin mover la tarjeta', async () => {
      const nodo = await pg.$('g.nodo')
      const antes = await nodo.evaluate(g => g.getAttribute('transform'))
      const t0 = await capa()
      const r = await nodo.boundingBox()
      await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
      await pg.mouse.down({ button: 'middle' })
      await pg.mouse.move(r.x + r.width / 2 + 120, r.y + r.height / 2 + 60, { steps: 6 })
      await pg.mouse.up({ button: 'middle' })
      await esperar(400)
      if (await nodo.evaluate(g => g.getAttribute('transform')) !== antes) throw new Error('movió la fuente')
      if (await capa() === t0) throw new Error('no movió el lienzo')
      if (await pg.$('dialog[open]')) throw new Error('abrió la fuente')
    })
    await pg.close()
    return s.fin()
  },
```

(Revisar en `todas.mjs` cómo terminan las demás suites — `return s.fin()` o equivalente — y copiar exactamente ese cierre.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npm run build && npm run test:e2e -- gestos`
Expected: FAIL en "rueda del mouse… acerca" (hoy desplaza) y "botón central…" (hoy arrastra la tarjeta).

- [ ] **Step 3: Preferencias**

```js
// app/src/lib/preferencias.svelte.js
// Preferencias de este aparato (no viajan en la sincronización): IndexedDB `meta.preferencias`.
import { leerMeta, ponerMeta } from './store.svelte.js'

class Preferencias {
  /** 'zoom': la rueda del mouse acerca/aleja (recomendado). 'desplazar': la rueda mueve el lienzo. */
  ruedaMouse = $state('zoom')
}
export const P = new Preferencias()

export async function cargarPreferencias() {
  const g = (await leerMeta('preferencias').catch(() => null)) || {}
  if (g.ruedaMouse === 'desplazar' || g.ruedaMouse === 'zoom') P.ruedaMouse = g.ruedaMouse
}

export function ponerPreferencia(clave, valor) {
  P[clave] = valor
  ponerMeta('preferencias', { ruedaMouse: P.ruedaMouse }).catch(() => {})
}
```

En `App.svelte`, donde se llama a `cargar()`, añadir `cargarPreferencias()` (import desde `./lib/preferencias.svelte.js`).

- [ ] **Step 4: Rueda en `Lienzo.svelte`** — reemplazar el cuerpo de `rueda` y el comentario de arriba:

```js
  // Mouse: la rueda hace zoom hacia el cursor (Shift + rueda desplaza) y el botón central mueve.
  // Trackpad: dos dedos desplazan; pellizcar hace zoom (llega como rueda con ctrlKey).
  // Se distingue con lib/gestos.js; en Configuración se puede volver a "la rueda desplaza".
  const detector = crearDetectorRueda()
  $effect(() => {
    const rueda = e => {
      if (e.target.closest?.('.zoom')) return
      e.preventDefault()
      const r = cont.getBoundingClientRect()
      const esZoom = e.ctrlKey || e.metaKey || (!e.shiftKey && P.ruedaMouse === 'zoom' && detector(e) === 'mouse')
      if (esZoom) {
        const paso = e.ctrlKey || e.metaKey ? 0.01 : 0.0022
        zoomEn(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : paso)), e.clientX - r.left, e.clientY - r.top)
        return
      }
      const f = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
      tx -= dx * f
      ty -= dy * f
      programar()
    }
```

(Imports al inicio del `<script>`: `import { crearDetectorRueda } from '../lib/gestos.js'` y `import { P } from '../lib/preferencias.svelte.js'`. Con mouse, una muesca de 100 da `exp(0.22) ≈ 1.25`, igual que los botones +/−.)

- [ ] **Step 5: Botón central** — en `abajo(e)`:

```js
  function abajo(e) {
    if (e.button === 2 || e.target.closest?.('.zoom, button, a, input, textarea')) return
    if (e.button === 1) e.preventDefault() // sin el autoscroll del navegador
    cont.setPointerCapture(e.pointerId)
    anotar(e)
  }
```

y al inicio de `arrastrar(e, …)` (tarjetas y fuentes): con botón central no se arrastra el elemento, se mueve el lienzo:

```js
  function arrastrar(e, { inicio, mover: alMover, fin } = {}) {
    if (e.button === 2) return
    e.stopPropagation()
    if (e.button === 1) { e.preventDefault(); cont.setPointerCapture(e.pointerId); return anotar(e) }
```

Además, añadir al `<div class="lienzo">` el manejador `onauxclick={e => e.button === 1 && e.preventDefault()}` y, en `anotar`, marcar `gesto.central = e.button === 1`; en `arriba`, no llamar `alTocarFondo` si `gesto.central`.

- [ ] **Step 6: Opción en Configuración** — en `Datos.svelte`, en la sección de opciones generales (junto a las demás filas), solo si `!esAndroid`:

```svelte
{#if !esAndroid}
  <div class="campo">
    <span>Rueda del mouse en el lienzo</span>
    <div class="segmentado">
      <button aria-pressed={P.ruedaMouse === 'zoom'} onclick={() => ponerPreferencia('ruedaMouse', 'zoom')}>Zoom</button>
      <button aria-pressed={P.ruedaMouse === 'desplazar'} onclick={() => ponerPreferencia('ruedaMouse', 'desplazar')}>Desplazar</button>
    </div>
  </div>
{/if}
```

(import `{ P, ponerPreferencia }` de `../lib/preferencias.svelte.js`.)

- [ ] **Step 7: Texto de ayuda** — en `Hub.svelte:455` cambiar "(con ratón: Ctrl + rueda)" por "(con mouse: la rueda hace zoom y apretando la rueda arrastras el lienzo)".

- [ ] **Step 8: Verificar**

Run: `cd app && npm test && npm run build && npm run test:e2e -- gestos lienzo && node tests/e2e/rendimiento.mjs`
Expected: todo PASS; fps del rendimiento iguales a los de `main` (±10 %).

- [ ] **Step 9: Commit**

```bash
git add app/src app/tests/e2e/todas.mjs
git -c user.email=139194352+1xmanMAX@users.noreply.github.com commit -m "Lienzo: la rueda del mouse hace zoom y el botón central mueve"
```

---

### Task 3: Tarjeta de foto completa y redimensionable

**Files:**
- Modify: `app/src/lib/tarjetas.js:78-90` (`foto`) y `firma` (~l.95)
- Modify: `app/src/components/Tarjeta.svelte` (imagen `meet`; esquina de tamaño)
- Modify: `app/src/views/Hub.svelte`, `app/src/components/ObjetivoLienzo.svelte` (pasar `redimensionar`)
- Test: `app/tests/unit/fotos.test.js`

**Interfaces:**
- Produces: `medir('fotos', f)` devuelve `iw = w - 16`, `ih = round(iw / proporcion)` sin topes que recorten; `w = clamp(f.ancho ?? auto, 120, 900)` donde `auto` = 200 si `proporcion ≥ 0.75`, si no `max(120, round(184 * proporcion / 0.75) + 16)` para que una foto alta no pase de ~245 px de alto por defecto.
- Produces: prop de `Tarjeta` `redimensionar: { inicio(), mover(dx, dy), fin() } | null` (solo fotos).

- [ ] **Step 1: Failing test**

```js
// app/tests/unit/fotos.test.js — medida de la tarjeta de foto (src/lib/tarjetas.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { medir } from '../../src/lib/tarjetas.js'

const foto = (x = {}) => ({ id: 'f' + Math.random(), titulo: '', texto: '', anotacion: '', imagen: 'data:', proporcion: 4 / 3, trazos: [], ...x })

test('la imagen conserva su proporción (no se recorta)', () => {
  for (const proporcion of [5, 16 / 9, 4 / 3, 1, 0.75, 0.25]) {
    const d = medir('fotos', foto({ proporcion }))
    assert.ok(Math.abs(d.iw / d.ih - proporcion) < 0.02, `${proporcion}: ${d.iw}×${d.ih}`)
  }
})

test('una foto muy alta no queda gigante por defecto', () => {
  const d = medir('fotos', foto({ proporcion: 0.25 }))
  assert.ok(d.ih <= 480, `${d.ih}`)
  assert.ok(d.w >= 120)
})

test('el ancho elegido se respeta dentro de 120–900', () => {
  assert.equal(medir('fotos', foto({ ancho: 500 })).w, 500)
  assert.equal(medir('fotos', foto({ ancho: 50 })).w, 120)
  assert.equal(medir('fotos', foto({ ancho: 5000 })).w, 900)
})
```

Nota: `tarjetas.js` importa `store.svelte.js` (runas de Svelte). Si `node --test` no puede importarlo, mover la función pura de medida a `lib/medidas-foto.js` (`medirFoto(f, envolver)`) y probar esa; `tarjetas.js` la usa. Comprobarlo en el Step 2.

- [ ] **Step 2: Run** — `cd app && node --test tests/unit/fotos.test.js` → FAIL (recorte: `ih` topado en 240 / 90).

- [ ] **Step 3: Implementation** — en `tarjetas.js`:

```js
const ANCHO_FOTO = { min: 120, max: 900 }
function anchoFoto(f) {
  const p = f.proporcion || 4 / 3
  const auto = p >= 0.75 ? 200 : Math.max(ANCHO_FOTO.min, Math.round((184 * p) / 0.75) + 16)
  return Math.min(ANCHO_FOTO.max, Math.max(ANCHO_FOTO.min, Math.round(f.ancho ?? auto)))
}

function foto(f) {
  const w = anchoFoto(f), iw = w - 16
  const ih = Math.max(24, Math.round(iw / (f.proporcion || 4 / 3)))
  let y = 8 + ih + 8
  // (resto igual que hoy: titulo, texto, anotacion con envolver(..., iw, n))
```

y en `firma` añadir `o.ancho` a la lista. Exportar `ANCHO_FOTO`.

En `Tarjeta.svelte` cambiar `preserveAspectRatio="xMidYMid slice"` por `"xMidYMid meet"` (la caja ya tiene la proporción; `meet` evita cualquier recorte por redondeo).

- [ ] **Step 4: Esquina para redimensionar** — en `Tarjeta.svelte`, dentro de la rama de fotos y fuera de `simple`, añadir al final:

```svelte
{#if redimensionar}
  <rect x={d.w - 16} y={d.h - 16} width="18" height="18" rx="3" class="esquina" role="button" tabindex="-1" aria-label="Cambiar tamaño de la foto"
    onpointerdown={e => L.arrastrar(e, { inicio: redimensionar.inicio, mover: redimensionar.mover, fin: redimensionar.fin })} />
{/if}
```

con estilo `.esquina { fill: var(--ink); opacity: 0; cursor: nwse-resize; } :global(.tarjeta:hover) .esquina { opacity: .35; }` y `redimensionar = null` en `$props()`. En `Hub.svelte` (y igual en `ObjetivoLienzo.svelte`) pasar a las fotos:

```js
  function redimensionarFoto(obj) {
    let w0
    return {
      inicio: () => { w0 = medir('fotos', obj).w },
      mover: dx => { obj.ancho = Math.min(ANCHO_FOTO.max, Math.max(ANCHO_FOTO.min, Math.round(w0 + dx))) },
      fin: () => guardarProyecto(p)
    }
  }
```

`<Tarjeta … redimensionar={l === 'fotos' ? redimensionarFoto(o) : null} />`.

- [ ] **Step 5: Verify** — `cd app && npm test && npm run build && npm run test:e2e -- lienzo` → PASS. Revisar la captura del lienzo: la foto de prueba se ve entera.

- [ ] **Step 6: Commit** — `git commit -m "Fotos: la tarjeta muestra la imagen completa y se puede agrandar"`

---

### Task 4: Guardar el original de la foto en alta

**Files:**
- Modify: `app/src/lib/imagen.js` (añadir `tamanoOriginal`, `prepararFoto`)
- Modify: `app/src/lib/store.svelte.js` (añadir `guardarOriginalFoto`, `leerOriginalFoto`, `buscarFoto`, `rutaDeDocumento`)
- Modify: `app/src/lib/carpeta.svelte.js` (`guardarAhora`, `traerCambios`, `conectar`: usar `rutaDeDocumento`)
- Modify: `app/src/views/Hub.svelte`, `components/ObjetivoLienzo.svelte`, `components/Celular.svelte` (usar `prepararFoto` y guardar el original al crear la tarjeta)
- Test: `app/tests/unit/fotos.test.js` (añadir)

**Interfaces:**
- Produces: `tamanoOriginal(ancho, alto, bytes) → { reducir: boolean, ancho, alto }` (reduce si `ancho*alto > 12e6` o `bytes > 15e6`, a 4096 px de lado mayor).
- Produces: `prepararFoto(archivo) → Promise<{ imagen, proporcion, original: Blob, extension }>`.
- Produces (store): `guardarOriginalFoto(foto, blob, extension)` → guarda en `documentos` con clave `foto.id`, pone `foto.original = 'fotos/<id>.<ext>'`, marca el documento pendiente (`cambio(foto.id)`); `leerOriginalFoto(id) → Promise<Blob|null>`; `buscarFoto(id) → { proyecto, foto } | null` (busca en `canvas.fotos` y en `canvas.objetivos[*].fotos`); `rutaDeDocumento(id) → string|null` (fuente → `documento_original`; foto → `original`).

- [ ] **Step 1: Failing test** (añadir a `fotos.test.js`):

```js
import { tamanoOriginal } from '../../src/lib/imagen.js'

test('fotos normales se guardan tal cual', () => {
  assert.deepEqual(tamanoOriginal(4000, 3000, 3e6), { reducir: false, ancho: 4000, alto: 3000 })
})

test('fotos enormes se reducen a 4096 px de lado mayor', () => {
  assert.deepEqual(tamanoOriginal(8000, 6000, 20e6), { reducir: true, ancho: 4096, alto: 3072 })
  assert.deepEqual(tamanoOriginal(3000, 9000, 16e6), { reducir: true, ancho: 1365, alto: 4096 })
})
```

- [ ] **Step 2: Run** → FAIL (`tamanoOriginal` no existe).

- [ ] **Step 3: Implementation** en `imagen.js`:

```js
/** ¿Hay que reducir el original? Solo si es enorme (más de 12 MP o 15 MB): a 4096 px de lado mayor. */
export function tamanoOriginal(ancho, alto, bytes) {
  if (ancho * alto <= 12e6 && bytes <= 15e6) return { reducir: false, ancho, alto }
  const s = 4096 / Math.max(ancho, alto)
  return { reducir: true, ancho: Math.round(ancho * s), alto: Math.round(alto * s) }
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

/** Miniatura para el lienzo (como comprimirFoto) + el original en alta para el visor. */
export async function prepararFoto(archivo) {
  const { imagen, proporcion } = await comprimirFoto(archivo)
  const bmp = await createImageBitmap(archivo)
  const t = tamanoOriginal(bmp.width, bmp.height, archivo.size)
  let original = archivo, extension = EXT[archivo.type] || 'jpg'
  if (t.reducir || !EXT[archivo.type]) {
    const tela = Object.assign(document.createElement('canvas'), { width: t.ancho, height: t.alto })
    tela.getContext('2d').drawImage(bmp, 0, 0, t.ancho, t.alto)
    original = await new Promise(res => tela.toBlob(res, 'image/jpeg', 0.9))
    extension = 'jpg'
  }
  bmp.close?.()
  return { imagen, proporcion, original, extension }
}
```

En `store.svelte.js`:

```js
// --- Originales de fotos (alta resolución): mismo almacén `documentos`, clave = id de la foto ---
export function buscarFoto(id) {
  for (const p of S.proyectos) {
    const c = p.canvas || {}
    const f = (c.fotos || []).find(x => x.id === id) || Object.values(c.objetivos || {}).flatMap(o => o.fotos || []).find(x => x.id === id)
    if (f) return { proyecto: p, foto: f }
  }
  return null
}

export function rutaDeDocumento(id) {
  return S.fuentePorId.get(id)?.documento_original || buscarFoto(id)?.foto.original || null
}

export async function guardarOriginalFoto(foto, blob, extension) {
  await db.poner('documentos', { nombre: `${foto.id}.${extension}`, tipo: blob.type, blob }, foto.id)
  foto.original = `fotos/${foto.id}.${extension}`
  cambio(foto.id)
}

export const leerOriginalFoto = async id => (await db.leer('documentos', id))?.blob || null
```

(Comprobar en `ObjetivoLienzo.svelte` que los sub-lienzos guardan fotos en `canvas.objetivos[clave].fotos`; si el nombre es otro, ajustar `buscarFoto`.)

En `carpeta.svelte.js`:
- `guardarAhora`: reemplazar el bucle de documentos por
  ```js
      for (const id of [...docsPendientes]) {
        const ruta = rutaDeDocumento(id)
        const d = await leerDocumento(id)
        if (ruta && d?.blob) await escribir(C.dir, ruta, d.blob)
        docsPendientes.delete(id)
      }
  ```
- `conectar`: `const ruta = rutaDeDocumento(fid); if (ruta && !(await leerRuta(dir, ruta))) docsPendientes.add(fid)`.
- `traerCambios`: tras el bucle de fuentes, traer originales de fotos que faltan:
  ```js
  for (const p of S.proyectos) for (const f of [...(p.canvas?.fotos || []), ...Object.values(p.canvas?.objetivos || {}).flatMap(o => o.fotos || [])]) {
    if (!f.original || locales.has(f.id)) continue
    const a = await leerRuta(C.dir, f.original)
    if (a) await guardarDocumentoImportado(f.id, a.name, a)
  }
  ```

Al crear fotos (Hub `nuevaFoto` e `insertar`, ObjetivoLienzo, Celular): usar `prepararFoto`; pasar `{ imagen, proporcion }` a la tarjeta y, **después de guardar la tarjeta** (`guardarModal` para la nueva; tras `push` en `insertar`/Celular), llamar `guardarOriginalFoto(tarjetaGuardada, original, extension)` y luego `guardarProyecto(p)`. Para el flujo modal: guardar `{ original, extension }` en `modal.original` al crear y usarlo en `guardarModal` si `modal.nueva`.

- [ ] **Step 4: Run** — `cd app && npm test` → PASS.

- [ ] **Step 5: e2e** — en la suite `lienzo` de `todas.mjs`, en el paso donde se inserta una foto (buscar `IMG`), añadir tras guardarla:

```js
      const cv = await lienzoGuardado(pg)
      const f = cv.fotos.at(-1)
      if (!/^fotos\/.+\.(png|jpg)$/.test(f.original || '')) throw new Error('la foto no guardó su original: ' + f.original)
```

Run: `npm run build && npm run test:e2e -- lienzo` → PASS.

- [ ] **Step 6: Commit** — `git commit -m "Fotos: se guarda el original en alta (fotos/<id>.<ext> en la carpeta)"`

---

### Task 5: Matemática del visor (zoom y coordenadas)

**Files:**
- Create: `app/src/lib/vista.js`
- Test: `app/tests/unit/vista.test.js`

**Interfaces:**
- Produces: `ajustar(anchoImg, altoImg, anchoVista, altoVista, margen = 16) → { k, tx, ty }` (imagen entera centrada); `zoomEn(v, factor, cx, cy, kMin, kMax) → { k, tx, ty }` (el punto bajo el cursor queda quieto); `aImagen(v, x, y, anchoImg, altoImg) → [0..1000, 0..1000]` (punto de pantalla → coordenadas de trazo, recortado a 0–1000); `limitesZoom(ajuste) → { kMin: ajuste.k * 0.5, kMax: 8 }`.

- [ ] **Step 1: Failing test**

```js
// app/tests/unit/vista.test.js — matemática del visor de fotos (src/lib/vista.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ajustar, zoomEn, aImagen } from '../../src/lib/vista.js'

test('ajustar centra la imagen entera', () => {
  const v = ajustar(4000, 2000, 1000, 800, 0)
  assert.equal(v.k, 0.25)
  assert.equal(v.tx, 0)
  assert.equal(v.ty, 150)
})

test('zoomEn deja quieto el punto bajo el cursor', () => {
  const v = { k: 0.5, tx: 10, ty: 20 }
  const antes = { x: (300 - v.tx) / v.k, y: (200 - v.ty) / v.k }
  const n = zoomEn(v, 2, 300, 200, 0.1, 8)
  assert.equal(n.k, 1)
  assert.deepEqual({ x: (300 - n.tx) / n.k, y: (200 - n.ty) / n.k }, antes)
})

test('zoomEn respeta los límites', () => {
  assert.equal(zoomEn({ k: 7, tx: 0, ty: 0 }, 4, 0, 0, 0.1, 8).k, 8)
  assert.equal(zoomEn({ k: 0.2, tx: 0, ty: 0 }, 0.1, 0, 0, 0.1, 8).k, 0.1)
})

test('aImagen convierte a 0–1000 y recorta fuera de la imagen', () => {
  const v = { k: 0.5, tx: 100, ty: 50 }
  assert.deepEqual(aImagen(v, 100, 50, 2000, 1000), [0, 0])
  assert.deepEqual(aImagen(v, 1100, 550, 2000, 1000), [1000, 1000])
  assert.deepEqual(aImagen(v, 600, 300, 2000, 1000), [500, 500])
  assert.deepEqual(aImagen(v, 5000, -40, 2000, 1000), [1000, 0])
})
```

- [ ] **Step 2: Run** → FAIL (módulo no existe).

- [ ] **Step 3: Implementation**

```js
// app/src/lib/vista.js
// Matemática del visor de fotos: la imagen (en px reales) se dibuja con scale(k) y translate(tx, ty).

export function ajustar(anchoImg, altoImg, anchoVista, altoVista, margen = 16) {
  const k = Math.min((anchoVista - 2 * margen) / anchoImg, (altoVista - 2 * margen) / altoImg)
  return { k, tx: (anchoVista - anchoImg * k) / 2, ty: (altoVista - altoImg * k) / 2 }
}

export function zoomEn(v, factor, cx, cy, kMin, kMax) {
  const k = Math.min(kMax, Math.max(kMin, v.k * factor))
  return { k, tx: cx - ((cx - v.tx) * k) / v.k, ty: cy - ((cy - v.ty) * k) / v.k }
}

export const limitesZoom = ajuste => ({ kMin: ajuste.k * 0.5, kMax: 8 })

export function aImagen(v, x, y, anchoImg, altoImg) {
  const a = v => Math.round(Math.min(1000, Math.max(0, v)))
  return [a((((x - v.tx) / v.k) / anchoImg) * 1000), a((((y - v.ty) / v.k) / altoImg) * 1000)]
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "Visor de fotos: matemática de zoom y coordenadas"`

---

### Task 6: `VisorFoto.svelte` — visor a pantalla completa con panel y anotaciones

**Files:**
- Create: `app/src/components/VisorFoto.svelte`
- Modify: `app/src/views/Hub.svelte` y `app/src/components/ObjetivoLienzo.svelte` (para `modal.lista === 'fotos'` y no nueva: `VisorFoto` en lugar de `EditorTarjeta`; las fotos **nuevas** también abren el visor)
- Test: `app/tests/e2e/todas.mjs` (suite `fotos`)

**Interfaces:**
- Consumes: `ajustar`, `zoomEn`, `aImagen`, `limitesZoom` (Task 5); `crearDetectorRueda` (Task 1); `leerOriginalFoto` (Task 4); `TINTAS` de `lib/tarjetas.js`.
- Produces: `<VisorFoto bind:o nueva vinculos onvinculo onguardar oneliminar onduplicar onclose />` — mismas props que `EditorTarjeta` para fotos, así Hub/ObjetivoLienzo solo cambian el componente.

Comportamiento (todo en este componente):
- Contenedor `position: fixed; inset: 0; z-index` sobre todo; fondo `#15140F`. Rejilla: `grid-template-columns: 1fr 320px` si `anchoVentana ≥ 900` y el panel está abierto; si no, imagen a pantalla completa y panel como hoja inferior (`max-height: 55dvh`, con asa para bajarla a solo la barra de herramientas, 56 px).
- Imagen: `<img>` con `src` = URL del original (`URL.createObjectURL(await leerOriginalFoto(o.id))`) o, si no hay, `o.imagen`; tamaño natural leído con `img.decode()`; se dibuja en un `div.capa` con `transform: translate(tx,ty) scale(k)` y `transform-origin: 0 0`, y encima un `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none">` del tamaño natural con los trazos (`vector-effect: non-scaling-stroke`, grosor `t.g * anchoMostrado / 1000` como hoy en `Dibujo.svelte`). Revocar la URL al cerrar.
- Gestos: rueda → si `detector(e) === 'mouse'` o `ctrlKey`: `zoomEn` al cursor (paso `exp(-deltaY*0.0022)`, con ctrl `0.01`); si trackpad sin ctrl: desplazar. Punteros: mapa como en `Lienzo.svelte` — 1 puntero en modo mover (o dedo cuando se dibuja con lápiz) = desplazar; 2 = pellizco (`zoomEn` con la distancia). Doble clic/toque: alterna `ajustar(...)` ↔ 100 % (`k = 1`) centrado en el punto. Teclas: `+`/`=`, `-`, `0` (ajustar), `D` (alternar dibujar), `Ctrl+Z` (deshacer), `Escape` (cerrar guardando).
- Dibujo: `modo = 'mover' | 'dibujar'` (botón y tecla `D`). En `dibujar`, `pointerdown` de mouse/lápiz/dedo (si `pointerType === 'pen'` siempre dibuja, aunque el modo sea mover; con lápiz presente, el dedo mueve) crea trazo `{ c, g, p: ['x,y'] }` con `aImagen`; mover añade puntos si se desplazó ≥ 4 unidades; soltar cierra (un toque deja un punto, como `Dibujo.svelte`). Herramientas en el panel: 4 tintas de `TINTAS` (el amarillo es resaltador, grosor 28 y opacidad .45), Fino/Grueso, Deshacer, Borrar todo.
- Panel: título, texto (textarea), anotación a mano, herramientas de dibujo, botón vínculo (si `o.origen && onvinculo`), vínculos, y pie con Eliminar / Duplicar / Guardar como `EditorTarjeta`. Botón para ocultar/mostrar el panel (icono) siempre visible arriba a la derecha junto a Cerrar; barra flotante de zoom abajo (−, %, +, Ajustar).
- Accesibilidad: `role="dialog" aria-modal="true" aria-label="Foto"`; el foco va al contenedor al abrir.

- [ ] **Step 1: Failing e2e test** — añadir suite:

```js
  // Visor de fotos: abrir, hacer zoom con la rueda, dibujar un trazo y guardarlo.
  async fotos(b) {
    const s = suite('Visor de fotos'), pg = await pagina(b)
    await conEjemplo(pg)
    await s.paso('insertar una foto y abrirla en el visor', async () => {
      const input = await pg.$('input[type=file][accept^="image"]')
      await input.uploadFile(IMG)
      await pg.waitForSelector('.visor-foto', { timeout: 8000 })
    })
    await s.paso('la rueda del mouse hace zoom en el visor', async () => {
      const escala = () => pg.$eval('.visor-foto .capa', e => new DOMMatrix(getComputedStyle(e).transform).a)
      const k0 = await escala()
      const r = await (await pg.$('.visor-foto .area')).boundingBox()
      for (let i = 0; i < 3; i++) {
        await pg.$eval('.visor-foto .area', (el, p) => el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, wheelDeltaY: 120, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true })), { x: r.x + r.width / 2, y: r.y + r.height / 2 })
        await esperar(30)
      }
      if (!((await escala()) > k0 * 1.5)) throw new Error('no hizo zoom')
    })
    await s.paso('dibujar un trazo y guardarlo', async () => {
      await pg.keyboard.press('d')
      const r = await (await pg.$('.visor-foto .area')).boundingBox()
      await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
      await pg.mouse.down()
      await pg.mouse.move(r.x + r.width / 2 + 80, r.y + r.height / 2 + 30, { steps: 8 })
      await pg.mouse.up()
      await pg.screenshot({ path: path.join(SALIDA, 'visor-foto.png') })
      await clicTexto(pg, 'Guardar'); await esperar(500)
      const f = (await lienzoGuardado(pg)).fotos.at(-1)
      if (!f.trazos?.length || f.trazos[0].p.length < 3) throw new Error('no guardó el trazo')
    })
    await s.paso('en pantalla de celular el panel es una hoja inferior', async () => {
      await pg.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true })
      await (await pg.$('g.tarjeta.fotos')).click()
      await pg.waitForSelector('.visor-foto .panel.hoja', { timeout: 5000 })
      await pg.screenshot({ path: path.join(SALIDA, 'visor-foto-movil.png') })
    })
    await pg.close()
    return s.fin()
  },
```

(Verificar el selector real del input de fotos en `Hub.svelte` — `nuevaFoto` — y el cierre de suite usado en `todas.mjs`; ajustar.)

- [ ] **Step 2: Run** — `npm run build && npm run test:e2e -- fotos` → FAIL (`.visor-foto` no existe).

- [ ] **Step 3: Implementar `VisorFoto.svelte`** según el comportamiento descrito arriba (reutilizar la estructura de punteros de `Lienzo.svelte` y el trazo de `Dibujo.svelte`, pero en coordenadas de `aImagen`). Estilos con las variables existentes (`--paper`, `--ink`, `--line`) para el panel.

- [ ] **Step 4: Conectar** — en `Hub.svelte` y `ObjetivoLienzo.svelte`, en el bloque `{:else if modal?.lista}`:

```svelte
  {#key modal.o.id}
    {#if modal.lista === 'fotos'}
      <VisorFoto bind:o={modal.o} nueva={modal.nueva} vinculos={…igual…} onvinculo={…igual…}
        onguardar={guardarModal} oneliminar={eliminarModal} onduplicar={duplicarModal} onclose={() => (modal = null)} />
    {:else}
      <EditorTarjeta … (como hoy) />
    {/if}
  {/key}
```

En `EditorTarjeta.svelte` se puede quitar la rama de fotos y la importación de `Dibujo` solo si ya no se usa en ningún otro sitio (`grep -rn "Dibujo" app/src`).

- [ ] **Step 5: Run** — `npm test && npm run build && npm run test:e2e -- fotos lienzo gestos` → PASS. Mirar `tests/e2e/capturas/visor-foto.png` y `visor-foto-movil.png`.

- [ ] **Step 6: Commit** — `git commit -m "Fotos: visor a pantalla completa con zoom, panel lateral y anotaciones"`

---

### Task 7: Verificación final de la etapa

- [ ] `cd app && npm test` → todo PASS.
- [ ] `npm run build && npm run test:e2e` (todas las suites) → PASS.
- [ ] `node tests/e2e/rendimiento.mjs` → fps comparables a `main`.
- [ ] Probar a mano en el servidor de desarrollo (`http://localhost:5173/`) con mouse y trackpad de la laptop: zoom con rueda, botón central, foto panorámica y vertical, visor.
- [ ] Actualizar `CLAUDE.md` (sección "Estado") con una línea sobre gestos y visor de fotos; commit.
