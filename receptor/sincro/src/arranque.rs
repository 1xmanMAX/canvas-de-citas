// receptor/sincro/src/arranque.rs
//! Arrancar el servidor: con una sola carpeta (`canvas-sincro --carpeta`, pruebas y la versión
//! anterior) o con las carpetas de los proyectos de la app de Windows y su puente `/local/*`.
use crate::carpeta::Carpeta;
use crate::carpetas::Carpetas;
use crate::cifrado::Clave;
use crate::local::Puente;
use crate::servidor::{Sincro, TOPE_CUERPO};
use std::io;
use std::path::PathBuf;
use std::sync::Arc;

pub enum Modo {
    Carpeta(PathBuf),
    /// Registro de carpetas, estado (bases/grupo), dónde crear proyectos nuevos y archivo del token.
    Carpetas { registro: PathBuf, estado: PathBuf, nuevos: PathBuf, token: PathBuf },
}

pub struct Config {
    pub modo: Modo,
    pub puerto: u16,
    /// Clave de vinculación: `Some(base64)` fija, o se lee/crea en `clave_archivo`, o una nueva.
    pub clave: Option<String>,
    pub clave_archivo: Option<PathBuf>,
}

/// Lee un secreto de un archivo o lo crea (así el celular sigue vinculado y la ventana reusa el token).
pub fn secreto(ruta: &PathBuf, nuevo: impl FnOnce() -> String) -> io::Result<String> {
    if let Ok(s) = std::fs::read_to_string(ruta) {
        if !s.trim().is_empty() {
            return Ok(s.trim().to_string());
        }
    }
    if let Some(p) = ruta.parent() {
        std::fs::create_dir_all(p)?;
    }
    // Dos procesos que arrancan a la vez: el primero lo crea y el otro lee el mismo.
    let s = nuevo();
    match std::fs::OpenOptions::new().write(true).create_new(true).open(ruta) {
        Ok(mut f) => {
            use std::io::Write;
            f.write_all(s.as_bytes())?;
            Ok(s)
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            std::thread::sleep(std::time::Duration::from_millis(100));
            Ok(std::fs::read_to_string(ruta)?.trim().to_string())
        }
        Err(e) => Err(e),
    }
}

pub fn token_nuevo() -> String {
    let mut b = [0u8; 24];
    getrandom::getrandom(&mut b).expect("azar del sistema");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Abre el puerto (0 = cualquiera libre) y deja todo listo para `servidor::servir`.
pub fn preparar(cfg: Config) -> io::Result<(Arc<Sincro>, tiny_http::Server)> {
    let (clave, clave_b64) = match (cfg.clave, &cfg.clave_archivo) {
        (Some(k), _) => (Clave::desde_base64(&k).map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "clave inválida"))?, k),
        (None, Some(ruta)) => {
            let k = secreto(ruta, || Clave::nueva().1)?;
            match Clave::desde_base64(&k) {
                Ok(c) => (c, k),
                Err(_) => {
                    let (c, k) = Clave::nueva();
                    std::fs::write(ruta, &k)?;
                    (c, k)
                }
            }
        }
        (None, None) => Clave::nueva(),
    };
    let server = tiny_http::Server::http(("0.0.0.0", cfg.puerto)).map_err(|e| io::Error::new(io::ErrorKind::AddrInUse, e.to_string()))?;
    let puerto = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(cfg.puerto);
    let mut s = Sincro { carpeta: Box::new(Carpeta::nueva(".")), clave, clave_b64, puerto, tope: TOPE_CUERPO, puente: None };
    match cfg.modo {
        Modo::Carpeta(c) => s.carpeta = Box::new(Carpeta::nueva(c)),
        Modo::Carpetas { registro, estado, nuevos, token } => {
            let token = secreto(&token, token_nuevo)?;
            s.carpeta = Box::new(Carpetas::nueva(&registro, &estado, &nuevos));
            let codigo = s.codigo();
            s.puente = Some(Puente::nuevo(token, Carpetas::nueva(registro, estado, nuevos), codigo));
        }
    }
    Ok((Arc::new(s), server))
}
