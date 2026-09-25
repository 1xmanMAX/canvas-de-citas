// receptor/sincro/src/servidor.rs
//! Servidor HTTP de sincronización (red local). Todo lo que viaja va cifrado con la clave de
//! vinculación; cada petición demuestra conocerla con la cabecera X-Canvas-Prueba.
use crate::carpeta::Carpeta;
use crate::cifrado::{ahora_ms, Clave};
use crate::parche;
use serde_json::json;
use std::io::Read;
use std::net::UdpSocket;
use std::sync::{Arc, Mutex};
use tiny_http::{Header, Request, Response, Server};

pub const TOPE_CUERPO: usize = 200 * 1024 * 1024;

/// Comprobar la etiqueta y escribir van juntos: dos guardados a la vez no pueden pasar ambos.
static ESCRITURA: Mutex<()> = Mutex::new(());

pub struct Sincro {
    pub carpeta: Carpeta,
    pub clave: Clave,
    pub clave_b64: String,
    pub puerto: u16,
    /// Tamaño máximo de un cuerpo (TOPE_CUERPO en producción; menor en pruebas).
    pub tope: usize,
}

pub struct Respuesta {
    pub estado: u16,
    pub tipo: &'static str,
    pub cuerpo: Vec<u8>,
}

impl Respuesta {
    fn texto(estado: u16, s: String) -> Self {
        Respuesta { estado, tipo: "text/plain; charset=utf-8", cuerpo: s.into_bytes() }
    }
    fn binario(b: Vec<u8>) -> Self {
        Respuesta { estado: 200, tipo: "application/octet-stream", cuerpo: b }
    }
    fn vacia(estado: u16) -> Self {
        Respuesta { estado, tipo: "text/plain; charset=utf-8", cuerpo: vec![] }
    }
}

/// IP de esta PC en la red local (sin enviar nada: solo elige la interfaz de salida).
pub fn ip_local() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("192.168.0.1:9")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".into())
}

fn decodificar(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => {
                if let Ok(x) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(x);
                    i += 3;
                    continue;
                }
                out.push(b'%');
            }
            b'+' => out.push(b' '),
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parametro(url: &str, clave: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|p| {
        let (k, v) = p.split_once('=')?;
        (k == clave).then(|| decodificar(v))
    })
}

impl Sincro {
    pub fn codigo(&self) -> String {
        format!("canvas-sync://{}:{}/#{}", ip_local(), self.puerto, self.clave_b64)
    }

