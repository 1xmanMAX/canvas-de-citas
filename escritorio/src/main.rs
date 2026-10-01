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
use std::collections::HashMap;
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::window::{WindowBuilder, WindowId};
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

    let event_loop = EventLoopBuilder::<Pedido>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let ventana = match con_icono(WindowBuilder::new().with_title("Canvas de Citas").with_inner_size(tao::dpi::LogicalSize::new(1280.0, 820.0))).build(&event_loop) {
        Ok(v) => v,
        Err(e) => return aviso(&format!("No se pudo abrir la ventana: {e}")),
    };
    ventana.set_maximized(true);

    let mut contexto = WebContext::new(Some(r.webview.clone()));
    let url_app = arg("--url").unwrap_or_else(|| URL.into());
    let prefijo = prefijo_app(&url_app);
    // El token (acceso a las carpetas) solo para la app, nunca para otra página.
    let inicio = format!("if (location.href.startsWith({:?})) window.canvasWindows = Object.freeze({{ puerto: {}, token: {:?} }});", prefijo, puerto(), token);
    let principal = ventana.id();
    let webview = match crear_webview(&ventana, &mut contexto, url_app, &prefijo, &inicio, proxy.clone(), None) {
        Ok(w) => w,
        Err(e) => return aviso(&format!("No se pudo abrir WebView2 (¿falta el runtime de Edge WebView2?): {e}")),
    };

    // Ventanas de documento ("Abrir en otra ventana" del visor): se cierran solas con la principal.
    let mut otras: HashMap<WindowId, (tao::window::Window, wry::WebView)> = HashMap::new();
    event_loop.run(move |evento, destino, flujo| {
        *flujo = ControlFlow::Wait;
        let _ = (&ventana, &webview);
        match evento {
            Event::UserEvent(Pedido::Ventana(url)) => {
                let b = con_icono(WindowBuilder::new().with_title("Documento · Canvas de Citas").with_inner_size(tao::dpi::LogicalSize::new(1100.0, 900.0)));
                match b.build(destino) {
                    Ok(v) => match crear_webview(&v, &mut contexto, url, &prefijo, &inicio, proxy.clone(), Some(v.id())) {
                        Ok(w) => {
                            otras.insert(v.id(), (v, w));
                        }
                        Err(e) => aviso(&format!("No se pudo abrir la ventana del documento: {e}")),
                    },
                    Err(e) => aviso(&format!("No se pudo abrir la ventana del documento: {e}")),
                }
            }
            Event::UserEvent(Pedido::Cerrar(id)) => {
                otras.remove(&id);
            }
            Event::UserEvent(Pedido::Titulo(id, titulo)) => {
                if let Some((v, _)) = otras.get(&id) {
                    v.set_title(&titulo);
                }
            }
            Event::WindowEvent { window_id, event: WindowEvent::CloseRequested, .. } => {
                if window_id == principal {
                    *flujo = ControlFlow::Exit;
                } else {
                    otras.remove(&window_id);
                }
            }
            _ => {}
        }
    });
}

/// Pedidos de las páginas a la ventana principal (por el bucle de eventos).
enum Pedido {
    /// window.open de una página de la app: otra ventana (un documento aparte).
    Ventana(String),
    /// La ventana de un documento toma el nombre del documento.
    Titulo(WindowId, String),
    /// La ventana de un documento pide cerrarse (su botón Cerrar o Esc): window.ipc.postMessage("cerrar").
    Cerrar(WindowId),
}

fn con_icono(b: WindowBuilder) -> WindowBuilder {
    #[cfg(windows)]
    {
        use tao::platform::windows::IconExtWindows;
        if let Ok(icono) = tao::window::Icon::from_resource(1, None) {
            return b.with_window_icon(Some(icono));
        }
    }
    b
}

/// La app en un WebView: con el puente a las carpetas, los permisos concedidos y las páginas que
/// no son la app en el navegador de siempre. `ventana_doc`: si es una ventana de documento, su id.
fn crear_webview(
    ventana: &tao::window::Window,
    contexto: &mut WebContext,
    url: String,
    prefijo: &str,
    inicio: &str,
    proxy: EventLoopProxy<Pedido>,
    ventana_doc: Option<WindowId>,
) -> wry::Result<wry::WebView> {
    let (p1, p2) = (prefijo.to_string(), prefijo.to_string());
    let proxy_titulo = proxy.clone();
    let mut b = WebViewBuilder::new_with_web_context(contexto)
        .with_url(url)
        .with_initialization_script(inicio)
        // La ventana solo muestra la app: cualquier otra página se abre en el navegador de siempre.
        .with_navigation_handler(move |u| {
            let propia = u.starts_with(&p1) || u.starts_with("about:") || u.starts_with("blob:") || u.starts_with("data:");
            if !propia {
                abrir_fuera(&u);
            }
            propia
        })
        // window.open de la app (un documento aparte): otra ventana nuestra, con el mismo puente.
        .with_new_window_req_handler(move |u, _| {
            if u.starts_with(&p2) {
                let _ = proxy.send_event(Pedido::Ventana(u));
            } else {
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
    if let Some(id) = ventana_doc {
        let proxy_cerrar = proxy_titulo.clone();
        b = b
            .with_document_title_changed_handler(move |t| {
                let _ = proxy_titulo.send_event(Pedido::Titulo(id, t));
            })
            .with_ipc_handler(move |m| {
                if m.body() == "cerrar" {
                    let _ = proxy_cerrar.send_event(Pedido::Cerrar(id));
                }
            });
    }
    // La página (de internet) habla con el puente de esta misma PC: que Chromium no lo bloquee como
    // "acceso a la red local". Se mantienen las opciones que wry pone por defecto.
    #[cfg(windows)]
    let b = {
        use wry::WebViewBuilderExtWindows;
        b.with_additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults")
    };
    b.build(ventana)
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
