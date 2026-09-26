# Un proyecto, una carpeta — Plan de implementación (etapa D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada proyecto se guarda en su propia carpeta (sus JSON, documentos, fotos y `CLAUDE.md`); "Nuevo proyecto" crea su carpeta y "Abrir proyecto" carga una carpeta tal como estaba, aunque venga de otra instalación.

**Architecture:** Lógica pura en `lib/reparto.js` (qué va a cada carpeta, unir, renumerar ids que chocan) con vectores de prueba compartidos que la etapa E reutiliza en Rust. `lib/almacen-carpeta.js` da una interfaz de archivos común (File System Access hoy; el puente de la app de Windows en la etapa E). `lib/carpetas.svelte.js` reemplaza a `carpeta.svelte.js`: registro de carpetas físicas, cada una con sus proyectos (y opcionalmente la "biblioteca" de fuentes sin proyecto), guardado y recogida de cambios externos por carpeta. IndexedDB sigue siendo la caché rápida.

**Tech Stack:** Svelte 5 + Vite, `node:test`, puppeteer-core (carpetas simuladas con OPFS). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-25-proyectos-en-carpetas-windows-design.md` (parte 1).

## Global Constraints

- Idioma: nombres, comentarios, UI y commits en español. Commits en `main`.
- Formato de cada carpeta = el de hoy (`proyectos.json`, `fuentes.json`, `citas.json`, `fuentes/<id>/documento.<ext>`, `fotos/<id>.<ext>`, `CLAUDE.md`, `eliminados.json`): contrato con las skills intacto; `serializar` igual (orden de campos).
- **Nunca perder datos:** una fuente sin citas en ningún proyecto se escribe en la carpeta marcada como biblioteca; la carpeta migrada del formato anterior es biblioteca hasta que se elija otra. Si no hay biblioteca, esas fuentes quedan en IndexedDB y Configuración lo avisa.
- Android no tiene carpetas (sincroniza con la PC): nada de esto se muestra en modo Android.
- Sin dependencias nuevas; la lógica pura se prueba con `node --test`.

## Review Focus

- **Migración de la carpeta actual de Max** (un proyecto, 50 fuentes, 31 documentos): al abrir la versión nueva todo sigue en la misma carpeta, sin perder fuentes ni documentos → e2e Task 4 (migración).
- **Abrir una carpeta de otra PC con ids que chocan** (`proyecto_001`, `fuente_001` distintos): se renumera lo entrante y sus referencias (citas, lienzo, conexiones, sub-lienzos, agrupadores, ruta del documento) → unit Task 1 + e2e Task 5.
- **La misma fuente en dos proyectos**: queda en las dos carpetas y editarla actualiza ambas → unit Task 1 + e2e Task 5.
- **Permisos del navegador perdidos** tras reiniciar: los proyectos siguen visibles (IndexedDB) y un botón da permiso a todas las carpetas → e2e Task 5.
- **Cambios externos de la skill** (`eliminados.json`, JSON editado) en una carpeta de proyecto se recogen igual que hoy → e2e Task 4.

---

### Task 1: `lib/reparto.js` (puro) + vectores compartidos

**Files:** Create `app/src/lib/reparto.js`, `app/tests/unit/reparto.test.js`, `app/tests/vectores/reparto.json`.

**Interfaces (Produces):**
- `repartir(datos, carpetas) → Map<clave, { proyectos, fuentes, citas }>` con `carpetas: [{ clave, proyectos: string[], biblioteca: boolean }]`. Reglas: cada proyecto va a la carpeta que lo lista; cada cita a la carpeta de su `proyecto_id`; cada fuente a toda carpeta con alguna cita suya, y si no tiene citas en ningún proyecto con carpeta, a las carpetas `biblioteca`. Orden de los arreglos = orden de entrada.
- `docsDe(parte) → string[]` rutas `documento_original` de sus fuentes + `original` de las fotos de sus proyectos (lienzo y sub-lienzos).
- `renumerar(entrantes, existentes, nuevoId) → { datos, mapa }`: `entrantes`/`existentes` = `{ proyectos, fuentes, citas }`; `nuevoId(col)` da ids nuevos. Misma fuente = mismo `id` y mismo título normalizado, o mismo DOI normalizado, o mismo título+año normalizados (se usa el id existente). Proyecto/cita con id existente y contenido distinto (proyecto: otro título; cita: otro `fuente_id`/`proyecto_id`/`pagina`/`cita_en_texto`) → id nuevo. Reescribe referencias: `citas[].fuente_id/proyecto_id`, `canvas.posiciones` (claves), `canvas.conexiones[].desde/hasta`, `canvas.objetivos[*].fuentes[].id` y sus `conexiones`, `agrupadores[].miembros` (lienzo y sub-lienzos), `documento_original` (`fuentes/<viejo>/` → `fuentes/<nuevo>/`). `mapa = { fuentes: {viejo: nuevo}, proyectos: {...}, citas: {...} }` (para renombrar los documentos en la carpeta).
- `app/tests/vectores/reparto.json`: `[{ nombre, datos, carpetas, esperado: { <clave>: { proyectos: [ids], fuentes: [ids], citas: [ids] } } }]` (ids, para compararlos también desde Rust).

- [ ] Step 1: test (vectores + casos de `renumerar`: fuente igual por DOI, fuente distinta con mismo id, proyecto que choca, referencias reescritas en lienzo/sub-lienzo/agrupador/conexiones/documento). Run → FAIL.
- [ ] Step 2: implementar. Run → PASS. Commit "Carpetas: reparto por proyecto y renumeración de ids (puro)".

### Task 2: `lib/almacen-carpeta.js`

**Interfaces (Produces):** `almacenDeHandle(dir) → Almacen` con `{ tipo: 'navegador', nombre, handle, permiso(): Promise<'granted'|'prompt'|'denied'>, pedirPermiso(): Promise<boolean>, leer(ruta): Promise<File|null>, escribir(ruta, contenido: string|Blob), borrar(ruta): Promise<void>, subcarpeta(nombre): Promise<Almacen>, mismo(otro): Promise<boolean> }`. Mover `escribir`/`leerRuta` de `carpeta.svelte.js` aquí.

- [ ] Se prueba en e2e (Task 5, OPFS). Commit junto con Task 3.

### Task 3: `lib/carpetas.svelte.js` (reemplaza `carpeta.svelte.js`)

**Interfaces (Produces):**
- Estado `CS = $state({ lista: [{ clave, nombre, proyectos: [], biblioteca, estado: 'conectada'|'sin-permiso'|'error', error, guardado }], soportado })`.
- `iniciarCarpetas()` (App): lee `meta.carpetas` (`[{ clave, nombre, handle, proyectos, biblioteca }]`); **migración**: si existe `meta.carpeta` (formato anterior) y no `meta.carpetas`, crea una entrada con ese handle, `proyectos` = ids de proyectos que hay en ese `proyectos.json` (o todos los de IndexedDB si no se puede leer) y `biblioteca: true`; conserva `meta.carpetaEscritos` como `escritos` de esa entrada.
- `crearCarpetaDeProyecto(pid)`: elegir carpeta madre → subcarpeta con nombre seguro del título (máx. 60, sin `\/:*?"<>|`, si existe se agrega " (2)") → registrar → guardar ya.
- `abrirCarpeta()`: elegir carpeta → leer los 3 JSON (y `eliminados.json`) → `renumerar` contra lo que hay → renombrar documentos movidos (`fuentes/<viejo>/…` → `fuentes/<nuevo>/…`) → `importar(datos, 'combinar')` → traer documentos y originales de fotos → registrar con los proyectos que traía (si no traía ninguno: `biblioteca: true`) → guardar. Si la carpeta ya está registrada: aviso y no se duplica.
- `elegirCarpetaPara(pid)`, `usarComoBiblioteca(clave)`, `cerrarProyecto(pid)` (guarda, quita de su carpeta y borra de IndexedDB el proyecto, sus citas y las fuentes que ya no usa nadie ni la biblioteca; no toca archivos), `darPermiso()` (pide permiso a todas las que lo necesiten, en el mismo clic), `guardarAhora()`.
- Guardado (`alCambiar`, 700 ms): `repartir` sobre `S` con las entradas conectadas; por cada carpeta, cada JSON se escribe solo si su texto cambió respecto a lo último escrito; documentos pendientes a toda carpeta cuya parte los incluye (`docsDe`); `CLAUDE.md` con `generarClaudeMd(parte)`.
- Recogida (foco / visibilidad / cada 8 s): igual que hoy pero por carpeta (`lastModified` por JSON y carpeta; `eliminados.json`).
- `paraClaude.js`: `generarClaudeMd({ proyectos, fuentes } = S)`.
- Proyectos sin carpeta (creados antes, o llegados por sincronización): `sinCarpeta = $derived(...)` para la UI.

