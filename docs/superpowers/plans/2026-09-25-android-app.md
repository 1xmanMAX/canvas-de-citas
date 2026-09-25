# App Android (Capacitor) — Plan de implementación (Plan 2 de 2)

> Sigue al Plan 1 (`2026-09-24-sincronizacion-nucleo.md`, tareas 1–7 hechas). Spec:
> `docs/superpowers/specs/2026-09-24-android-sincronizacion-design.md`. Pasos con casillas (`- [ ]`).
> **Estado (2026-09-25): tareas 1–6 hechas.** Falta probar el APK en un celular real.

**Goal:** Un APK de Android con la misma app (mismo código que la PWA) que se sincroniza con la PC
por Wi-Fi: botón "Sincronizar" siempre visible, sincronización automática, vinculación con QR y
búsqueda de la PC si cambió su IP.

**Architecture:** `android/` es un proyecto Capacitor 8 que empaqueta `app/dist` (sin copiar
código). La app **no importa `@capacitor/core`**: detecta Android por `window.Capacitor`, que el
puente nativo inyecta, y llama a lo nativo con `Capacitor.nativePromise`. El WebView sirve la app
en `http://localhost` (`androidScheme: "http"`, `cleartext`), así las peticiones a la PC
(`http://192.168.x.x:47481`) no son "contenido mixto" y `fetch` funciona tal cual (sin
`CapacitorHttp`, que maneja mal cuerpos binarios); `localhost` sigue siendo contexto seguro
(WebCrypto, micrófono, cámara). El QR se escanea con **Google Code Scanner** (Play Services: no
pide permiso de cámara ni agrega peso) a través de un plugin propio mínimo en Java.

**Tech Stack:** Capacitor 8.5 (`@capacitor/android`, `@capacitor/cli`), Java 21, Android SDK 36,
Gradle 8.14; `com.google.android.gms:play-services-code-scanner`. Svelte 5 en `app/` (sin
dependencias nuevas).

## Global Constraints

- Español en código, UI y commits. Commits con el email de Max (ver `CLAUDE.md`).
- `app/` sigue siendo la PWA publicada: todo lo de Android se activa solo si `esAndroid`.
- Ninguna dependencia nueva en `app/`. Las de Capacitor viven en `android/package.json`.
- El formato de los JSON no cambia. Protocolo del Plan 1 intacto; solo se **agrega**
  `GET /sync/hola` (autenticado, liviano).
- El APK no se sube al repo (público): se construye con `npm run apk` en `android/`.
- En la nube no hay KVM (sin emulador): se verifica con Chrome simulando `window.Capacitor` y
  compilando el APK. La prueba en un celular real la hace Max.

## Review Focus

- **Contenido mixto / CORS**: la app en `http://localhost` pide a `http://<ip>:47481`; el servidor
  ya responde CORS `*` y `Access-Control-Allow-Private-Network`.
- **IP de la PC cambió**: si falla la conexión, se busca en la misma /24 con `/sync/hola` (solo
  responde bien quien tenga la clave) y se actualiza el código guardado.
- **Sincronización automática**: nunca muestra errores de red en silencio (sin aviso si la PC no
  está), no corre dos a la vez, y solo si ya hay un código guardado.
