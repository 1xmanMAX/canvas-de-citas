# Proyectos en carpetas, app de Windows, fotos, gestos y etiquetas — diseño

Fecha: 2026-09-25 · Estado: aprobado en conversación por Max (partes 1–5), pendiente revisión escrita.

## Qué quiere Max (en sus palabras, resumido)

1. Crear o **abrir un proyecto eligiendo su carpeta** desde la pantalla de proyectos (hoy solo se
   puede desde Configuración → Carpeta de almacenamiento). Si desinstala y reinstala, elige la
   carpeta y todo vuelve como estaba. **Cada proyecto en su propia carpeta, siempre.**
2. Una **app de Windows** que siempre abra la **última versión**, que **no pida permisos a cada
   rato** (archivos, red, micrófono…) y que **sincronice con el celular** como la app Android:
   todo lo de un proyecto (notas, voz, fotos, PDF, HTML…), eligiendo qué proyectos. **Compatible
   con el APK actual.**
3. **Fotos**: en el lienzo se ven cortadas; al abrirlas no hay forma de verlas en grande con zoom
   ni de anotarlas cómodamente. Quiere un visor con la imagen casi a pantalla completa, los menús
   a un lado (adaptados a la pantalla), zoom rápido con rueda / trackpad / dedos y anotaciones.
4. **Gestos del lienzo en PC**: la rueda del mouse hace zoom; apretar la rueda y arrastrar mueve
   el lienzo. Trackpad y táctil quedan igual.
5. **Etiquetas `#` y menciones `@`** en todo tipo de elemento (voz, fotos, notas, listas…) y un
   **buscador** que encuentre todo por ellas.

Supuestos (no los dijo, se asumen): la app sigue funcionando también como página web (GitHub
Pages) en un navegador cualquiera, con sus limitaciones de permisos; la app Android no gana
carpetas (su "carpeta" es la PC vía sincronización).

## Orden de trabajo (cada etapa se prueba y se entrega sola)

| Etapa | Qué | Depende de |
|---|---|---|
| A | Gestos del lienzo (parte 4) | — |
| B | Fotos: tarjeta completa, original en alta, visor (parte 3) | — |
| C | Etiquetas `#`/`@` y buscador general (parte 5) | — |
| D | Proyectos en carpetas (parte 1) | — |
| E | App de Windows + servidor multi-carpeta + "Vincular celular" (parte 2) | D |
| F | Instalación en la PC de Max y migración de su carpeta | E |

---

## Parte 1 — Un proyecto, una carpeta

**Contenido de una carpeta de proyecto** (el mismo formato de hoy: contrato con las skills
intacto):

```
<carpeta del proyecto>/
  proyectos.json      {"proyectos": [ <ese único proyecto> ]}
  fuentes.json        solo las fuentes con alguna cita en ese proyecto
  citas.json          solo las citas de ese proyecto
  fuentes/<id>/documento.<ext>
  fotos/<fotoId>.<ext>   (nuevo, parte 3: originales en alta)
  CLAUDE.md           (generado, ahora por proyecto)
  eliminados.json     (lo escribe la skill; la app lo aplica y lo borra)
```

- **Biblioteca sin proyecto**: las fuentes que no tienen cita en ningún proyecto abierto viven en
  una carpeta "Biblioteca" (misma estructura, `proyectos.json` vacío). En Windows se crea en
  `Documentos\Canvas de Citas\Biblioteca`; en el navegador se pide al guardar la primera fuente
  suelta.
- **Fuente en varios proyectos**: copia completa (ficha + documento) en cada carpeta que la usa.
  Al editarla, la app escribe en todas. Al leer, si las copias difieren, gana la del archivo
  modificado más recientemente.
- **Registro de proyectos abiertos** (la app los reabre sola): en IndexedDB (`meta.carpetas`:
  `[{proyecto_id, nombre, handle|ruta, sincronizar}]`); en Windows además en
  `%LOCALAPPDATA%\CanvasDeCitas\proyectos-abiertos.json` (lo lee el servidor).
- **Pantalla Proyectos**: botones **Nuevo proyecto** (formulario → "¿dónde crear su carpeta?"; en
  Windows propone `Documentos\Canvas de Citas\<título abreviado>`) y **Abrir proyecto** (elegir
  carpeta → se carga). Cada tarjeta ofrece "Mostrar carpeta" (Windows) y "Cerrar proyecto" (lo
  quita de la lista sin borrar nada). Una carpeta con varios proyectos (formato antiguo) se abre
  igual y la app ofrece **separarlos** en carpetas hermanas.
