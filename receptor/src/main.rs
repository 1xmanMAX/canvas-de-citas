#![windows_subsystem = "windows"]
//! Receptor de Canvas de Citas.
//!
//! Pasa archivos entre esta PC y otro aparato de la misma wifi con el
//! protocolo de «Pasar algo a otra persona» de PixPin (`pixpin_sincro::envio`):
//! el mismo canal cifrado, los mismos anuncios mDNS y los mismos QR
//! (`pixpin-recibe:` / `pixpin-envio:`). Por eso habla con PixPin Android y
//! PixPin Windows sin que ninguno sepa que no es PixPin.
//!
//! La app web (una PWA) no puede abrir puertos ni anunciarse en la red; este
//! programa lo hace por ella y le ofrece una API en `127.0.0.1:47480`:
//!
//! - `GET  /estado`                  codigos, QR, cola de envio y actividad
//! - `POST /recibir/abrir|cerrar`    esperar a que me manden (codigo + QR)
//! - `POST /recibir/codigo`          recibir de quien ensena su codigo
//! - `GET  /recibidos`               lo que llego y aun no se proceso
//! - `GET|DELETE /recibidos/archivo?n=<nombre>`
//! - `POST /enviar/archivo?n=<nombre>` (cuerpo = bytes)  poner en la cola
//! - `POST /enviar/abrir|cerrar|limpiar`, `POST /enviar/a` (codigo del otro)
//!
//! Lo recibido se guarda en `%LOCALAPPDATA%\CanvasDeCitas\Recibidos`.

use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use pixpin_sincro::envio::{self, DelQr, Elemento, Emisor, Final, Receptor, Remitente};
use serde::{Deserialize, Serialize};
use tiny_http::{Header, Method, Request, Response, Server};

const VERSION: u32 = 1;
const PUERTO_API: u16 = 47480;
/// Quien envia puede tardar en decidir; el movil espera hasta media hora.
const ESPERA_LARGA: Duration = Duration::from_secs(30 * 60);
/// Paginas que pueden usar la API (ademas de localhost, para desarrollo).
const ORIGENES: &[&str] = &["https://1xmanmax.github.io"];

// ------------------------------------------------------------------ estado

#[derive(Debug, Clone, Default, Serialize)]
struct Actividad {
    /// `""`, `conectando`, `recibiendo`, `recibido`, `enviando`, `enviado`, `error`.
    fase: String,
    de: String,
    hechos: u64,
    total: u64,
    mensaje: String,
    /// Sube con cada cambio: la app sabe si ya lo vio.
    turno: u64,
}

/// Una puerta abierta con su codigo. Al soltarla se cierra la escucha.
struct Puerta {
    codigo: String,
    qr: String,
    vivo: Arc<AtomicBool>,
}

