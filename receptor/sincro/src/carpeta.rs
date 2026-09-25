// receptor/sincro/src/carpeta.rs
//! La carpeta de datos de la app en la PC: los tres JSON (mismo formato que escribe la app),
//! `eliminados.json` (la app borra esos ids al recogerlos) y `fuentes/<id>/documento.<ext>`.
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const COLECCIONES: [&str; 3] = ["proyectos", "fuentes", "citas"];

pub struct Carpeta {
    pub raiz: PathBuf,
}

impl Carpeta {
    pub fn nueva(raiz: impl Into<PathBuf>) -> Self {
        Carpeta { raiz: raiz.into() }
    }

    fn archivo(&self, col: &str) -> PathBuf {
        self.raiz.join(format!("{col}.json"))
    }

    fn bytes(&self, col: &str) -> Vec<u8> {
        fs::read(self.archivo(col)).unwrap_or_default()
    }

    /// Cambia cada vez que cambia cualquiera de los tres JSON (detecta ediciones concurrentes).
    pub fn etiqueta(&self) -> String {
        let mut h = Sha256::new();
        for c in COLECCIONES {
            h.update(c.as_bytes());
            h.update(self.bytes(c));
        }
        h.finalize().iter().map(|b| format!("{b:02x}")).collect()
    }

