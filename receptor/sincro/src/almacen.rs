// receptor/sincro/src/almacen.rs
//! Lo que el servidor necesita de "donde están los datos": una sola carpeta (`Carpeta`, como
//! siempre) o las carpetas de los proyectos abiertos en la app de Windows (`Carpetas`).
use serde_json::Value;
use std::io;

pub trait Almacen: Send + Sync {
    /// Cambia cada vez que cambia cualquiera de los JSON (detecta ediciones concurrentes).
    fn etiqueta(&self) -> String;
    /// `{etiqueta, proyectos, fuentes, citas, docs: [{ruta, bytes}]}`. Con `con_fotos`, `docs`
    /// incluye también los originales de fotos (`fotos/<id>.<ext>`): solo lo piden clientes nuevos.
    fn leer(&self, con_fotos: bool) -> io::Result<Value>;
    /// Escribe las colecciones presentes en `datos` y anota `eliminados` para la app.
    fn escribir(&self, datos: &Value, eliminados: &Value) -> io::Result<()>;
    /// Bytes de un documento (`fuentes/<id>/documento.<ext>` o `fotos/<id>.<ext>`); `Err` si la ruta no es válida.
    fn leer_doc(&self, ruta: &str) -> Result<Option<Vec<u8>>, RutaInvalida>;
    fn escribir_doc(&self, ruta: &str, bytes: &[u8]) -> Result<io::Result<()>, RutaInvalida>;
    // Grupo de sincronización.
    fn base_de(&self, id: &str) -> Option<Value>;
    fn guardar_base(&self, id: &str, datos: &Value) -> io::Result<()>;
    fn grupo(&self) -> Value;
    fn anotar_aparato(&self, id: &str, nombre: &str, ahora_ms: u64, sincronizo: bool) -> io::Result<()>;
}

#[derive(Debug)]
pub struct RutaInvalida;

/// `fuentes/<id>/documento.<ext>` o `fotos/<id>.<ext>` (id y extensión alfanuméricos, `_`, `-`):
/// nada fuera de la carpeta. Devuelve las partes de la ruta relativa.
pub fn ruta_doc_valida(ruta: &str) -> Option<Vec<String>> {
    let ok_id = |s: &str| !s.is_empty() && s.len() <= 80 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    let ok_ext = |s: &str| !s.is_empty() && s.len() <= 8 && s.chars().all(|c| c.is_ascii_alphanumeric());
    let partes: Vec<&str> = ruta.split('/').collect();
    match partes.as_slice() {
        ["fuentes", id, nombre] => {
            let ext = nombre.strip_prefix("documento.")?;
            (ok_id(id) && ok_ext(ext)).then(|| partes.iter().map(|s| s.to_string()).collect())
        }
        ["fotos", nombre] => {
            let (id, ext) = nombre.rsplit_once('.')?;
            (ok_id(id) && ok_ext(ext)).then(|| partes.iter().map(|s| s.to_string()).collect())
        }
        _ => None,
    }
}
