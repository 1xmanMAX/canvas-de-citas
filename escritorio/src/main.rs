// escritorio/src/main.rs
//! Canvas de Citas para Windows: la app en su propia ventana (WebView2, el motor de Edge).
//! - Abre la última versión publicada (https://1xmanmax.github.io/canvas-de-citas/); sin
//!   internet usa la que guardó el service worker.
//! - Da solos los permisos que la app pide (micrófono, portapapeles…): nunca pregunta.
//! - Inyecta `window.canvasWindows = { puerto, token }`: la app guarda cada proyecto en su carpeta
//!   por el puente local del servidor (`/local/*`), sin los permisos del navegador.
//! - Lleva dentro el servidor de sincronización por Wi-Fi (sin internet): si ya corre (arrancado con
//!   Windows con `--segundo-plano`), usa ese; si no, lo arranca aquí.
#![windows_subsystem = "windows"]

use canvas_sincro::arranque::{preparar, secreto, token_nuevo, Config, Modo};
use canvas_sincro::servidor::servir;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::time::Duration;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::WindowBuilder;
use wry::{PermissionResponse, WebContext, WebViewBuilder};

const URL: &str = "https://1xmanmax.github.io/canvas-de-citas/";
const PUERTO: u16 = 47481;

struct Rutas {
    base: PathBuf,
    registro: PathBuf,
    estado: PathBuf,
    nuevos: PathBuf,
    token: PathBuf,
    clave: PathBuf,
    webview: PathBuf,
}

fn rutas() -> Rutas {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir).join("CanvasDeCitas");
    let documentos = std::env::var_os("USERPROFILE").map(|u| PathBuf::from(u).join("Documents")).unwrap_or_else(|| base.clone());
    Rutas {
        registro: base.join("proyectos-abiertos.json"),
        estado: base.join("sincro"),
        nuevos: documentos.join("Canvas de Citas"),
        token: base.join("local-token.txt"),
        // La misma clave que usaba el instalador anterior: el celular sigue vinculado.
        clave: base.join("sincro-clave.txt"),
        webview: base.join("webview"),
        base,
    }
}

/// ¿Ya corre nuestro servidor (con este token) en el puerto de siempre?
fn servidor_corriendo(token: &str) -> bool {
    let Ok(mut s) = TcpStream::connect_timeout(&([127, 0, 0, 1], PUERTO).into(), Duration::from_millis(400)) else { return false };
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    let pedido = format!("GET /local/hola HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Canvas-Local: {token}\r\nConnection: close\r\n\r\n");
    if s.write_all(pedido.as_bytes()).is_err() {
        return false;
    }
    let mut r = String::new();
    let _ = s.read_to_string(&mut r);
    r.starts_with("HTTP/1.1 200") && r.contains("canvas-de-citas")
}

fn arrancar_servidor(r: &Rutas) -> std::io::Result<()> {
    let cfg = Config {
        modo: Modo::Carpetas { registro: r.registro.clone(), estado: r.estado.clone(), nuevos: r.nuevos.clone(), token: r.token.clone() },
        puerto: PUERTO,
        clave: None,
        clave_archivo: Some(r.clave.clone()),
    };
    let (s, server) = preparar(cfg)?;
    std::thread::spawn(move || servir(s, server));
    Ok(())
}

fn aviso(texto: &str) {
    // Sin consola: se deja constancia en un archivo junto a los datos de la app.
    if let Some(base) = std::env::var_os("LOCALAPPDATA") {
        let _ = std::fs::write(PathBuf::from(base).join("CanvasDeCitas").join("ultimo-error.txt"), texto);
    }
}

fn main() {
    let r = rutas();
    let _ = std::fs::create_dir_all(&r.base);
    let token = match secreto(&r.token, token_nuevo) {
        Ok(t) => t,
        Err(e) => return aviso(&format!("No se pudo preparar el token: {e}")),
    };

    // Solo servidor (arranque con Windows): sin ventana.
    if std::env::args().any(|a| a == "--segundo-plano") {
        if servidor_corriendo(&token) {
            return;
        }
        match arrancar_servidor(&r) {
            Ok(()) => loop {
                std::thread::park();
            },
            Err(e) => return aviso(&format!("No se pudo arrancar la sincronización: {e}")),
        }
    }

    if !servidor_corriendo(&token) {
        if let Err(e) = arrancar_servidor(&r) {
            // Otro programa ocupa el puerto: la app abre igual (sin carpetas por el puente).
            aviso(&format!("No se pudo arrancar la sincronización en el puerto {PUERTO}: {e}"));
        }
    }

    let event_loop = EventLoop::new();
    let mut ventana = WindowBuilder::new().with_title("Canvas de Citas").with_inner_size(tao::dpi::LogicalSize::new(1280.0, 820.0));
    #[cfg(windows)]
    {
        use tao::platform::windows::IconExtWindows;
        if let Ok(icono) = tao::window::Icon::from_resource(1, None) {
            ventana = ventana.with_window_icon(Some(icono));
        }
    }
    let ventana = match ventana.build(&event_loop) {
        Ok(v) => v,
        Err(e) => return aviso(&format!("No se pudo abrir la ventana: {e}")),
    };
    ventana.set_maximized(true);

    let mut contexto = WebContext::new(Some(r.webview.clone()));
    let inicio = format!("window.canvasWindows = Object.freeze({{ puerto: {PUERTO}, token: {:?} }});", token);
    let webview = WebViewBuilder::new_with_web_context(&mut contexto)
        .with_url(URL)
        .with_initialization_script(inicio)
        // Micrófono (notas de voz), portapapeles, notificaciones…: la app es de confianza.
        .with_permission_handler(|_| PermissionResponse::Allow)
        .with_devtools(false)
        .build(&ventana);
    let _webview = match webview {
        Ok(w) => w,
        Err(e) => return aviso(&format!("No se pudo abrir WebView2 (¿falta el runtime de Edge WebView2?): {e}")),
    };

    event_loop.run(move |evento, _, flujo| {
        *flujo = ControlFlow::Wait;
        if let Event::WindowEvent { event: WindowEvent::CloseRequested, .. } = evento {
            *flujo = ControlFlow::Exit;
        }
    });
}