- [ ] Step 1: e2e Task 4 (migración) primero → FAIL. Step 2: implementar Tasks 2–3; `App.svelte` y `Datos.svelte` usan el módulo nuevo; borrar `carpeta.svelte.js`. Step 3: `npm test && npm run test:e2e` → PASS. Commit "Carpetas: una carpeta por proyecto (registro, guardado y cambios externos por carpeta)".

### Task 4: e2e — migración y cambios externos

- En `tests/e2e/comun.mjs`: `carpetasSimuladas(pg)` instala (con `evaluateOnNewDocument`) un `showDirectoryPicker` que devuelve subcarpetas de OPFS (`navigator.storage.getDirectory()`), en el orden que indique `window.__elegir = ['nombre', …]`; y ayudantes `escribirOpfs(pg, ruta, texto)` / `leerOpfs(pg, ruta)`.
- Suite `carpetas`, pasos:
  1. "migra la carpeta del formato anterior": preparar OPFS `tesis/` con 1 proyecto, 2 fuentes (una sin citas), 1 cita, `fuentes/fuente_001/documento.pdf`; poner en IndexedDB `meta.carpeta` = handle de `tesis` (vía la página) y recargar → el proyecto aparece; `tesis/fuentes.json` sigue con las 2 fuentes (la sin cita por ser biblioteca) y el documento sigue.
  2. "un cambio externo de la skill se recoge": escribir en `tesis/proyectos.json` un título nuevo → en ≤ 10 s la app lo muestra.
  3. "eliminados.json borra": escribir `{"citas":["cita_001"]}` → la cita desaparece y el archivo se borra.