    pub fn coleccion(&self, col: &str) -> io::Result<Value> {
        let b = self.bytes(col);
        if b.is_empty() {
            return Ok(json!([]));
        }
        let v: Value = serde_json::from_slice(&b).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("{col}.json: {e}")))?;
        Ok(match v {
            Value::Array(_) => v,
            Value::Object(mut m) => m.remove(col).unwrap_or_else(|| json!([])),
            _ => json!([]),
        })
    }

    pub fn leer(&self) -> io::Result<Value> {
        let mut m = Map::new();
        m.insert("etiqueta".into(), json!(self.etiqueta()));
        for c in COLECCIONES {
            m.insert(c.into(), self.coleccion(c)?);
        }
        m.insert("docs".into(), Value::Array(self.documentos()));
        Ok(Value::Object(m))
    }

    fn escribir_atomico(&self, destino: &Path, datos: &[u8]) -> io::Result<()> {
        if let Some(p) = destino.parent() {
            fs::create_dir_all(p)?;
        }
        let tmp = destino.with_extension("tmp-sincro");
        fs::write(&tmp, datos)?;
        fs::rename(&tmp, destino)
    }

    fn json_bonito(v: &Value) -> io::Result<Vec<u8>> {
        let mut txt = serde_json::to_string_pretty(v)?;
        txt.push('\n');
        Ok(txt.into_bytes())
    }

    /// Escribe solo las colecciones presentes en `datos` y suma a `eliminados.json` los ids de
    /// `eliminados` (`{"fuentes": [...], ...}`).
    pub fn escribir(&self, datos: &Value, eliminados: &Value) -> io::Result<()> {
        for c in COLECCIONES {
            if let Some(items) = datos.get(c) {
                let mut m = Map::new();
                m.insert(c.into(), items.clone());
                self.escribir_atomico(&self.archivo(c), &Self::json_bonito(&Value::Object(m))?)?;
            }
        }
        let nuevos = |c: &str| eliminados.get(c).and_then(|v| v.as_array()).cloned().unwrap_or_default();
        if COLECCIONES.iter().all(|c| nuevos(c).is_empty()) {
            return Ok(());
        }
        let ruta = self.raiz.join("eliminados.json");
        let mut actual: Value = fs::read(&ruta).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_else(|| json!({}));
        for c in COLECCIONES {
            let mut ids = actual.get(c).and_then(|v| v.as_array()).cloned().unwrap_or_default();
            for id in nuevos(c) {
                if !ids.contains(&id) {
                    ids.push(id);
                }
            }
            if !ids.is_empty() {
                actual[c] = Value::Array(ids);
            }
        }
        self.escribir_atomico(&ruta, &Self::json_bonito(&actual)?)
    }

    pub fn documentos(&self) -> Vec<Value> {
        let mut l = vec![];
        let Ok(dirs) = fs::read_dir(self.raiz.join("fuentes")) else { return l };
        for d in dirs.flatten() {
            let Ok(archivos) = fs::read_dir(d.path()) else { continue };
            for a in archivos.flatten() {
                let nombre = a.file_name().to_string_lossy().to_string();
                if !nombre.starts_with("documento.") || nombre.ends_with(".tmp-sincro") {
                    continue;
                }
                let Ok(meta) = a.metadata() else { continue };
                l.push(json!({"ruta": format!("fuentes/{}/{}", d.file_name().to_string_lossy(), nombre), "bytes": meta.len()}));
            }
        }
        l.sort_by(|a, b| a["ruta"].as_str().cmp(&b["ruta"].as_str()));
        l
    }

    /// Solo `fuentes/<id>/documento.<ext>` (id y extensión alfanuméricos): nada fuera de la carpeta.
    pub fn ruta_segura(&self, ruta: &str) -> Option<PathBuf> {
        let partes: Vec<&str> = ruta.split('/').collect();
        let [raiz, id, nombre] = partes.as_slice() else { return None };
        let id_ok = !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        let ext = nombre.strip_prefix("documento.")?;
        let ext_ok = !ext.is_empty() && ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric());
        (*raiz == "fuentes" && id_ok && ext_ok).then(|| self.raiz.join("fuentes").join(id).join(nombre))
    }

    pub fn escribir_doc(&self, destino: &Path, bytes: &[u8]) -> io::Result<()> {
        self.escribir_atomico(destino, bytes)
    }

    // --- Grupo de sincronización: en `.sincro/` (junto a los datos, fuera de `fuentes/`) ---

    fn dir_sincro(&self) -> PathBuf {
        self.raiz.join(".sincro")
    }

    /// Id de aparato válido (lo genera la app): letras, números, `_` y `-`.
    pub fn id_valido(id: &str) -> bool {
        !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    }

    /// Los datos tal como quedaron en la última sincronización de ese aparato.
    pub fn base_de(&self, id: &str) -> Option<Value> {
        if !Self::id_valido(id) {
            return None;
        }
        serde_json::from_slice(&fs::read(self.dir_sincro().join(format!("base-{id}.json"))).ok()?).ok()
    }

    pub fn guardar_base(&self, id: &str, datos: &Value) -> io::Result<()> {
        if !Self::id_valido(id) {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "id de aparato inválido"));
        }
        self.escribir_atomico(&self.dir_sincro().join(format!("base-{id}.json")), &serde_json::to_vec(datos)?)
    }

    /// `[{id, nombre, visto, sincronizado}]` de los aparatos que se han conectado.
    pub fn grupo(&self) -> Value {
        fs::read(self.dir_sincro().join("grupo.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_else(|| json!([]))
    }

    /// Anota que el aparato se conectó (y, si `sincronizo`, que terminó una sincronización).
    pub fn anotar_aparato(&self, id: &str, nombre: &str, ahora_ms: u64, sincronizo: bool) -> io::Result<()> {
        if !Self::id_valido(id) {
            return Ok(());
        }
        let mut g = self.grupo();
        let lista = g.as_array_mut().expect("grupo es una lista");
        let i = match lista.iter().position(|a| a["id"] == id) {
            Some(i) => i,
            None => {
                lista.push(json!({"id": id}));
                lista.len() - 1
            }
        };
        let a = &mut lista[i];
        let nombre: String = nombre.chars().take(60).collect();
        if !nombre.trim().is_empty() {
            a["nombre"] = json!(nombre.trim());
        }
        a["visto"] = json!(ahora_ms);
        if sincronizo {
            a["sincronizado"] = json!(ahora_ms);
        }
        self.escribir_atomico(&self.dir_sincro().join("grupo.json"), &Self::json_bonito(&g)?)
    }
}