impl Drop for Puerta {
    fn drop(&mut self) {
        self.vivo.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Recibido {
    nombre: String,
    bytes: u64,
    #[serde(default)]
    mime: Option<String>,
    #[serde(default)]
    de: String,
    /// Segundos desde 1970.
    #[serde(default)]
    llegado: u64,
}

#[derive(Default)]
struct Estado {
    recibir: Option<Puerta>,
    enviar: Option<Puerta>,
    actividad: Actividad,
    cola: Vec<(Elemento, PathBuf)>,
}

struct App {
    yo: Remitente,
    raiz: PathBuf,
    estado: Mutex<Estado>,
    /// Una recepcion a la vez: una segunda llamada ve el corte y reintenta.
    ocupado: AtomicBool,
    turno: AtomicU64,
}

impl App {
    fn estado(&self) -> MutexGuard<'_, Estado> {
        self.estado.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn recibidos(&self) -> PathBuf {
        self.raiz.join("Recibidos")
    }

    fn salida(&self) -> PathBuf {
        self.raiz.join("salida")
    }

    fn actividad(&self, f: impl FnOnce(&mut Actividad)) {
        let mut e = self.estado();
        f(&mut e.actividad);
        e.actividad.turno = self.turno.fetch_add(1, Ordering::SeqCst) + 1;
    }

    fn fallo(&self, mensaje: impl Into<String>) {
        let mensaje = mensaje.into();
        registrar(&self.raiz, &format!("error: {mensaje}"));
        self.actividad(|a| {
            a.fase = "error".into();
            a.mensaje = mensaje;
        });
    }

    fn log(&self, texto: &str) {
        registrar(&self.raiz, texto);
    }
}

fn ahora() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn registrar(raiz: &Path, texto: &str) {
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(raiz.join("receptor.log"))
    {
        let _ = writeln!(f, "{} {texto}", ahora());
    }
}

// ------------------------------------------------------------ utilidades de red

/// Seis cifras al azar, sin sesgo (el mismo metodo que PixPin).
fn codigo_nuevo() -> Option<String> {
    let mut salida = String::new();
    while salida.len() < envio::CIFRAS {
        let mut bytes = [0u8; 16];
        if !pixpin_shell::azar(&mut bytes) {
            return None;
        }
        for b in bytes {
            if b < 250 && salida.len() < envio::CIFRAS {
                salida.push(char::from(b'0' + b % 10));
            }
        }
    }
    Some(salida)
}

fn nonce() -> Option<[u8; pixpin_sincro::canal::NONCE]> {
    let mut n = [0u8; pixpin_sincro::canal::NONCE];
    pixpin_shell::azar(&mut n).then_some(n)
}

/// La IP de esta PC en la wifi (la que se pone en el QR).
fn ip_local() -> Option<String> {
    let s = std::net::UdpSocket::bind(("0.0.0.0", 0)).ok()?;
    s.connect(("8.8.8.8", 53)).ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}

fn conectar(host: &str, puerto: u16) -> std::io::Result<TcpStream> {
    let dir = (host, puerto)
        .to_socket_addrs()?
        .next()
        .ok_or_else(|| std::io::Error::other("direccion vacia"))?;
    let s = TcpStream::connect_timeout(&dir, Duration::from_secs(5))?;
    s.set_read_timeout(Some(ESPERA_LARGA))?;
    s.set_nodelay(true)?;
    Ok(s)
}

/// Busca por mDNS, hasta 20 s como el movil, a quien anuncia `servicio` con
/// la etiqueta del codigo.
fn buscar_y_conectar(servicio: &str, codigo: &str) -> Option<TcpStream> {
    let etiqueta = envio::etiqueta(codigo);
    let empezo = Instant::now();
    while empezo.elapsed() < Duration::from_secs(20) {
        match pixpin_shell::mdns::buscar(servicio, Duration::from_secs(3)) {
            Ok(vistos) => {
                if let Some(v) = vistos.into_iter().find(|v| v.datos.get("g") == Some(&etiqueta)) {
                    return conectar(&v.host.to_string(), v.puerto).ok();
                }
            }
            Err(_) => std::thread::sleep(Duration::from_millis(500)),
        }
    }
    None
}

/// Directo a la direccion del QR; si no hay o no responde, buscando.
fn conectar_con(q: &DelQr, servicio: &str) -> Option<TcpStream> {
    if let Some(h) = &q.host
        && q.puerto > 0
        && let Ok(s) = conectar(h, q.puerto)
    {
        return Some(s);
    }
    buscar_y_conectar(servicio, &q.codigo)
}

/// Abre una escucha en un puerto cualquiera, se anuncia y atiende a cada
/// llamada con `atender` mientras la puerta viva.
fn abrir_puerta(
    app: &Arc<App>,
    servicio: &'static str,
    qr_de: fn(&str, &str, u16) -> String,
    atender: fn(Arc<App>, TcpStream, String),
) -> Result<Puerta, String> {
    let codigo = codigo_nuevo().ok_or("el sistema no dio azar")?;
    let escucha = TcpListener::bind(("0.0.0.0", 0)).map_err(|e| e.to_string())?;
    escucha.set_nonblocking(true).map_err(|e| e.to_string())?;
    let puerto = escucha.local_addr().map_err(|e| e.to_string())?.port();
    let qr = qr_de(&codigo, &ip_local().unwrap_or_default(), puerto);
    let vivo = Arc::new(AtomicBool::new(true));
    let (app, cod, v) = (app.clone(), codigo.clone(), vivo.clone());
    std::thread::spawn(move || {
        // La etiqueta cuesta 60 000 vueltas de PBKDF2 y anunciar casi un
        // segundo: en el hilo.
        let etiqueta = envio::etiqueta(&cod);
        let corto: String = app.yo.nombre.chars().take(40).collect();
        let anuncio = pixpin_shell::mdns::anunciar(
            servicio,
            &app.yo.nombre,
            puerto,
            &[("g", &etiqueta), ("n", &corto)],
        );
        if let Err(e) = &anuncio {
            app.log(&format!("no se pudo anunciar {servicio}: {e:?}"));
        }
        while v.load(Ordering::SeqCst) {
            match escucha.accept() {
                Ok((flujo, de)) => {
                    app.log(&format!("llamada de {de} en {servicio}"));
                    let _ = flujo.set_nonblocking(false);
                    let _ = flujo.set_read_timeout(Some(ESPERA_LARGA));
                    let (app, cod) = (app.clone(), cod.clone());
                    std::thread::spawn(move || atender(app, flujo, cod));
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(150));
                }
                Err(e) => {
                    app.log(&format!("la escucha fallo: {e}"));
                    return;
                }
            }
        }
        drop(anuncio);
    });
    Ok(Puerta { codigo, qr, vivo })
}

// ------------------------------------------------------------------ recibir

fn leer_indice(app: &App) -> BTreeMap<String, Recibido> {
    std::fs::read(app.recibidos().join(".indice.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Vec<Recibido>>(&b).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|r| (r.nombre.clone(), r))
        .collect()
}

fn escribir_indice(app: &App, indice: &BTreeMap<String, Recibido>) {
    let lista: Vec<&Recibido> = indice.values().collect();
    if let Ok(b) = serde_json::to_vec_pretty(&lista) {
        let _ = std::fs::write(app.recibidos().join(".indice.json"), b);
    }
}

/// Lo que hay en la carpeta, con lo que se sabe de cada cosa.
fn listar_recibidos(app: &App) -> Vec<Recibido> {
    let indice = leer_indice(app);
    let mut lista = Vec::new();
    if let Ok(dir) = std::fs::read_dir(app.recibidos()) {
        for d in dir.flatten() {
            let nombre = d.file_name().to_string_lossy().to_string();
            let Ok(meta) = d.metadata() else { continue };
            if !meta.is_file() || nombre.starts_with('.') || nombre.ends_with(".parte") {
                continue;
            }
            let base = indice.get(&nombre).cloned().unwrap_or(Recibido {
                nombre: nombre.clone(),
                bytes: 0,
                mime: None,
                de: String::new(),
                llegado: 0,
            });
            lista.push(Recibido { bytes: meta.len(), ..base });
        }
    }
    lista.sort_by(|a, b| b.llegado.cmp(&a.llegado).then(a.nombre.cmp(&b.nombre)));
    lista
}

/// La oferta se acepta sola: saber el codigo es la autorizacion.
fn tramitar<F: Read + Write>(app: &App, mut r: Receptor<F>) {
    let de = if r.oferta.de.trim().is_empty() {
        "Un aparato".to_string()
    } else {
        r.oferta.de.clone()
    };
    let total: u64 = r.oferta.elementos.iter().map(|e| e.bytes.max(0) as u64).sum();
    app.actividad(|a| {
        a.fase = "recibiendo".into();
        a.de = de.clone();
        a.hechos = 0;
        a.total = total;
        a.mensaje.clear();
    });
    let mut ultimo = Instant::now();
    let hecho = r.aceptar(&app.recibidos(), |h, t| {
        if ultimo.elapsed() > Duration::from_millis(150) || h == t {
            ultimo = Instant::now();
            app.actividad(|a| {
                a.hechos = h;
                a.total = t;
            });
        }
    });
    match hecho {
        Ok(lista) => {
            let mut indice = leer_indice(app);
            let llegado = ahora();
            for (e, ruta) in &lista {
                let nombre = ruta.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                indice.insert(
                    nombre.clone(),
                    Recibido {
                        nombre,
                        bytes: e.bytes.max(0) as u64,
                        mime: e.mime.clone(),
                        de: de.clone(),
                        llegado,
                    },
                );
            }
            escribir_indice(app, &indice);
            app.log(&format!("recibidos {} de {de}", lista.len()));
            let n = lista.len();
            app.actividad(|a| {
                a.fase = "recibido".into();
                a.mensaje = if n == 1 { "Llegó 1 archivo".into() } else { format!("Llegaron {n} archivos") };
            });
        }
        Err(e) => app.fallo(e.to_string()),
    }
}

/// Alguien llamo a la puerta de «que me envien a mi».
fn atender_recepcion(app: Arc<App>, flujo: TcpStream, codigo: String) {
    if app.ocupado.swap(true, Ordering::SeqCst) {
        return; // ya se esta recibiendo algo: el otro vera el corte
    }
    match nonce() {
        None => app.fallo("el sistema no dio azar"),
        Some(n) => match Receptor::conectar(flujo, &codigo, &app.yo.nombre, &app.yo.id, n, false) {
            Ok(r) => tramitar(&app, r),
            Err(e) => app.fallo(e.to_string()),
        },
    }
    app.ocupado.store(false, Ordering::SeqCst);
}

/// Recibir de quien ensena su codigo (seis cifras o el texto de su QR).
fn recibir_de(app: Arc<App>, texto: String) -> Result<(), String> {
    let q = envio::leer_tecleado(&texto)
        .filter(|q| !q.espera_recibir)
        .ok_or("Ese código no es de quien envía: escribe las 6 cifras que muestra el otro aparato.")?;
    if app.ocupado.swap(true, Ordering::SeqCst) {
        return Err("Ya se está recibiendo algo.".into());
    }
    app.actividad(|a| {
        a.fase = "conectando".into();
        a.mensaje = "Buscando al otro aparato…".into();
    });
    std::thread::spawn(move || {
        match conectar_con(&q, envio::SERVICIO) {
            None => app.fallo("No se encontró a nadie enviando con ese código en esta wifi."),
            Some(s) => match nonce() {
                None => app.fallo("el sistema no dio azar"),
                Some(n) => match Receptor::conectar(s, &q.codigo, &app.yo.nombre, &app.yo.id, n, true) {
                    Ok(r) => tramitar(&app, r),
                    Err(e) => app.fallo(e.to_string()),
                },
            },
        }
        app.ocupado.store(false, Ordering::SeqCst);
    });
    Ok(())
}

// ------------------------------------------------------------------ enviar

fn mime_de(nombre: &str) -> Option<&'static str> {
    let ext = nombre.rsplit_once('.')?.1.to_ascii_lowercase();
    Some(match ext.as_str() {
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "json" => "application/json",
        "bib" => "application/x-bibtex",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc" => "application/msword",
        "zip" => "application/zip",
        _ => return None,
    })
}

fn poner_en_cola(app: &App, nombre: &str, datos: &[u8]) -> Result<(), String> {
    std::fs::create_dir_all(app.salida()).map_err(|e| e.to_string())?;
    let ruta = envio::ruta_libre(&app.salida(), &envio::nombre_sano(nombre));
    std::fs::write(&ruta, datos).map_err(|e| e.to_string())?;
    let nombre = ruta.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let elemento = Elemento {
        tipo: envio::ARCHIVO.into(),
        mime: mime_de(&nombre).map(str::to_string),
        identidad: format!("archivo:{}:{nombre}", app.yo.id),
        nombre,
        bytes: datos.len() as i64,
        proyecto: None,
        proyecto_nombre: None,
        creado: 0,
        uid: None,
        codigo_de_chat: None,
        aparato: None,
    };
    app.estado().cola.push((elemento, ruta));
    Ok(())
}

fn limpiar_cola(app: &App) {
    let mut e = app.estado();
    e.enviar = None;
    e.cola.clear();
    drop(e);
    let _ = std::fs::remove_dir_all(app.salida());
}

fn enviar_por(app: &App, flujo: TcpStream, codigo: &str, inicia: bool) {
    let cosas = app.estado().cola.clone();
    let Some(n) = nonce() else { return app.fallo("el sistema no dio azar") };
    let mut ultimo = Instant::now();
    let hecho = Emisor::nuevo(&app.yo, &cosas).atender(
        flujo,
        codigo,
        n,
        inicia,
        |nombre| {
            let de = if nombre.trim().is_empty() { "Un aparato".to_string() } else { nombre.to_string() };
            app.actividad(|a| {
                a.fase = "enviando".into();
                a.de = de;
                a.hechos = 0;
                a.total = 0;
                a.mensaje.clear();
            });
            true
        },
        |h, t| {
            if ultimo.elapsed() > Duration::from_millis(150) || h == t {
                ultimo = Instant::now();
                app.actividad(|a| {
                    a.hechos = h;
                    a.total = t;
                });
            }
        },
    );
    match hecho {
        Ok(Final::Enviado) => app.actividad(|a| {
            a.fase = "enviado".into();
            a.mensaje = "Enviado".into();
        }),
        Ok(Final::Rechazado) => app.fallo("El otro aparato no lo aceptó."),
        Ok(Final::SinAprobar) => {}
        Err(e) => app.fallo(e.to_string()),
    }
}

/// Alguien con el codigo llamo para que se le envie la cola.
fn atender_envio(app: Arc<App>, flujo: TcpStream, codigo: String) {
    enviar_por(&app, flujo, &codigo, false);
}

/// Mandar la cola a quien espera para recibir (su codigo o su QR).
fn enviar_a(app: Arc<App>, texto: String) -> Result<(), String> {
    let q = envio::leer_tecleado(&texto).ok_or("Escribe las 6 cifras que muestra el otro aparato.")?;
    if app.estado().cola.is_empty() {
        return Err("Primero elige qué enviar.".into());
    }
    app.actividad(|a| {
        a.fase = "conectando".into();
        a.mensaje = "Buscando al otro aparato…".into();
    });
    std::thread::spawn(move || match conectar_con(&q, envio::SERVICIO_RECIBIR) {
        None => app.fallo("No se encontró a nadie esperando con ese código en esta wifi."),
        Some(s) => enviar_por(&app, s, &q.codigo, true),
    });
    Ok(())
}

// ------------------------------------------------------------------ QR

/// El QR como SVG (fondo blanco y margen de 4 modulos, que sin el muchos
/// lectores no lo cogen).
fn svg_qr(texto: &str) -> String {
    let Ok(qr) = qrcodegen::QrCode::encode_text(texto, qrcodegen::QrCodeEcc::Medium) else {
        return String::new();
    };
    let (n, m) = (qr.size(), 4);
    let mut d = String::new();
    for y in 0..n {
        for x in 0..n {
            if qr.get_module(x, y) {
                d.push_str(&format!("M{} {}h1v1h-1z", x + m, y + m));
            }
        }
    }
    let lado = n + 2 * m;
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {lado} {lado}" shape-rendering="crispEdges"><rect width="{lado}" height="{lado}" fill="#fff"/><path d="{d}" fill="#000"/></svg>"##
    )
}

fn puerta_json(p: &Option<Puerta>) -> serde_json::Value {
    match p {
        None => serde_json::Value::Null,
        Some(p) => serde_json::json!({
            "codigo": p.codigo,
            "legible": envio::legible(&p.codigo),
            "qr": p.qr,
            "svg": svg_qr(&p.qr),
        }),
    }
}

// ------------------------------------------------------------------ HTTP

/// `%XX` y `+` de una URL, byte a byte (un nombre puede traer tildes).
fn decodificar(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%'
            && i + 2 < b.len() + 1
            && let Some(v) = b.get(i + 1..i + 3)
                .and_then(|h| std::str::from_utf8(h).ok())
                .and_then(|h| u8::from_str_radix(h, 16).ok())
        {
            out.push(v);
            i += 3;
            continue;
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parametro(url: &str, clave: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|par| {
        let (k, v) = par.split_once('=')?;
        (k == clave).then(|| decodificar(v))
    })
}

fn cabecera(rq: &Request, nombre: &str) -> Option<String> {
    rq.headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(nombre))
        .map(|h| h.value.as_str().to_string())
}

/// `Some(origen)` si puede usar la API: sin `Origin` (no es un navegador),
/// la app publicada o localhost. Cualquier otra pagina, `None`.
fn origen_permitido(rq: &Request) -> Option<String> {
    let Some(o) = cabecera(rq, "Origin") else { return Some(String::new()) };
    let local = ["http://localhost", "http://127.0.0.1"]
        .iter()
        .any(|p| o == *p || o.starts_with(&format!("{p}:")));
    (local || ORIGENES.contains(&o.as_str())).then_some(o)
}

fn h(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).expect("cabecera valida")
}

