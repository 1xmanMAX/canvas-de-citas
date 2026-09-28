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
use wry::{NewWindowResponse, PermissionResponse, WebContext, WebViewBuilder};

const URL: &str = "https://1xmanmax.github.io/canvas-de-citas/";
const PUERTO: u16 = 47481;

/// Opciones para pruebas: --url <otra página>, --base <carpeta de datos>, --puerto <n>.
fn arg(nombre: &str) -> Option<String> {
    let a: Vec<String> = std::env::args().collect();
    a.iter().position(|x| x == nombre).and_then(|i| a.get(i + 1).cloned())
}
fn puerto() -> u16 {
    arg("--puerto").and_then(|p| p.parse().ok()).unwrap_or(PUERTO)
}

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
    let base = arg("--base").map(PathBuf::from).unwrap_or_else(|| std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir).join("CanvasDeCitas"));
    let documentos = if arg("--base").is_some() { base.clone() } else { std::env::var_os("USERPROFILE").map(|u| PathBuf::from(u).join("Documents")).unwrap_or_else(|| base.clone()) };
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
    let Ok(mut s) = TcpStream::connect_timeout(&([127, 0, 0, 1], puerto()).into(), Duration::from_millis(400)) else { return false };
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
        puerto: puerto(),
        clave: None,
        clave_archivo: Some(r.clave.clone()),
    };
    let (s, server) = preparar(cfg)?;
    std::thread::spawn(move || servir(s, server));
    Ok(())
}

/// Hasta el último "/" de la URL de la app: lo que está debajo es la app; lo demás, otra página.
fn prefijo_app(url: &str) -> String {
    match url.rfind('/') {
        Some(i) if i > url.find("://").map(|j| j + 2).unwrap_or(0) => url[..=i].to_string(),
        _ => format!("{url}/"),
    }
}

/// Una página que no es la app (un DOI, un enlace de una fuente…): en el navegador de siempre.
fn abrir_fuera(url: &str) {
    if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:") {
        #[cfg(windows)]
        let _ = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    }
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
            aviso(&format!("No se pudo arrancar la sincronización en el puerto {}: {e}", puerto()));
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
    let url_app = arg("--url").unwrap_or_else(|| URL.into());
    let prefijo = prefijo_app(&url_app);
    // El token (acceso a las carpetas) solo para la app, nunca para otra página.
    let inicio = format!("if (location.href.startsWith({:?})) window.canvasWindows = Object.freeze({{ puerto: {}, token: {:?} }});", prefijo, puerto(), token);
    let (p1, p2) = (prefijo.clone(), prefijo.clone());
    let webview = WebViewBuilder::new_with_web_context(&mut contexto)
        .with_url(url_app)
        .with_initialization_script(inicio)
        // La ventana solo muestra la app: cualquier otra página se abre en el navegador de siempre.
        .with_navigation_handler(move |u| {
            let propia = u.starts_with(&p1) || u.starts_with("about:") || u.starts_with("blob:") || u.starts_with("data:");
            if !propia {
                abrir_fuera(&u);
            }
            propia
        })
        .with_new_window_req_handler(move |u, _| {
            if !u.starts_with(&p2) {
                abrir_fuera(&u);
            }
            NewWindowResponse::Deny
        })
        // Micrófono (notas de voz), portapapeles…: solo la app corre en esta ventana (ver arriba).
        .with_permission_handler(|_| PermissionResponse::Allow)
        // Pellizco del trackpad: wry lo apaga por defecto y entonces WebView2 no manda a la página la
        // rueda con Ctrl que lo representa. La app evita el zoom de la página (Ctrl+rueda, Ctrl + / − / 0)
        // y usa el gesto para acercar el lienzo, el PDF o la foto (lib/gestos.js).
        .with_hotkeys_zoom(true)
        .with_devtools(false);
    // La página (de internet) habla con el puente de esta misma PC: que Chromium no lo bloquee como
    // "acceso a la red local". Se mantienen las opciones que wry pone por defecto.
    #[cfg(windows)]
    let webview = {
        use wry::WebViewBuilderExtWindows;
        webview.with_additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults")
    };
    let webview = webview.build(&ventana);
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

#[cfg(test)]
mod pruebas {
    use super::prefijo_app;
    #[test]
    fn prefijo_de_la_app() {
        assert_eq!(prefijo_app("https://1xmanmax.github.io/canvas-de-citas/"), "https://1xmanmax.github.io/canvas-de-citas/");
        assert_eq!(prefijo_app("http://localhost:4199/"), "http://localhost:4199/");
        assert_eq!(prefijo_app("http://localhost:4199"), "http://localhost:4199/");
        // Otra página del mismo sitio no es la app.
        assert!(!"https://1xmanmax.github.io/otra/".starts_with(&prefijo_app("https://1xmanmax.github.io/canvas-de-citas/")));
    }
}
