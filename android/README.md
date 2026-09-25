# Canvas de Citas para Android

APK de la misma app (`app/`), empaquetada con **Capacitor 8**. No hay código duplicado: el APK
lleva dentro `app/dist`. En Android la app se sincroniza con la PC por Wi-Fi (Plan 2:
`docs/superpowers/plans/2026-09-25-android-app.md`).

## Qué cambia en el celular

- Botón **Sincronizar** (flechas en círculo) en la cabecera, en lugar del de PixPin. Sin
  vincular, abre Configuración.
- Configuración → **Sincronizar con la PC**: *Escanear QR de la PC* (escáner de Google Play
  Services, sin permiso de cámara) o pegar el código `canvas-sync://…`.
- Sincroniza sola al abrir la app, cada 5 minutos y al volver a ella. Si la PC cambió de IP la
  busca en la red (como mucho cada 30 min en automático).
- No aparecen la carpeta de almacenamiento ni el receptor local; no hay service worker (todo
  va en el APK).
- Notas de voz: se graban, pero sin transcripción en vivo (el WebView no la trae; v2).

## Construir el APK

Requisitos: Node 20+, JDK 21, Android SDK (plataforma 36; Android Studio ya lo instala).

```bash
cd android
npm ci
npm run apk            # Linux/macOS  (en Windows: npm run apk:windows)
```

Sale en `android/android/app/build/outputs/apk/debug/app-debug.apk` (APK de depuración:
se instala a mano; no va al repo). Si Gradle no encuentra el SDK, crea
`android/android/local.properties` con `sdk.dir=C\:\\Users\\<tú>\\AppData\\Local\\Android\\Sdk` (o define `ANDROID_HOME`).

`npm run apk` compila `app/`, copia `app/dist` al proyecto (`cap sync`) y ejecuta Gradle.
Tras cambiar el ícono: `npm run iconos`.

**En la nube** (sin Android Studio): instalar las *command-line tools* en `~/android-sdk` y
`sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"`. Si Maven Central
responde 429, un init script de Gradle en `~/.gradle/init.d/` puede reescribir
`repo.maven.apache.org` al espejo `https://maven-central.storage-download.googleapis.com/maven2/`.
No hay emulador (sin KVM): la app se prueba con `npm run test:e2e -- android` (Chrome con
`window.Capacitor` simulado, contra el servidor real).

## Instalar en el celular

1. Pasa `app-debug.apk` al celular (receptor/PixPin, USB o Drive).
2. Ábrelo y permite "Instalar apps de fuentes desconocidas" para esa app.
3. Abre **Canvas de Citas** → botón Sincronizar → escanea el QR o pega el código.

## Del lado de la PC

Lo definitivo es la **Tarea 8 del Plan 1** (el receptor de Windows arranca la sincronización y
Configuración → *Vincular celular* muestra el QR). Mientras tanto se puede usar el servidor
independiente:

```powershell
cd receptor\sincro
cargo build --release
target\release\canvas-sincro.exe --carpeta "F:\THE FORGE\THESIS\New folder"
```

Imprime `{"puerto":47481,"codigo":"canvas-sync://<ip>:47481/#<clave>","clave":"…"}`: pega ese
código en el celular. Para que la clave no cambie, las siguientes veces agrega
`--clave <la misma clave>`. Windows pedirá permiso de firewall: *Permitir en redes privadas*.