### Task 5: UI de Proyectos y Configuración + e2e

**Files:** `views/Proyectos.svelte` (botones "Nuevo proyecto" y "Abrir proyecto"; en cada tarjeta, chip de estado: nombre de la carpeta / "Sin carpeta" con botón "Elegir carpeta" / "Sin permiso"; menú con "Cerrar proyecto"), `components/ProyectoForm.svelte` (`oncreado` → `crearCarpetaDeProyecto`), `components/Datos.svelte` (lista de carpetas, biblioteca, "Guardar ahora"; sin "Carpeta de almacenamiento"), `App.svelte` (aviso "N carpetas necesitan permiso" con botón "Dar permiso").

Pasos e2e (suite `carpetas`, continuación):
  4. "nuevo proyecto crea su carpeta": `__elegir = ['madre']`, crear proyecto "Vías urbanas" → existe `madre/Vías urbanas/proyectos.json` con solo ese proyecto; `tesis/proyectos.json` no lo tiene.
  5. "una fuente en dos proyectos queda en las dos carpetas": vincular una fuente de la tesis al proyecto nuevo → está en ambos `fuentes.json`; editar su título → cambia en ambos.
  6. "abrir una carpeta de otra instalación renumera lo que choca": preparar `otra/` con `proyecto_001` "Otra tesis", `fuente_001` distinta (otro título), cita y una nota en el lienzo conectada a la fuente, documento `fuentes/fuente_001/documento.pdf` → Abrir proyecto → aparecen los dos proyectos; el de `otra` tiene id nuevo; su fuente id nuevo; la conexión y la cita apuntan al id nuevo; el documento está en `otra/fuentes/<nuevo>/documento.pdf`.
  7. "cerrar proyecto lo quita sin borrar su carpeta": cerrar "Otra tesis" → no está en la lista; `otra/proyectos.json` sigue.
  8. "sin permiso: Dar permiso reconecta": simular `queryPermission → 'prompt'` en la recarga → aparece el aviso; clic en "Dar permiso" → vuelve a guardar.
  9. Android (`suite android`): sigue sin mostrar nada de carpetas.

Commit "Proyectos: nuevo con su carpeta, abrir carpeta, estado y cerrar".

### Task 6: Verificación

- `npm test`, `npm run build && npm run test:e2e` (todas), `node tests/e2e/rendimiento.mjs`.
- `CLAUDE.md` (estructura: `carpetas.svelte.js` en lugar de `carpeta.svelte.js`, `reparto.js`, `almacen-carpeta.js`; estado).