- **Nada del escritorio en el celular**: sin carpeta de almacenamiento, sin receptor 47480, sin
  service worker (los archivos ya están en el APK).

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/src/lib/plataforma.js` | `esAndroid`, `nativo(plugin, metodo, opciones)` |
| `app/src/lib/sincro-app.svelte.js` | Estado de la sincronización en la app, `sincronizarAhora`, automática |
| `app/src/lib/sincro-red.js` | `buscarPc` (barrido de la /24), `ipDe`, `codigoCon` |
| `app/src/components/BotonSincro.svelte` | Botón de la cabecera en Android |
| `app/src/components/Sincronizar.svelte` | Usa `sincro-app` + botón "Escanear QR" en Android |
| `receptor/sincro/src/servidor.rs` | `GET /sync/hola` |
| `android/` | Proyecto Capacitor: `package.json`, `capacitor.config.json`, `android/` (Gradle), plugin `Vinculo.java`, íconos |
| `android/scripts/iconos.mjs` | Íconos del lanzador desde `app/public/icon*.svg/png` |

---

### Task 1: Plataforma y modo Android en la app

**Files:** Create `app/src/lib/plataforma.js`. Modify `app/src/main.js`, `app/src/App.svelte`,
`app/src/components/Datos.svelte`, `app/src/views/{Proyectos,Hub,General}.svelte`.

- `esAndroid = window.Capacitor?.isNativePlatform?.() && getPlatform() === 'android'`.
- `nativo(plugin, metodo, opciones)` → `Capacitor.nativePromise(...)`; lanza si no es nativo.
- En Android: no registrar el service worker; no `iniciarCarpeta`/`iniciarCelular`; ocultar la
  sección "Carpeta de almacenamiento" y el botón "Celular y PixPin"; en su lugar `BotonSincro`.

- [x] Suite e2e `android` (Chrome con `window.Capacitor` simulado antes de cargar): no aparece
  "Carpeta de almacenamiento" ni el botón de PixPin; aparece el botón "Sincronizar con la PC".
- [x] `npm run build`, suite `android` en verde, el resto de suites sin cambios. Commit.

### Task 2: Estado de sincronización compartido y botón de cabecera

**Files:** Create `app/src/lib/sincro-app.svelte.js`, `app/src/components/BotonSincro.svelte`.
Modify `app/src/components/Sincronizar.svelte`, `app/src/App.svelte`.

**Interfaces:** `SA` (`$state`: `codigo`, `trabajando`, `progreso`, `error`, `ultima`),
`cargarSincro()`, `sincronizarAhora({ silencioso = false } = {})`, `iniciarSincroAutomatica()`
(Android: al abrir, cada 5 min y al volver a primer plano; solo con código guardado; en silencio
los errores de red no muestran aviso).

- [x] Mover la lógica de `Sincronizar.svelte` a `sincro-app.svelte.js` (misma UI).
- [x] `BotonSincro`: ícono que gira mientras sincroniza; si no hay código abre Configuración.
- [x] Suite `android`: con `canvas-sincro` real, pegar código, sincronizar desde la cabecera y
  ver el proyecto de la PC; la suite `sincro` sigue verde. Commit.

### Task 3: `/sync/hola`, tiempos de espera y búsqueda de la PC

**Files:** Modify `receptor/sincro/src/servidor.rs`, `receptor/sincro/tests/servidor.rs`,
`app/src/lib/sincro-http.js`. Create `app/src/lib/sincro-red.js`,
`app/tests/unit/sincro-red.test.js`.

**Interfaces:**
- Rust: `GET /sync/hola` (con prueba) → 200 `cifrarJson({ app: "canvas-sincro", v: 1 })`.
- JS: `conexion.hola()`; `crearConexion({ …, tiempo })` corta cada petición con `AbortController`
  (estado/guardar: 60 s; documentos: 10 min).
- `ipDe(url)`, `codigoCon(codigo, ip)`; `buscarPc({ codigo, fetchFn, tiempo = 1500, paralelo = 32 })`
  → nuevo código o `null`: prueba `x.y.z.1–254` (la IP anterior primero) con `hola()`.
- `sincronizarAhora`: si la conexión falla por red (no 401/409), busca la PC, guarda el código
  nuevo y reintenta una vez.

- [x] Pruebas: Rust (`hola` con y sin prueba), unitarias de `buscarPc` con `fetch` falso (la
  encuentra en otra IP; no acepta a quien responde con otra clave; `null` si no hay nadie),
  integración (`hola` contra el binario). Commit.

### Task 4: Proyecto Android (Capacitor)

**Files:** Create `android/package.json`, `android/capacitor.config.json`, `android/.gitignore`,
`android/android/**` (generado por `npx cap add android`), `android/scripts/iconos.mjs`,
`android/README.md`.

- `appId: pe.canvasdecitas.app`, `webDir: ../app/dist`, `server.androidScheme: http`,
  `server.cleartext: true`, fondo `#F7F5EF`.
- Manifiesto: `INTERNET`, `ACCESS_NETWORK_STATE`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`
  (el puente de Capacitor pide los permisos del WebView en tiempo de ejecución).
- Íconos: `mipmap-*/ic_launcher*.png` y primer plano adaptativo desde los íconos de la PWA.
- Scripts: `npm run apk` (build de la app + `cap sync` + `gradlew assembleDebug`).

- [x] `npm run apk` produce `android/android/app/build/outputs/apk/debug/app-debug.apk`. Commit.

### Task 5: Plugin `Vinculo` (escanear el QR)

**Files:** Create `android/android/app/src/main/java/pe/canvasdecitas/app/Vinculo.java`.
Modify `MainActivity.java`, `android/android/app/build.gradle`, `Sincronizar.svelte`.

- `Vinculo.escanear()` → `{ codigo }` con `GmsBarcodeScanning` (solo QR); cancelar → rechazo
  `"cancelado"`.
- En la app (Android): botón "Escanear QR" → `nativo('Vinculo', 'escanear')` → `leerCodigo`
  para validar → guardar y sincronizar.
- [x] Suite `android`: con el plugin simulado (`nativePromise` falso) el botón llena el código y
  sincroniza. `npm run apk` compila. Commit.

### Task 6: Documentación y estado

- [x] `android/README.md` (instalar el APK, vincular, límites v1), `CLAUDE.md` (estructura,
  comandos, estado), casillas del plan. Commit y push.

## Fuera de alcance (v1)

Transcripción de voz en Android (plugin nativo, v2); publicar en Play Store; APK firmado de
release (se usa el de depuración, instalación a mano); Tarea 8 del Plan 1 (receptor de Windows +
QR en la PC), que se hace en la PC de Max.
