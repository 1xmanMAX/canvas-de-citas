# Canvas de Citas — guía para Claude Code

Gestor visual de fuentes y citas para la tesis de **Max** (ingeniería civil, UPC, Perú):
lienzo tipo tablero de investigación + biblioteca + visor de papers, integrado con Claude Code.
Habla con Max **en español**, con avances cortos; la UI, los comentarios y los commits también
van en español.

- App publicada: https://1xmanmax.github.io/canvas-de-citas/ (PWA, rama `gh-pages`)
- Repo: https://github.com/1xmanMAX/canvas-de-citas (público: **nunca subas datos de Max**)

## Estructura

| Ruta | Qué es |
|---|---|
| `app/` | La app: Svelte 5 + Vite, sin librerías de UI. `src/views` (Proyectos, Hub = lienzo, General = biblioteca), `src/components`, `src/lib` |
| `app/src/lib/store.svelte.js` | Estado global y persistencia en IndexedDB (escritura inmediata) |
| `app/src/lib/carpeta.svelte.js` | Carpeta de almacenamiento (File System Access): guarda los JSON + documentos y recoge cambios externos cada ~8 s; aplica `eliminados.json` |
| `app/src/components/Lienzo.svelte` | Motor del lienzo: capa con transform CSS (GPU), ventana de dibujo (solo lo cercano a la vista), nivel de detalle con muchos elementos |
| `app/src/components/Tarjeta.svelte`, `lib/tarjetas.js`, `lib/tablero.js` | Notas, listas, notas de voz, fotos; medidas y colocación |
| `app/src/components/Visor*.svelte`, `lib/pdf.worker.js`, `lib/visor.svelte.js` | Visor: PDF con **PDFium (WASM) en un Web Worker**, HTML aislado, Markdown; recortes, citas con vínculo (`origen`) y marcas |
| `app/src/lib/referencias*.js` | Bibliografía de un paper (extracción, DOI, CrossRef) |
| `app/src/lib/paraClaude.js` | Genera el `CLAUDE.md` de la carpeta de datos de Max |
| `app/tests/` | `unit/` (node:test), `e2e/` (Chrome headless), `fixtures/` (documentos de prueba propios) |
| `claude-skill/canvas-de-citas/` | Copia versionada de la skill de Claude Code (`~/.claude/skills/canvas-de-citas` en la PC de Max): CLI `scripts/canvas.mjs` que lee/edita la carpeta de datos |
| `receptor/` | Receptor Windows en Rust (127.0.0.1:47480): pasa archivos con el celular / PixPin |
| `receptor/sincro/` | Servidor de sincronización con el celular (Rust, **sin PixPin**: compila y se prueba en la nube) |
| `android/` | App Android con Capacitor 8: empaqueta `app/dist` (ver `android/README.md`); en la app, `lib/plataforma.js` (`esAndroid`) |
| `docs/superpowers/specs/` | Diseños aprobados o en revisión |
| `spec.md`, `*.html` (raíz) | Especificación y mockups originales |

## Comandos

```bash
cd app
npm ci
npm run dev          # desarrollo
npm run build        # dist/ (incluye sw.js con precache; pdf.js/PDFium no se precargan)
npm test             # pruebas unitarias (node --test, sin navegador)
npm run test:e2e     # pruebas de navegador (necesita build y Chrome; ver abajo)
node tests/e2e/rendimiento.mjs   # fluidez con un tablero grande (fps)
npm run test:integracion         # cliente JS ↔ servidor Rust real (necesita cargo)
cd ../android && npm ci && npm run apk   # APK de depuración (necesita JDK 21 + Android SDK)
```

**Pruebas de navegador**: `tests/e2e/comun.mjs` busca Chrome en rutas conocidas o usa
`CHROME_PATH`. En la nube, `scripts/preparar-nube.sh` intenta instalar Chrome for Testing en
`~/.cache/chrome`; si la red no lo permite, `npm test` + `npm run build` son la verificación
mínima. Siempre agrega pruebas para lo nuevo y córrelas antes de dar algo por terminado.