    /// `prueba`: cabecera X-Canvas-Prueba. `local`: la petición viene de esta misma PC.
    pub fn atender(&self, metodo: &str, url: &str, prueba: Option<&str>, cuerpo: &[u8], local: bool) -> Respuesta {
        if cuerpo.len() > self.tope {
            return Respuesta::vacia(413);
        }
        let ruta = url.split('?').next().unwrap_or("");
        if metodo == "OPTIONS" {
            return Respuesta::vacia(204);
        }
        if metodo == "GET" && ruta == "/sync/emparejar" {
            if !local {
                return Respuesta::vacia(403);
            }
            let v = json!({"ip": ip_local(), "puerto": self.puerto, "clave": self.clave_b64, "codigo": self.codigo()});
            return Respuesta::texto(200, v.to_string());
        }
        let autorizado = prueba
            .and_then(|p| self.clave.descifrar_json(p).ok())
            .map_or(false, |v| v["ruta"].as_str() == Some(url));
        if !autorizado {
            return Respuesta::vacia(401);
        }
        match (metodo, ruta) {
            // Liviano: el celular lo usa para encontrar la PC si cambió su IP.
            ("GET", "/sync/hola") => Respuesta::texto(200, self.clave.cifrar_json(&json!({"app": "canvas-sincro", "v": 1}))),
            ("POST", "/sync/v2/leer") => self.leer_v2(cuerpo),
            ("POST", "/sync/v2/escribir") => self.escribir_v2(cuerpo),
            ("GET", "/sync/estado") => match self.carpeta.leer() {
                Ok(v) => Respuesta::texto(200, self.clave.cifrar_json(&v)),
                Err(e) => Respuesta::texto(500, e.to_string()),
            },
            ("PUT", "/sync/estado") => {
                let Ok(texto) = std::str::from_utf8(cuerpo) else { return Respuesta::vacia(400) };
                let Ok(v) = self.clave.descifrar_json(texto) else { return Respuesta::vacia(401) };
                let _candado = ESCRITURA.lock().unwrap_or_else(|e| e.into_inner());
                if v["etiqueta"].as_str() != Some(self.carpeta.etiqueta().as_str()) {
                    return Respuesta::texto(409, self.clave.cifrar_json(&json!({"error": "cambio"})));
                }
                match self.carpeta.escribir(&v, &v["eliminados"]) {
                    Ok(()) => Respuesta::texto(200, self.clave.cifrar_json(&json!({"etiqueta": self.carpeta.etiqueta()}))),
                    Err(e) => Respuesta::texto(500, e.to_string()),
                }
            }
            ("GET", "/sync/doc") => {
                let Some(p) = parametro(url, "ruta").and_then(|r| self.carpeta.ruta_segura(&r)) else { return Respuesta::vacia(400) };
                match std::fs::read(p) {
                    Ok(b) => Respuesta::binario(self.clave.cifrar(&b)),
                    Err(_) => Respuesta::vacia(404),
                }
            }
            ("PUT", "/sync/doc") => {
                let Some(p) = parametro(url, "ruta").and_then(|r| self.carpeta.ruta_segura(&r)) else { return Respuesta::vacia(400) };
                let Ok(b) = self.clave.descifrar(cuerpo) else { return Respuesta::vacia(401) };
                match self.carpeta.escribir_doc(&p, &b) {
                    Ok(()) => Respuesta::texto(200, self.clave.cifrar_json(&json!({"ok": true}))),
                    Err(e) => Respuesta::texto(500, e.to_string()),
                }
            }
            _ => Respuesta::vacia(404),
        }
    }
}

fn solo_datos(v: &serde_json::Value) -> serde_json::Value {
    json!({"proyectos": v["proyectos"], "fuentes": v["fuentes"], "citas": v["citas"]})
}

impl Sincro {
    fn cuerpo_json(&self, cuerpo: &[u8]) -> Result<serde_json::Value, Respuesta> {
        let texto = std::str::from_utf8(cuerpo).map_err(|_| Respuesta::vacia(400))?;
        self.clave.descifrar_json(texto).map_err(|_| Respuesta::vacia(401))
    }

    fn cifrada(&self, v: serde_json::Value) -> Respuesta {
        Respuesta::texto(200, self.clave.cifrar_json(&v))
    }

    /// v2 (grupo de sincronización): `{dispositivo, nombre, base}` → solo lo que cambió desde la
    /// base de ese aparato (`modo: "parche"`), o todo si no hay base común (`modo: "completo"`).
    fn leer_v2(&self, cuerpo: &[u8]) -> Respuesta {
        let pedido = match self.cuerpo_json(cuerpo) {
            Ok(v) => v,
            Err(r) => return r,
        };
        let id = pedido["dispositivo"].as_str().unwrap_or("");
        if !Carpeta::id_valido(id) {
            return Respuesta::vacia(400);
        }
        let actual = match self.carpeta.leer() {
            Ok(v) => v,
            Err(e) => return Respuesta::texto(500, e.to_string()),
        };
        let datos = solo_datos(&actual);
        let _ = self.carpeta.anotar_aparato(id, pedido["nombre"].as_str().unwrap_or(""), ahora_ms(), false);
        let mut r = json!({
            "etiqueta": actual["etiqueta"],
            "huella": parche::huella(&datos),
            "docs": actual["docs"],
            "grupo": self.carpeta.grupo(),
        });
        match self.carpeta.base_de(id).filter(|b| pedido["base"].as_str() == Some(parche::huella(b).as_str())) {
            Some(base) => {
                r["modo"] = json!("parche");
                r["parche"] = json!(parche::diferencias(&base, &datos));
            }
            None => {
                r["modo"] = json!("completo");
                r["datos"] = datos;
            }
        }
        self.cifrada(r)
    }

