// receptor/sincro/src/main.rs
//! canvas-sincro: servidor de sincronización independiente.
//! - Una carpeta:   canvas-sincro --carpeta <ruta> [--puerto 47481] [--clave <b64> | --clave-archivo <ruta>]
//! - App de Windows (varias carpetas + puente /local/*):
//!   canvas-sincro --registro <proyectos-abiertos.json> --estado <dir> --nuevos <dir> --token-archivo <ruta>
//!                 [--puerto 47481] [--clave-archivo <ruta>]
use canvas_sincro::arranque::{preparar, Config, Modo};
use canvas_sincro::servidor::servir;
use std::path::PathBuf;

fn arg(nombre: &str) -> Option<String> {
    let a: Vec<String> = std::env::args().collect();
    a.iter().position(|x| x == nombre).and_then(|i| a.get(i + 1).cloned())
}

fn main() {
    let modo = match (arg("--carpeta"), arg("--registro")) {
        (Some(c), _) => Modo::Carpeta(c.into()),
        (None, Some(r)) => Modo::Carpetas {
            registro: r.into(),
            estado: arg("--estado").expect("falta --estado").into(),
            nuevos: arg("--nuevos").expect("falta --nuevos").into(),
            token: arg("--token-archivo").expect("falta --token-archivo").into(),
        },
        _ => panic!("Uso: canvas-sincro --carpeta <ruta> | --registro <json> --estado <dir> --nuevos <dir> --token-archivo <ruta>"),
    };
    let token_archivo = arg("--token-archivo").map(PathBuf::from);
    let cfg = Config { modo, puerto: arg("--puerto").and_then(|p| p.parse().ok()).unwrap_or(47481), clave: arg("--clave"), clave_archivo: arg("--clave-archivo").map(PathBuf::from) };
    let (s, server) = preparar(cfg).expect("no se pudo arrancar el servidor");
    let token = token_archivo.and_then(|t| std::fs::read_to_string(t).ok()).map(|t| t.trim().to_string());
    println!("{}", serde_json::json!({"puerto": s.puerto, "codigo": s.codigo(), "clave": s.clave_b64, "token": token}));
    servir(s, server);
}