## Reglas del proyecto

- **Ligera y fluida** en PC modesta y en celular: sin frameworks pesados; lo costoso en hilos
  aparte o cargado bajo demanda; medir con `rendimiento.mjs` si tocas el lienzo.
- **Datos de Max**: viven en su carpeta `F:\THE FORGE\THESIS\New folder` (no está en el repo ni
  debe estarlo). Los documentos (PDF/HTML) existen **solo dentro de la app** (`fuentes/<id>/documento.*`):
  nunca crees copias en otras carpetas.
- El formato de `proyectos.json` / `fuentes.json` / `citas.json` es un contrato con la skill
  `citas-tesis` y con `claude-skill/`: no cambies campos existentes; los nuevos, opcionales.
- **No escribas nunca en el repo de PixPin** (`PIXPIN_PRO_WINDOWS`, otra sesión trabaja ahí).
  El receptor usa sus crates por ruta local (rama no publicada), así que **en la nube no compila**:
  la lógica nueva va en módulos sin PixPin (ver plan de Android).
- Max usa **Comet** (no Chrome) en su PC; el acceso directo es `app/scripts/crear-acceso-directo.ps1`.

## Publicar

La app se publica copiando `app/dist` (con `.nojekyll`) a la rama `gh-pages` (sin GitHub
Actions: el token de Max no tiene permiso `workflow`). Desde la nube el push suele limitarse a
la rama de trabajo: deja el cambio en una rama/PR y la publicación se hace desde la PC de Max
(o pídele que la autorice). Commits con el email 139194352+1xmanMAX@users.noreply.github.com.

## Estado y siguiente paso

Hecho (sep. 2026): lienzo con tarjetas y tablero de corcho, rendimiento con tableros grandes,
visor PDF propio (PDFium) con búsqueda, recortes y vínculos, biblioteca con referencias del
paper, skill con referencias y puntos clave.

**App Android + sincronización por Wi-Fi** — diseño en
`docs/superpowers/specs/2026-09-24-android-sincronizacion-design.md`.
- Plan 1 (`docs/superpowers/plans/2026-09-24-sincronizacion-nucleo.md`): tareas 1–7 hechas
  (fusión `lib/sincro*.js`, cifrado `lib/cifrado.js`, servidor `receptor/sincro`, pantalla
  "Sincronizar con la PC").
- Plan 2 (`docs/superpowers/plans/2026-09-25-android-app.md`): hecho — proyecto `android/`,
  modo Android (botón Sincronizar, automática, búsqueda de la PC si cambió su IP, escáner de QR
  con el plugin propio `Vinculo`, transcripción de notas de voz con el plugin `Voz`,
  márgenes de las barras del sistema). Prueba: `npm run test:e2e -- android` (Capacitor simulado).

- Plan 3 (`docs/superpowers/plans/2026-09-25-grupo-sincronizacion.md`): hecho — **grupo de
  sincronización**: cada aparato tiene id y nombre, la PC guarda su base en `<carpeta>/.sincro/`
  y solo viajan parches (`lib/parche.js` ≡ `receptor/sincro/src/parche.rs`); automática en todo
  aparato vinculado. Prueba: `npm run test:e2e -- grupo`.

**Agrupadores** (sep. 2026): recuadros punteados con nombre que reúnen elementos del lienzo
(`canvas.agrupadores` y en cada sub-lienzo de objetivo; `lib/agrupadores.js`, `Agrupador.svelte`,
`EditorAgrupador.svelte`). Guardan sus `miembros` y el recuadro se ajusta solo a ellos; mover el
recuadro mueve todo; soltar algo encima lo agrega y arrastrarlo lejos lo saca. Prueba: `npm run test:e2e -- agrupador`.

**Siguiente:** probar el APK en el celular de Max y hacer la **Tarea 8 del Plan 1** en su PC
(receptor de Windows + "Vincular celular" con QR). Mientras tanto sirve `canvas-sincro.exe`
(ver `android/README.md`).
