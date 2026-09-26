# App de Windows con sincronización incorporada — Plan de implementación (etapa E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Canvas de Citas.exe`: una ventana propia (WebView2) que abre la última versión publicada de la app, da solos los permisos (micrófono, portapapeles), guarda cada proyecto en su carpeta sin avisos del navegador y lleva dentro el servidor de sincronización multi-carpeta, compatible con el APK actual, con "Vincular celular" (QR).

**Architecture:** El crate `receptor/sincro` (sin PixPin) gana: `reparto.rs` (≡ `app/src/lib/reparto.js`, mismos vectores), un almacén `Carpetas` (varias carpetas de proyecto según un registro JSON) detrás del mismo servidor, rutas `fotos/<id>.<ext>` con la capacidad opcional `fotos`, y endpoints `/local/*` (solo desde la misma PC y con token) que son el puente de archivos de la app. El crate nuevo `escritorio/` (binario `canvas-de-citas`, `tao` + `wry`) abre la ventana, inyecta `window.canvasWindows = { puerto, token }`, concede permisos y arranca el servidor (o usa el que ya corre con `--segundo-plano`). En la app, `esWindows` hace que `almacen-carpeta.js` use el puente y `carpetas.svelte.js` le pase el registro al servidor.

**Tech Stack:** Rust 2021 (MSVC en la PC de Max), `tiny_http`, `serde_json`, `rfd` (diálogo de carpeta), `qrcode` (SVG), `tao`/`wry` (WebView2), `webview2-com` (permisos); Svelte 5 en la app.

**Spec:** `docs/superpowers/specs/2026-09-25-proyectos-en-carpetas-windows-design.md` (parte 2).

## Global Constraints

