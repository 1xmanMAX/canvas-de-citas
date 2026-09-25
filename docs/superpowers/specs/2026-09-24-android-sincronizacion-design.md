# App Android + sincronización por Wi-Fi con la PC

Fecha: 2026-09-24 · Estado: propuesta para revisión

## Qué quiere Max

- La misma app (lienzo, fuentes, citas, visor de PDF, notas, audios…) en su celular Android.
- Que el celular y la PC se sincronicen **fácil**: sin cuentas, sin nube, gratis, por el Wi-Fi de
  casa, usando el receptor que ya corre en la PC.
- La PC es pobre en recursos: nada pesado corriendo en segundo plano.

Supuestos (a confirmar): un solo celular; la PC es la "casa" de los datos (la carpeta
`F:\THE FORGE\THESIS\New folder`); se edita en ambos lados, a veces sin conexión.

## Arquitectura

```
 Celular (APK Capacitor)                         PC
 ┌───────────────────────┐   Wi-Fi (cifrado)   ┌──────────────────────────────┐
 │ misma app Svelte      │ ──────────────────► │ receptor (Rust, ya instalado)│
 │ IndexedDB + base sync │ ◄────────────────── │  puerto LAN 47481: /sync/*   │
 └───────────────────────┘                     │  lee/escribe la carpeta      │
                                               └──────────────┬───────────────┘
                                                              ▼
                                       F:\THE FORGE\THESIS\New folder  ◄── app en Comet
```

1. **App Android**: la misma app web empaquetada con **Capacitor** en un APK (sin conexión,
   pantalla completa, ícono propio). Mismo código que la PWA; lo que no aplica en el celular
   (carpeta de almacenamiento, receptor local) se oculta y aparece "Sincronizar con la PC".
2. **Receptor (PC)**: se le agrega un segundo puerto, **47481 en la red local**, solo con rutas
   `/sync/*`. Lee y escribe la carpeta de datos (la ruta se guarda en
   `%LOCALAPPDATA%\CanvasDeCitas\carpeta.txt`; la app de escritorio la puede cambiar). La app de
   Comet ya recoge sola los cambios de la carpeta (cada ~8 s) y aplica `eliminados.json`.
   La primera vez, Windows pedirá permiso de firewall: "Permitir en redes privadas".
3. **Emparejar una vez**: en la app de Comet, *Configuración → Vincular celular* muestra un
   **QR** con IP, puerto y una **clave secreta de 32 bytes**. El celular lo escanea (cámara) o se
   pega el código. Sin esa clave nadie más en la red puede leer ni escribir.
4. **Cifrado**: cada petición y respuesta va cifrada con **AES-256-GCM** usando esa clave
   (WebCrypto en el celular, crate `aes-gcm` en Rust), con marca de tiempo contra repeticiones.
   En la LAN solo viaja texto cifrado.

## Cómo se sincroniza (la parte delicada)

El celular guarda la **base**: una copia de cómo quedaron los datos en la última
sincronización. Al sincronizar:

1. Pide a la PC su estado actual (`GET /sync/estado`: los tres JSON + lista de documentos con
   tamaño y fecha) y una **etiqueta de versión** (hash de los archivos).
2. Hace una **fusión a tres vías** (base, celular, PC), elemento por elemento:
   - fuentes, citas y proyectos por `id`, y dentro de cada uno campo por campo;
   - el lienzo por piezas: cada nota, lista, audio, foto y conexión por `id`, cada posición y
     cada sub-lienzo de objetivo por separado;
   - si solo un lado cambió algo, gana ese lado; lo que un lado borró (y el otro no tocó) se
     borra; si **ambos** cambiaron lo mismo, gana el celular (quien está sincronizando) y se
     avisa cuántos conflictos hubo.
3. Envía el resultado (`PUT /sync/estado` con la etiqueta de versión que leyó). Si la PC cambió
   mientras tanto (la app de Comet guardó algo), responde **409** y el celular repite desde 1.
   El receptor escribe los JSON de forma atómica y los borrados en `eliminados.json`.
4. Documentos (PDF/HTML): el celular baja los que no tiene y sube los que la PC no tiene.
5. Guarda el resultado como nueva base.

La fusión es una función pura en JavaScript (`lib/sincro.js`), **probada con tests** antes de
conectarla, y se usa igual en ambos lados.

**Cuándo**: botón "Sincronizar" siempre visible en el celular, y automática al abrir la app y
cada pocos minutos si la PC está en la red. Si la IP de la PC cambió, el celular la busca en su
red (puerto 47481) antes de pedir un nuevo QR.

## Límites conocidos (v1)

- Sincroniza solo en la misma red Wi-Fi (por diseño; sin nube).
- Transcripción en vivo de notas de voz: el WebView de Android no trae el reconocimiento de voz
  de Chrome; en el celular se graba el audio y la transcripción queda para una v2 (plugin nativo).
- Los audios e imágenes van dentro de `proyectos.json`: la primera sincronización puede tardar
  (decenas de MB por Wi-Fi); después solo cambia lo editado… pero v1 manda el JSON completo.
- El APK se instala a mano (lo paso por el receptor/PixPin o por USB); no va a Play Store.

## Construcción y pruebas

- Android Studio y el SDK ya están instalados; Gradle usará `F:` para su caché (en `C:` quedan
  ~10 GB libres).
- Tests: fusión a tres vías (casos: altas, cambios, borrados, conflictos, lienzo, sub-lienzos);
  cifrado JS↔Rust (vectores de prueba); receptor `/sync/*` con carpeta temporal; prueba de punta
  a punta en el emulador de Android contra el receptor real.

## Fuera de alcance (v1)

Varios celulares, sincronización por internet, Play Store, iOS.