- **Choque de ids al abrir** una carpeta de otra instalación: si un id ya existe con otro
  contenido (fuente distinta: DOI/título no coinciden; proyecto o cita distintos), la entrante se
  **renumera** (`nuevoId`) y se reescriben sus referencias (`fuente_id`, `proyecto_id`,
  posiciones y conexiones del lienzo, ruta del documento) y se guarda de vuelta en su carpeta.
  Si es la misma fuente (mismo DOI o mismo título+año), se considera la misma y se combinan.
- **Configuración**: desaparece "Carpeta de almacenamiento"; queda la lista de carpetas abiertas.
- **IndexedDB** sigue siendo la caché rápida (arranque inmediato); las carpetas son la verdad.
  Se mantiene el mecanismo actual por carpeta: `lastModified` por JSON para detectar cambios
  externos (skill) cada ~8 s, `eliminados.json`, guardado ~700 ms tras cada cambio.
- **Reparto (función pura, `lib/reparto.js`)**: `repartir({proyectos, fuentes, citas}, carpetas)`
  → por carpeta, sus tres colecciones. Reglas: proyecto → su carpeta; cita → carpeta de su
  `proyecto_id`; fuente → carpetas de los proyectos donde tiene cita, o Biblioteca si ninguna.
  `unir(porCarpeta)` hace lo inverso. La misma lógica existe en Rust (servidor) con **vectores de
  prueba compartidos** (`app/tests/vectores/reparto.json`), como `parche.js ≡ parche.rs`.

## Parte 2 — App de Windows y sincronización

**`Canvas de Citas.exe`** (crate nuevo `escritorio/`, Rust, MSVC, compila en la PC de Max;
depende de `receptor/sincro` por ruta — sin PixPin):

- **Ventana**: `tao` + `wry` (WebView2). Carga `https://1xmanmax.github.io/canvas-de-citas/`
  → siempre la última versión; sin internet, la del service worker. Carpeta de datos del WebView
  fija (`%LOCALAPPDATA%\CanvasDeCitas\webview`) para que IndexedDB y la caché persistan. Si el
  service worker tiene una versión nueva esperando, en modo Windows se activa sola al abrir.
- **Permisos**: manejador `PermissionRequested` de WebView2 que concede micrófono, portapapeles,
  notificaciones y red local sin preguntar (solo para el origen de la app).
- **Puente de archivos** (sin File System Access): el exe inyecta
  `window.canvasWindows = { puerto, token }` antes de cargar la página. La app llama al servidor
  local `http://127.0.0.1:<puerto>/local/...` con cabecera `X-Canvas-Local: <token>` (solo desde
  loopback). Operaciones: `elegir-carpeta` (diálogo nativo `rfd`), `crear-carpeta`,
  `listar` (archivos con `modificado`), `leer`, `escribir` (atómico), `borrar`, `mostrar`
  (abre el Explorador), `proyectos-abiertos` (leer/guardar el registro), `emparejar` (código y
  QR). Rutas siempre **dentro** de una carpeta registrada. En la app: `lib/plataforma.js` añade
  `esWindows`; `lib/almacen-carpeta.js` ofrece la misma interfaz sobre File System Access
  (navegador) o sobre el puente (Windows).
- **Un solo proceso**: el acceso directo de inicio de Windows lanza `Canvas de Citas.exe
  --segundo-plano` (solo servidor, sin ventana). Al abrir la app, si el servidor ya corre (puerto
  ocupado y responde `/sync/hola`), la ventana usa ese; si no, lo arranca en el mismo proceso.