    /// v2: `{dispositivo, etiqueta, parche | datos, huella, eliminados}`. El parche es sobre lo que
    /// el aparato leyó (misma etiqueta); si la PC cambió entre medio, 409. Si el resultado no da la
    /// huella esperada, 422 y no se escribe (el aparato reintenta enviando todo).
    fn escribir_v2(&self, cuerpo: &[u8]) -> Respuesta {
        let v = match self.cuerpo_json(cuerpo) {
            Ok(v) => v,
            Err(r) => return r,
        };
        let id = v["dispositivo"].as_str().unwrap_or("");
        if !Carpeta::id_valido(id) {
            return Respuesta::vacia(400);
        }
        let _candado = ESCRITURA.lock().unwrap_or_else(|e| e.into_inner());
        if v["etiqueta"].as_str() != Some(self.carpeta.etiqueta().as_str()) {
            return Respuesta::texto(409, self.clave.cifrar_json(&json!({"error": "cambio"})));
        }
        let actual = match self.carpeta.leer() {
            Ok(a) => solo_datos(&a),
            Err(e) => return Respuesta::texto(500, e.to_string()),
        };
        // Solo se reescriben las colecciones que el parche toca.
        let (resultado, tocadas): (serde_json::Value, Vec<&str>) = if v.get("datos").is_some_and(|d| d.is_object()) {
            (solo_datos(&v["datos"]), crate::carpeta::COLECCIONES.to_vec())
        } else {
            let ops = v["parche"].as_array().cloned().unwrap_or_default();
            let mut r = actual.clone();
            if parche::aplicar(&mut r, &ops).is_err() {
                return Respuesta::texto(422, self.clave.cifrar_json(&json!({"error": "parche"})));
            }
            if v["huella"].as_str().is_some_and(|h| h != parche::huella(&r)) {
                return Respuesta::texto(422, self.clave.cifrar_json(&json!({"error": "huella"})));
            }
            let tocadas = crate::carpeta::COLECCIONES.iter().copied().filter(|c| ops.iter().any(|op| op["r"][0] == *c)).collect();
            (r, tocadas)
        };
        let mut escribir = serde_json::Map::new();
        for c in &tocadas {
            escribir.insert((*c).into(), resultado[*c].clone());
        }
        if let Err(e) = self.carpeta.escribir(&serde_json::Value::Object(escribir), &v["eliminados"]) {
            return Respuesta::texto(500, e.to_string());
        }
        if let Err(e) = self.carpeta.guardar_base(id, &resultado) {
            return Respuesta::texto(500, e.to_string());
        }
        let _ = self.carpeta.anotar_aparato(id, "", ahora_ms(), true);
        self.cifrada(json!({"etiqueta": self.carpeta.etiqueta(), "huella": parche::huella(&resultado), "escritas": tocadas, "grupo": self.carpeta.grupo()}))
    }
}

fn cabecera(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).expect("cabecera válida")
}

fn atender_http(s: &Sincro, mut rq: Request) {
    let local = rq.remote_addr().map_or(false, |a| a.ip().is_loopback());
    let metodo = rq.method().to_string().to_uppercase();
    let url = rq.url().to_string();
    let prueba = rq.headers().iter().find(|h| h.field.equiv("X-Canvas-Prueba")).map(|h| h.value.as_str().to_string());
    let mut cuerpo = Vec::new();
    if rq.as_reader().take(s.tope as u64 + 1).read_to_end(&mut cuerpo).is_err() {
        return;
    }
    let r = s.atender(&metodo, &url, prueba.as_deref(), &cuerpo, local);
    let resp = Response::from_data(r.cuerpo)
        .with_status_code(r.estado)
        .with_header(cabecera("Content-Type", r.tipo))
        .with_header(cabecera("Cache-Control", "no-store"))
        .with_header(cabecera("Access-Control-Allow-Origin", "*"))
        .with_header(cabecera("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS"))
        .with_header(cabecera("Access-Control-Allow-Headers", "content-type, x-canvas-prueba"))
        .with_header(cabecera("Access-Control-Allow-Private-Network", "true"));
    let _ = rq.respond(resp);
}

/// Atiende peticiones hasta que se cierre el servidor (un hilo por petición).
pub fn servir(s: Arc<Sincro>, server: Server) {
    for rq in server.incoming_requests() {
        let s = s.clone();
        std::thread::spawn(move || atender_http(&s, rq));
    }
}