fn responder<R: Read>(rq: Request, origen: &str, r: Response<R>) {
    let mut r = r.with_header(h("Vary", "Origin")).with_header(h("Cache-Control", "no-store"));
    if !origen.is_empty() {
        r = r.with_header(h("Access-Control-Allow-Origin", origen));
    }
    let _ = rq.respond(r);
}

fn json(v: serde_json::Value) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_data(serde_json::to_vec(&v).unwrap_or_default())
        .with_header(h("Content-Type", "application/json; charset=utf-8"))
}

fn error(codigo: u16, mensaje: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    json(serde_json::json!({ "error": mensaje })).with_status_code(codigo)
}

fn cuerpo(rq: &mut Request, tope: usize) -> Result<Vec<u8>, String> {
    let mut v = Vec::new();
    rq.as_reader()
        .take(tope as u64 + 1)
        .read_to_end(&mut v)
        .map_err(|e| e.to_string())?;
    if v.len() > tope {
        return Err("demasiado grande".into());
    }
    Ok(v)
}

/// Un nombre de la carpeta de recibidos, sin salirse de ella.
fn ruta_recibida(app: &App, url: &str) -> Option<PathBuf> {
    let n = parametro(url, "n")?;
    (n == envio::nombre_sano(&n) && !n.starts_with('.')).then(|| app.recibidos().join(n))
}