- **Servidor multi-carpeta** (cambio en `receptor/sincro`): `Carpeta` pasa a ser un rasgo
  `Almacen` con dos implementaciones: `Carpeta` (una, como hoy; el binario `canvas-sincro` sigue
  igual) y `Carpetas` (el registro de proyectos abiertos con `sincronizar: true`). `leer` une
  (misma forma que hoy), `escribir` reparte (mismas reglas que la parte 1). Un proyecto nuevo
  que llega del celular crea su carpeta en `Documentos\Canvas de Citas\<título>` y se registra.
  La base de cada aparato y `grupo.json` pasan a `%LOCALAPPDATA%\CanvasDeCitas\sincro\`.
- **Compatibilidad con Android (no negociable)**: protocolo, código `canvas-sync://`, cifrado,
  v1/v2 y parches **sin cambios**; el APK actual sincroniza igual. Lo único nuevo es opcional:
  el cliente puede enviar `capacidades: ["fotos"]` en `leer2`; solo entonces el servidor lista
  también `fotos/<id>.<ext>` en `docs` (un APK viejo no los ve y no se rompe).
- **UI Windows**: interruptor "Sincronizar con el celular" por proyecto (activado por defecto);
  Configuración → **Vincular celular** (QR + código, de `/local/emparejar`); lista de aparatos
  del grupo (ya existe en la pantalla de sincronización). Una laptop con la app de Windows puede
  ser cliente de otra PC con la pantalla "Sincronizar con la PC" existente.
- **Qué viaja**: todo lo del proyecto: lienzo, notas, listas, notas de voz y transcripciones
  (van en `proyectos.json`), fotos (miniatura en `proyectos.json`, original como documento),
  objetivos, agrupadores, etiquetas, fuentes, citas y documentos PDF/HTML/MD.
- **Instalador** (`instalador-windows/`): copia `Canvas de Citas.exe`, crea accesos directos
  (Escritorio, Inicio) que abren el exe (ya no Comet), registra `--segundo-plano` al inicio,
  regla de firewall como hoy, y ofrece abrir la carpeta de datos existente. `Desinstalar` quita
  todo menos las carpetas de proyecto.

## Parte 3 — Fotos

- **Tarjeta completa**: la tarjeta toma la proporción real (`o.proporcion`) sin recortar
  (`preserveAspectRatio="xMidYMid meet"` y caja con esa proporción). Ancho por defecto 200 px;
  **redimensionable** arrastrando la esquina (campo opcional `o.ancho`, 120–900 px). Los trazos
  siguen en coordenadas 0–1000 sobre la imagen completa, así quedan alineados.
- **Original en alta**: al insertar se guarda el archivo original (sin recomprimir; si pasa de
  ~12 MP o 15 MB se reduce a 4096 px de lado, JPEG 0.9) en IndexedDB (almacén nuevo
  `originales`, clave = id de la foto) y en la carpeta como `fotos/<id>.<ext>` (campo opcional
  `o.original = "fotos/<id>.<ext>"`). En `proyectos.json` queda la miniatura (1024 px) como hoy.
  Fotos antiguas sin original: el visor usa la miniatura.
- **Visor de fotos** (`VisorFoto.svelte`, reemplaza al editor modal para fotos):
  - Imagen a pantalla casi completa sobre fondo oscuro, carga la original.
  - Zoom/desplazamiento (lógica compartida con el lienzo en `lib/gestos.js`): rueda del mouse =
    zoom al cursor; trackpad: pellizco = zoom, dos dedos = mover; táctil: pellizco = zoom, un
    dedo = mover; arrastrar = mover; doble clic/toque = alternar "ajustar" / 100 %; teclas
    `+`/`-`/`0`.
  - **Panel lateral** (título, texto, anotación, etiquetas, herramientas): en pantallas anchas,
    columna derecha de ~320 px que se oculta con un botón; en angostas, hoja inferior que se
    arrastra (mínimo: solo la barra de herramientas).
  - **Anotar**: modo "Mover" / "Dibujar" (tecla `D`, botón). Lápiz y resaltador, 4 colores,
    grosor, deshacer (`Ctrl+Z`), borrar trazo, limpiar. El trazo se dibuja en coordenadas de la
    imagen (preciso a cualquier zoom). Con lápiz digital: el lápiz dibuja y el dedo mueve, sin
    cambiar de modo.

## Parte 4 — Gestos del lienzo en PC

- Mouse: **rueda = zoom** al cursor; **botón central + arrastrar = mover**; `Shift + rueda` =
  desplazar horizontal (por si acaso). Trackpad (dos dedos = mover, pellizco = zoom) y táctil
  **sin cambios**.
