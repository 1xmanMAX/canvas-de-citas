// receptor/sincro/src/main.rs
//! canvas-sincro: servidor de sincronización independiente (pruebas y desarrollo en cualquier
//! sistema). En la PC de Max lo lanza el receptor de Windows (Tarea 8).
use canvas_sincro::carpeta::Carpeta;
use canvas_sincro::cifrado::Clave;
use canvas_sincro::servidor::{servir, Sincro, TOPE_CUERPO};
use std::sync::Arc;

fn arg(nombre: &str) -> Option<String> {
    let a: Vec<String> = std::env::args().collect();
    a.iter().position(|x| x == nombre).and_then(|i| a.get(i + 1).cloned())
}

fn main() {
    let carpeta = arg("--carpeta").expect("Uso: canvas-sincro --carpeta <ruta> [--puerto 47481] [--clave <base64> | --clave-archivo <ruta>]");
    let puerto: u16 = arg("--puerto").and_then(|p| p.parse().ok()).unwrap_or(47481);
    let (clave, clave_b64) = match (arg("--clave"), arg("--clave-archivo")) {
        (Some(k), _) => (Clave::desde_base64(&k).expect("clave inválida (base64 de 32 bytes)"), k),
        // La clave vive en un archivo: se crea la primera vez y se reutiliza (el celular sigue vinculado).
        (None, Some(ruta)) => match std::fs::read_to_string(&ruta).ok().and_then(|k| Clave::desde_base64(&k).ok().map(|c| (c, k.trim().to_string()))) {
            Some(x) => x,
            None => {
                let (c, k) = Clave::nueva();
                std::fs::write(&ruta, &k).expect("no se pudo guardar la clave");
                (c, k)
            }
        },
        (None, None) => Clave::nueva(),
    };
    let server = tiny_http::Server::http(("0.0.0.0", puerto)).expect("no se pudo abrir el puerto");
    let puerto = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(puerto);
    let s = Arc::new(Sincro { carpeta: Carpeta::nueva(carpeta), clave, clave_b64, puerto, tope: TOPE_CUERPO });
    println!("{}", serde_json::json!({"puerto": puerto, "codigo": s.codigo(), "clave": s.clave_b64}));
    servir(s, server);
}