- **Compatibilidad con el APK actual (no negociable):** protocolo `/sync/*` v1/v2, cifrado, código `canvas-sync://`, parches: sin cambios. Lo nuevo solo se activa si el cliente envía `capacidades: ["fotos"]`.
- `/local/*`: solo loopback **y** cabecera `X-Canvas-Local` = token de `%LOCALAPPDATA%\CanvasDeCitas\local-token.txt`; rutas siempre relativas dentro de una carpeta registrada o elegida en esta sesión (sin `..`, sin absolutas).
- Registro de carpetas del servidor: `%LOCALAPPDATA%\CanvasDeCitas\proyectos-abiertos.json` = `[{ "carpeta": "F:\\…", "proyectos": [ids], "biblioteca": bool, "sincronizar": bool }]`; bases y grupo de sincronización en `%LOCALAPPDATA%\CanvasDeCitas\sincro\`.
- El binario `canvas-sincro --carpeta X` (una sola carpeta) sigue funcionando igual (lo usan las pruebas).
- La app web en un navegador cualquiera y en Android no cambia de comportamiento.
- Commits en `main`; no compilar APK; no publicar sin permiso de Max.

## Review Focus

- **APK viejo contra el servidor multi-carpeta**: sincroniza igual (proyectos de todas las carpetas marcadas; lo que manda se reparte) → prueba de integración Task 3.
- **Proyecto creado en el celular**: al sincronizar, la PC le crea carpeta en `Documentos\Canvas de Citas\<título>` y lo registra → Task 3.
- **Proyecto desmarcado de "sincronizar"**: el celular conserva el suyo y no borra nada en la PC → Task 3.
- **`/local/*` desde otra máquina o sin token**: 403, sin tocar archivos; `..` o ruta absoluta → 400 → Task 4.
- **Dos instancias** (acceso directo abierto dos veces, o `--segundo-plano` ya corriendo): la segunda usa el servidor existente, no falla por puerto ocupado → Task 6.

---

### Task 1: `reparto.rs` ≡ `reparto.js`
- `pub fn repartir(datos: &Value, carpetas: &[CarpetaReg]) -> Vec<Value>` (misma regla) y `pub fn docs_de(parte: &Value) -> Vec<String>`; prueba `tests/reparto.rs` que recorre `../../app/tests/vectores/reparto.json`.

### Task 2: almacén `Carpetas`
- `src/carpetas.rs`: `Carpetas { registro: PathBuf, estado: PathBuf, documentos: PathBuf }` con `leer()` (une: proyectos de cada carpeta con `sincronizar`, fuentes y citas por id sin duplicar, `docs` = documentos y originales que existen), `etiqueta()`, `escribir(resultado_completo, eliminados)` (reparte; escribe cada JSON solo si cambió; `eliminados.json` a cada carpeta; proyecto sin carpeta → crea `Documentos\Canvas de Citas\<título seguro>` y lo registra), `ruta_doc_leer(ruta)`, `rutas_doc_escribir(ruta)`, bases y grupo en `estado`.
- `servidor.rs`: `Sincro.almacen: Box<dyn Almacen>` (rasgo con lo que usa hoy de `Carpeta`); `Carpeta` lo implementa igual que hoy. `ruta_segura` acepta `fotos/<id>.<ext>`. `leer_v2` lista `fotos/…` en `docs` solo con `capacidades` que incluya `"fotos"`. Proyectos con `sincronizar: false`: fuera de `leer` y lo que llegue para ellos se ignora.

### Task 3: integración (Rust) multi-carpeta
- `tests/carpetas.rs`: dos carpetas + biblioteca; un "APK viejo" (v2 sin capacidades) lee todo, escribe un parche que toca las dos → cada carpeta recibe lo suyo; proyecto nuevo del celular crea su carpeta; `sincronizar: false` excluye y no borra; `fotos/` solo con capacidad.

### Task 4: puente `/local/*`
- `src/local.rs`: `hola`, `leer` (bytes + `X-Modificado`), `escribir`, `borrar`, `elegir-carpeta` (`rfd`), `crear-subcarpeta`, `registro` (GET/PUT del JSON de registro), `mostrar` (Explorador), `emparejar` (código + `qr.svg` con `qrcode`), `grupo`. Tests: token/loopback/`..`.

### Task 5: app — modo Windows
- `lib/plataforma.js`: `esWindows = !!window.canvasWindows`. `almacen-carpeta.js`: `almacenWindows(ruta)` (misma interfaz vía `fetch` al puente). `carpetas.svelte.js`: en Windows elige con `/local/elegir-carpeta`, registra `{ ruta }`, `persistir()` también hace `PUT /local/registro` (con `sincronizar`), sin permisos. Proyectos: interruptor "Sincronizar con el celular" por proyecto (Windows). Configuración: "Vincular celular" (código + QR del servidor) y aparatos del grupo. `main.js`: en Windows la versión nueva del service worker se activa sola.
- e2e: suite `windows` con un `window.canvasWindows` falso apuntando a un `canvas-sincro --local` real de prueba.

### Task 6: `escritorio/` (canvas-de-citas.exe)
- `tao` + `wry`: ventana "Canvas de Citas" (ícono), carpeta de datos del WebView `%LOCALAPPDATA%\CanvasDeCitas\webview`, URL `https://1xmanmax.github.io/canvas-de-citas/`, script de inicio con `canvasWindows`, permisos concedidos (`PermissionRequested` → Allow). Servidor: si `http://127.0.0.1:47481/sync/hola` responde con el mismo token → lo usa; si no, lo arranca en un hilo. `--segundo-plano`: solo servidor.
- Compila con `cargo build --release` (MSVC) en la PC de Max.

### Task 7: instalador y verificación
- `instalador-windows/Instalar.ps1`: copia `Canvas de Citas.exe`, accesos directos al exe, `Run` → `--segundo-plano`, quita la entrada vieja `CanvasDeCitasSincro`, firewall como hoy. `Desinstalar.ps1` acorde. `scripts/empaquetar-release.sh`: construye el exe nuevo.
- `npm test`, e2e completas, `cargo test`, `npm run test:integracion`; CLAUDE.md.