- Detección mouse vs trackpad por evento (`lib/gestos.js`, `esRuedaDeMouse(e)`): mouse si
  `deltaMode !== 0`, o si `deltaX === 0` y `|deltaY|` es múltiplo de la muesca (≥ 50 y
  `wheelDeltaY % 120 === 0`); se recuerda lo último detectado ~400 ms para no alternar a mitad de
  gesto. Opción en Configuración "Rueda del mouse: Zoom (recomendado) / Desplazar" por si falla.
- Se actualiza el texto de ayuda del Hub.

## Parte 5 — Etiquetas `#` y menciones `@`

- **Dónde**: notas, listas (título y tareas), notas de voz (título y transcripción), fotos
  (título, texto, anotación), agrupadores, objetivos, fuentes (notas / puntos clave) y citas
  (contexto).
- **Cómo**: se detectan en el texto (`#palabra` y `@Nombre`, con letras con tilde, números, `_`,
  `-` y `.` interno; sin distinguir mayúsculas/tildes al buscar) **y** hay un campo opcional
  `etiquetas: ["#concreto", "@Villarreal"]` en cada elemento para las que se agregan como chips.
  `lib/etiquetas.js`: `extraer(texto)`, `etiquetasDe(elemento)`, `normalizar(t)`,
  `indice(proyectos, fuentes, citas)` → `{ "#concreto": [refs], ... }`.
- **Autocompletar** al teclear `#` o `@` en cualquier campo de texto de esos elementos
  (componente `Autocompletar.svelte`); en `@` también sugiere autores de las fuentes.
- **En el lienzo**: chips pequeños bajo cada tarjeta (máx. 3 + "+n"); color por etiqueta
  (derivado del nombre) y estilo distinto para `@`.
- **Buscador general** (`Buscador.svelte`, botón lupa en la cabecera + **`Ctrl+F`**, que reemplaza la búsqueda del navegador; dentro del visor de PDF `Ctrl+F` sigue buscando en el documento): busca en todos
  los proyectos abiertos; consulta = palabras + `#…` + `@…` (todas deben coincidir); resultados
  agrupados por tipo con fragmento resaltado; al elegir uno navega (Hub centrado y resaltado en
  la tarjeta, o abre la fuente/cita). Pestaña "Etiquetas y personas" con todas y su cuenta.
- El buscador del lienzo (Hub) entiende `#`/`@` y resalta lo que coincide, atenuando el resto.
- Skill `claude-skill/canvas-de-citas`: `canvas.mjs buscar "#tag"` y el campo `etiquetas` en
  lo que escribe. Campo nuevo y opcional: no rompe el contrato.

## Errores y casos límite

- Carpeta movida/borrada o disco desconectado: el proyecto aparece "Carpeta no encontrada" con
  botón "Buscar carpeta…"; los datos siguen en IndexedDB y se reescriben al encontrarla.
- Sin permiso (navegador): igual que hoy, botón "Dar permiso".
- Dos proyectos en la misma carpeta, o carpeta ya abierta: aviso, no se duplica.
- Servidor sin carpetas marcadas para sincronizar: responde datos vacíos y el cliente no borra
  nada (fusión a tres vías: sin base común no hay borrados).
- Proyecto que se deja de sincronizar: el celular conserva su copia y no se interpreta como
  borrado: el servidor lo excluye de lo que envía **y de la base del aparato**, e ignora lo que
  llegue del celular para ese proyecto (y sus citas) mientras siga desmarcado.

## Pruebas

- Unitarias (`node --test`): `reparto.js` (vectores compartidos), renumeración de ids,
  `etiquetas.js`, `esRuedaDeMouse`, medida de la tarjeta de foto.
- Rust: `Carpetas` (unir/repartir con los mismos vectores), rutas `fotos/`, `/local/*` solo
  loopback + token, capacidad `fotos`.
- Integración JS ↔ Rust: `npm run test:integracion` con varias carpetas; cliente "APK viejo"
  (sin capacidades) sigue sincronizando igual.
- e2e (Chrome headless): abrir/crear proyecto con carpeta (File System Access simulado), visor de
  fotos (zoom con rueda, dibujar), gestos del lienzo, buscador `#`/`@`.
- `rendimiento.mjs` tras tocar el lienzo (chips y fotos grandes no deben bajar los fps).
- Manual en la PC de Max: instalar, abrir sin avisos de permisos, grabar voz, sincronizar con el
  celular.
