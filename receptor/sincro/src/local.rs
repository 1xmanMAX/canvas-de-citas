// receptor/sincro/src/local.rs
//! Puente de archivos para la app de Windows (`/local/*`): la app, abierta en la ventana de
//! `Canvas de Citas.exe`, lee y escribe las carpetas de sus proyectos por aquí, sin los permisos
//! del navegador. Solo desde esta misma PC y con el token que el exe inyecta en la página.
//! Nunca sale de una carpeta registrada (o elegida en esta sesión) y no acepta `..`.
use crate::carpetas::{nombre_seguro, Carpetas};
use crate::servidor::Respuesta;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

pub struct Puente {
    pub token: String,
    pub carpetas: Carpetas,
    /// Código de vinculación del servidor de sincronización (para "Vincular celular").
    pub codigo: String,
    /// Carpetas elegidas o creadas en esta sesión (aún no registradas por la app).
    elegidas: Mutex<HashSet<String>>,
}

fn clave_ruta(p: &Path) -> String {
    let s = p.to_string_lossy().replace('/', "\\");
    s.trim_end_matches('\\').to_lowercase()
}

fn modificado(p: &Path) -> u64 {
    fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Ruta relativa segura: sin raíz, sin unidad, sin `..`.
pub fn relativa_segura(ruta: &str) -> Option<PathBuf> {
    if ruta.is_empty() || ruta.len() > 400 || ruta.contains(':') || ruta.contains('\\') {
        return None;
    }
    let p = Path::new(ruta);
    p.components().all(|c| matches!(c, Component::Normal(_))).then(|| p.to_path_buf())
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

fn json_r(v: Value) -> Respuesta {
    Respuesta { estado: 200, tipo: "application/json; charset=utf-8", cuerpo: v.to_string().into_bytes(), cabeceras: vec![] }
}
fn vacia(estado: u16) -> Respuesta {
    Respuesta { estado, tipo: "text/plain; charset=utf-8", cuerpo: vec![], cabeceras: vec![] }
}
fn error(estado: u16, e: impl ToString) -> Respuesta {
    Respuesta { estado, tipo: "text/plain; charset=utf-8", cuerpo: e.to_string().into_bytes(), cabeceras: vec![] }
}

impl Puente {
    pub fn nuevo(token: String, carpetas: Carpetas, codigo: String) -> Self {
        Puente { token, carpetas, codigo, elegidas: Mutex::new(HashSet::new()) }
    }

    fn permitida(&self, carpeta: &Path) -> bool {
        let k = clave_ruta(carpeta);
        if self.elegidas.lock().unwrap_or_else(|e| e.into_inner()).contains(&k) {
            return true;
        }
        self.carpetas.entradas().iter().any(|e| clave_ruta(&e.carpeta()) == k)
    }

    fn anotar(&self, carpeta: &Path) {
        self.elegidas.lock().unwrap_or_else(|e| e.into_inner()).insert(clave_ruta(carpeta));
    }

    /// Carpeta (absoluta, permitida) y archivo relativo de la petición.
    fn destino(&self, url: &str, con_ruta: bool) -> Result<(PathBuf, Option<PathBuf>), Respuesta> {
        let carpeta = PathBuf::from(parametro(url, "carpeta").ok_or_else(|| vacia(400))?);
        if !carpeta.is_absolute() {
            return Err(vacia(400));
        }
        if !self.permitida(&carpeta) {
            return Err(vacia(403));
        }
        if !con_ruta {
            return Ok((carpeta, None));
        }
        let rel = relativa_segura(&parametro(url, "ruta").ok_or_else(|| vacia(400))?).ok_or_else(|| vacia(400))?;
        Ok((carpeta.clone(), Some(carpeta.join(rel))))
    }

    /// `token`: cabecera X-Canvas-Local. `local`: la petición viene de esta misma PC.
    pub fn atender(&self, metodo: &str, url: &str, token: Option<&str>, cuerpo: &[u8], local: bool) -> Respuesta {
        if !local || token != Some(self.token.as_str()) {
            return vacia(403);
        }
        let ruta = url.split('?').next().unwrap_or("");
        match (metodo, ruta) {
            ("GET", "/local/hola") => json_r(json!({"app": "canvas-de-citas", "v": 1})),
            ("GET", "/local/leer") => match self.destino(url, true) {
                Err(r) => r,
                Ok((_, Some(p))) => match fs::read(&p) {
                    Ok(b) => Respuesta { estado: 200, tipo: "application/octet-stream", cuerpo: b, cabeceras: vec![("X-Modificado", modificado(&p).to_string())] },
                    Err(_) => vacia(404),
                },
                Ok(_) => vacia(400),
            },
            ("PUT", "/local/escribir") => match self.destino(url, true) {
                Err(r) => r,
                Ok((_, Some(p))) => {
                    if let Some(dir) = p.parent() {
                        if let Err(e) = fs::create_dir_all(dir) {
                            return error(500, e);
                        }
                    }
                    let tmp = p.with_extension("tmp-canvas");
                    match fs::write(&tmp, cuerpo).and_then(|_| fs::rename(&tmp, &p)) {
                        Ok(()) => json_r(json!({"modificado": modificado(&p)})),
                        Err(e) => error(500, e),
                    }
                }
                Ok(_) => vacia(400),
            },
            ("POST", "/local/borrar") => match self.destino(url, true) {
                Err(r) => r,
                Ok((_, Some(p))) => {
                    let _ = fs::remove_file(p);
                    json_r(json!({"ok": true}))
                }
                Ok(_) => vacia(400),
            },
            ("POST", "/local/crear-subcarpeta") => match self.destino(url, false) {
                Err(r) => r,
                Ok((madre, _)) => {
                    let base = nombre_seguro(&parametro(url, "nombre").unwrap_or_default());
                    for i in 1..1000 {
                        let n = if i == 1 { base.clone() } else { format!("{base} ({i})") };
                        let p = madre.join(&n);
                        if p.exists() {
                            continue;
                        }
                        return match fs::create_dir_all(&p) {
                            Ok(()) => {
                                self.anotar(&p);
                                json_r(json!({"ruta": p.to_string_lossy(), "nombre": n}))
                            }
                            Err(e) => error(500, e),
                        };
                    }
                    vacia(409)
                }
            },
            ("POST", "/local/elegir-carpeta") => match elegir_carpeta(parametro(url, "titulo").as_deref()) {
                Some(p) => {
                    self.anotar(&p);
                    let nombre = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    json_r(json!({"ruta": p.to_string_lossy(), "nombre": nombre}))
                }
                None => vacia(204),
            },
            ("GET", "/local/registro") => json_r(Value::Array(self.carpetas.entradas().into_iter().map(|e| e.v).collect())),
            ("PUT", "/local/registro") => {
                let Ok(v) = serde_json::from_slice::<Value>(cuerpo) else { return vacia(400) };
                let Some(lista) = v.as_array() else { return vacia(400) };
                // Solo carpetas absolutas; las elegidas en esta sesión o ya registradas.
                for e in lista {
                    let p = PathBuf::from(e["carpeta"].as_str().unwrap_or(""));
                    if !p.is_absolute() || !self.permitida(&p) {
                        return vacia(403);
                    }
                }
                match self.carpetas.guardar_registro(&v) {
                    Ok(()) => json_r(json!({"ok": true})),
                    Err(e) => error(500, e),
                }
            }
            ("POST", "/local/mostrar") => match self.destino(url, false) {
                Err(r) => r,
                Ok((p, _)) => {
                    mostrar(&p);
                    json_r(json!({"ok": true}))
                }
            },
            ("GET", "/local/emparejar") => json_r(json!({"codigo": self.codigo, "qr": qr_svg(&self.codigo)})),
            ("GET", "/local/grupo") => json_r(crate::almacen::Almacen::grupo(&self.carpetas)),
            _ => vacia(404),
        }
    }
}

/// Diálogo nativo para elegir una carpeta (solo en Windows).
#[cfg(windows)]
fn elegir_carpeta(titulo: Option<&str>) -> Option<PathBuf> {
    let d = rfd::FileDialog::new().set_title(titulo.unwrap_or("Elige una carpeta"));
    let d = match dirs_documentos() {
        Some(p) => d.set_directory(p),
        None => d,
    };
    d.pick_folder()
}
#[cfg(not(windows))]
fn elegir_carpeta(_titulo: Option<&str>) -> Option<PathBuf> {
    None
}

#[cfg(windows)]
fn dirs_documentos() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(|u| PathBuf::from(u).join("Documents"))
}

fn mostrar(p: &Path) {
    #[cfg(windows)]
    let _ = std::process::Command::new("explorer.exe").arg(p).spawn();
    #[cfg(not(windows))]
    let _ = p;
}

/// Código QR como SVG (para escanearlo con el celular en "Vincular celular").
pub fn qr_svg(texto: &str) -> String {
    match qrcode::QrCode::new(texto.as_bytes()) {
        Ok(c) => c.render::<qrcode::render::svg::Color>().min_dimensions(240, 240).quiet_zone(true).build(),
        Err(_) => String::new(),
    }
}