fn estado_json(app: &App) -> serde_json::Value {
    let recibidos = listar_recibidos(app).len();
    let e = app.estado();
    serde_json::json!({
        "version": VERSION,
        "nombre": app.yo.nombre,
        "ip": ip_local(),
        "recibir": puerta_json(&e.recibir),
        "enviar": puerta_json(&e.enviar),
        "cola": e.cola.iter().map(|(el, _)| serde_json::json!({ "nombre": el.nombre, "bytes": el.bytes })).collect::<Vec<_>>(),
        "actividad": e.actividad,
        "recibidos": recibidos,
    })
}

fn atender_http(app: Arc<App>, mut rq: Request) {
    let Some(origen) = origen_permitido(&rq) else {
        return responder(rq, "", error(403, "origen no permitido"));
    };
    let metodo = rq.method().clone();
    let url = rq.url().to_string();
    let ruta = url.split('?').next().unwrap_or("").to_string();

    if metodo == Method::Options {
        let r = Response::empty(204)
            .with_header(h("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"))
            .with_header(h("Access-Control-Allow-Headers", "content-type, x-canvas"))
            .with_header(h("Access-Control-Allow-Private-Network", "true"))
            .with_header(h("Access-Control-Max-Age", "600"));
        return responder(rq, &origen, r);
    }
    // Lo que cambia algo exige una cabecera propia: obliga al navegador a
    // preguntar antes (preflight), y a una pagina ajena se le dice que no.
    if metodo != Method::Get && cabecera(&rq, "X-Canvas").is_none() {
        return responder(rq, &origen, error(403, "falta X-Canvas"));
    }

    let r = match (metodo, ruta.as_str()) {
        (Method::Get, "/estado") => json(estado_json(&app)),
        (Method::Post, "/recibir/abrir") => {
            let ya = app.estado().recibir.is_some();
            if !ya {
                match abrir_puerta(&app, envio::SERVICIO_RECIBIR, envio::texto_del_qr_de_recepcion, atender_recepcion) {
                    Ok(p) => app.estado().recibir = Some(p),
                    Err(e) => return responder(rq, &origen, error(500, &e)),
                }
            }
            json(estado_json(&app))
        }
        (Method::Post, "/recibir/cerrar") => {
            app.estado().recibir = None;
            json(estado_json(&app))
        }
        (Method::Post, "/recibir/codigo") => {
            let texto = String::from_utf8_lossy(&cuerpo(&mut rq, 4096).unwrap_or_default()).to_string();
            match recibir_de(app.clone(), texto) {
                Ok(()) => json(estado_json(&app)),
                Err(e) => error(400, &e),
            }
        }
        (Method::Get, "/recibidos") => json(serde_json::json!(listar_recibidos(&app))),
        (Method::Get, "/recibidos/archivo") => match ruta_recibida(&app, &url).and_then(|p| std::fs::read(p).ok()) {
            Some(datos) => {
                let tipo = parametro(&url, "n").and_then(|n| mime_de(&n)).unwrap_or("application/octet-stream");
                let r = Response::from_data(datos).with_header(h("Content-Type", tipo));
                return responder(rq, &origen, r);
            }
            None => error(404, "no existe"),
        },
        (Method::Delete, "/recibidos/archivo") => match ruta_recibida(&app, &url) {
            Some(p) => {
                let _ = std::fs::remove_file(&p);
                let mut indice = leer_indice(&app);
                if let Some(n) = p.file_name() {
                    indice.remove(n.to_string_lossy().as_ref());
                }
                escribir_indice(&app, &indice);
                json(serde_json::json!(listar_recibidos(&app)))
            }
            None => error(404, "no existe"),
        },
        (Method::Post, "/enviar/archivo") => {
            let nombre = parametro(&url, "n").unwrap_or_else(|| "archivo".into());
            match cuerpo(&mut rq, 512 << 20).and_then(|d| poner_en_cola(&app, &nombre, &d)) {
                Ok(()) => json(estado_json(&app)),
                Err(e) => error(400, &e),
            }
        }
        (Method::Post, "/enviar/limpiar") => {
            limpiar_cola(&app);
            json(estado_json(&app))
        }
        (Method::Post, "/enviar/abrir") => {
            if app.estado().cola.is_empty() {
                return responder(rq, &origen, error(400, "Primero elige qué enviar."));
            }
            if app.estado().enviar.is_none() {
                match abrir_puerta(&app, envio::SERVICIO, envio::texto_del_qr, atender_envio) {
                    Ok(p) => app.estado().enviar = Some(p),
                    Err(e) => return responder(rq, &origen, error(500, &e)),
                }
            }
            json(estado_json(&app))
        }
        (Method::Post, "/enviar/cerrar") => {
            app.estado().enviar = None;
            json(estado_json(&app))
        }
        (Method::Post, "/enviar/a") => {
            let texto = String::from_utf8_lossy(&cuerpo(&mut rq, 4096).unwrap_or_default()).to_string();
            match enviar_a(app.clone(), texto) {
                Ok(()) => json(estado_json(&app)),
                Err(e) => error(400, &e),
            }
        }
        (Method::Post, "/salir") => {
            responder(rq, &origen, json(serde_json::json!({ "ok": true })));
            std::process::exit(0);
        }
        _ => error(404, "ruta desconocida"),
    };
    responder(rq, &origen, r);
}

// ------------------------------------------------------------------ arranque

#[derive(Serialize, Deserialize)]
struct Identidad {
    id: String,
}

fn identidad(raiz: &Path) -> String {
    let ruta = raiz.join("receptor.json");
    if let Some(i) = std::fs::read(&ruta).ok().and_then(|b| serde_json::from_slice::<Identidad>(&b).ok()) {
        return i.id;
    }
    let mut b = [0u8; 8];
    pixpin_shell::azar(&mut b);
    let id = format!("canvas-{}", b.iter().map(|x| format!("{x:02x}")).collect::<String>());
    let _ = std::fs::write(&ruta, serde_json::to_vec(&Identidad { id: id.clone() }).unwrap_or_default());
    id
}

fn main() {
    let raiz = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("CanvasDeCitas");
    let _ = std::fs::create_dir_all(raiz.join("Recibidos"));
    // Si el puerto ya esta tomado, ya hay un receptor corriendo: este sobra.
    let Ok(servidor) = Server::http(("127.0.0.1", PUERTO_API)) else { return };
    let equipo = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".into());
    let app = Arc::new(App {
        yo: Remitente {
            nombre: format!("Canvas de Citas ({equipo})"),
            id: identidad(&raiz),
            codigo: String::new(),
        },
        raiz: raiz.clone(),
        estado: Mutex::new(Estado::default()),
        ocupado: AtomicBool::new(false),
        turno: AtomicU64::new(0),
    });
    registrar(&raiz, &format!("receptor v{VERSION} en 127.0.0.1:{PUERTO_API}"));
    let _ = std::fs::remove_dir_all(app.salida());
    for rq in servidor.incoming_requests() {
        let app = app.clone();
        std::thread::spawn(move || atender_http(app, rq));
    }
}
