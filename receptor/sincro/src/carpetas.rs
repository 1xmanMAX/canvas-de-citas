// receptor/sincro/src/carpetas.rs
//! Las carpetas de los proyectos abiertos en la app de Windows, vistas por el celular como si
//! fueran una sola: `leer` une (los proyectos marcados para sincronizar), `escribir` reparte con la
//! misma regla que la app (`reparto.rs`). Un proyecto nuevo que llega del celular recibe su propia
//! carpeta en `Documentos\Canvas de Citas\<título>`. Registro (lo mantiene la app):
//! `[{ "clave", "nombre", "carpeta": "F:\\…", "proyectos": [ids], "biblioteca": bool, "sincronizar": bool }]`.
use crate::almacen::{ruta_doc_valida, Almacen, RutaInvalida};
use crate::carpeta::{Carpeta, COLECCIONES};
use crate::reparto::{docs_de, repartir, CarpetaReg};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// El registro se lee y escribe desde varios hilos (servidor y puente de la app).
static REGISTRO: Mutex<()> = Mutex::new(());

pub struct Carpetas {
    /// `proyectos-abiertos.json`.
    pub registro: PathBuf,
    /// Bases por aparato y grupo de sincronización (`<estado>/.sincro/`).
    pub estado: PathBuf,
    /// Dónde se crean las carpetas de proyectos nuevos (`Documentos\Canvas de Citas`).
    pub nuevos: PathBuf,
}

#[derive(Clone, Debug)]
pub struct Entrada {
    pub v: Value,
}

impl Entrada {
    pub fn carpeta(&self) -> PathBuf {
        PathBuf::from(self.v["carpeta"].as_str().unwrap_or(""))
    }
    pub fn proyectos(&self) -> Vec<String> {
        self.v["proyectos"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
    }
    pub fn biblioteca(&self) -> bool {
        self.v["biblioteca"].as_bool().unwrap_or(false)
    }
    /// Por defecto sí: solo se excluye lo que la app marcó "no sincronizar".
    pub fn sincronizar(&self) -> bool {
        self.v["sincronizar"].as_bool().unwrap_or(true)
    }
    /// La carpeta existe (un disco desconectado no se lee ni se escribe, y no se recrea vacía).
    pub fn disponible(&self) -> bool {
        let c = self.carpeta();
        !c.as_os_str().is_empty() && c.is_dir()
    }
}

/// Nombre de carpeta válido en Windows a partir de un título (igual que `nombreSeguro` de la app).
pub fn nombre_seguro(titulo: &str) -> String {
    let limpio: String = titulo.chars().map(|c| if "\\/:*?\"<>|".contains(c) || (c as u32) < 32 { ' ' } else { c }).collect();
    let t = limpio.split_whitespace().collect::<Vec<_>>().join(" ");
    let t = t.trim_end_matches(['.', ' ']).to_string();
    let t: String = if t.chars().count() > 60 { t.chars().take(60).collect::<String>().trim().to_string() } else { t };
    if t.is_empty() { "Proyecto".into() } else { t }
}

fn lista(v: &Value) -> Vec<Value> {
    v.as_array().cloned().unwrap_or_default()
}

impl Carpetas {
    pub fn nueva(registro: impl Into<PathBuf>, estado: impl Into<PathBuf>, nuevos: impl Into<PathBuf>) -> Self {
        Carpetas { registro: registro.into(), estado: estado.into(), nuevos: nuevos.into() }
    }

    pub fn entradas(&self) -> Vec<Entrada> {
        let _c = REGISTRO.lock().unwrap_or_else(|e| e.into_inner());
        self.entradas_sin_candado()
    }

    fn entradas_sin_candado(&self) -> Vec<Entrada> {
        // (Tolera el BOM que agrega PowerShell 5 al escribir UTF-8.)
        let v: Value = fs::read(&self.registro).ok().and_then(|b| serde_json::from_slice(b.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&b)).ok()).unwrap_or_else(|| json!([]));
        lista(&v).into_iter().map(|v| Entrada { v }).collect()
    }

    /// Reemplaza el registro (lo hace la app al abrir, crear o cerrar proyectos).
    pub fn guardar_registro(&self, v: &Value) -> io::Result<()> {
        let _c = REGISTRO.lock().unwrap_or_else(|e| e.into_inner());
        escribir_atomico(&self.registro, &Carpeta::json_bonito(v)?)
    }

    /// Las que se sincronizan y están en el disco, con los proyectos de cada una: los del registro
    /// y los que su `proyectos.json` trae sin estar registrados en ninguna (carpetas antiguas).
    fn incluidas(&self) -> Vec<(Entrada, Carpeta, Vec<String>)> {
        let todas = self.entradas();
        let registrados: HashSet<String> = todas.iter().flat_map(|e| e.proyectos()).collect();
        todas
            .into_iter()
            .filter(|e| e.sincronizar() && e.disponible())
            .map(|e| {
                let c = Carpeta::nueva(e.carpeta());
                let mut ids = e.proyectos();
                for p in lista(&c.coleccion("proyectos").unwrap_or_else(|_| json!([]))) {
                    let id = p["id"].as_str().unwrap_or("").to_string();
                    if !id.is_empty() && !registrados.contains(&id) && !ids.contains(&id) {
                        ids.push(id);
                    }
                }
                (e, c, ids)
            })
            .collect()
    }

    /// Proyectos de carpetas marcadas "no sincronizar": lo que llegue para ellos se ignora.
    fn excluidos(&self) -> HashSet<String> {
        self.entradas().into_iter().filter(|e| !e.sincronizar()).flat_map(|e| e.proyectos()).collect()
    }

    fn datos(&self) -> io::Result<Value> {
        let inc = self.incluidas();
        let (mut proyectos, mut fuentes, mut citas) = (vec![], vec![], vec![]);
        let (mut vp, mut vf, mut vc) = (HashSet::new(), HashSet::new(), HashSet::new());
        let todos: HashSet<String> = inc.iter().flat_map(|(_, _, ids)| ids.clone()).collect();
        for (_, c, ids) in &inc {
            for p in lista(&c.coleccion("proyectos")?) {
                let id = p["id"].as_str().unwrap_or("").to_string();
                if ids.contains(&id) && vp.insert(id) {
                    proyectos.push(p);
                }
            }
            for k in lista(&c.coleccion("citas")?) {
                let id = k["id"].as_str().unwrap_or("").to_string();
                if todos.contains(k["proyecto_id"].as_str().unwrap_or("")) && vc.insert(id) {
                    citas.push(k);
                }
            }
            for f in lista(&c.coleccion("fuentes")?) {
                if vf.insert(f["id"].as_str().unwrap_or("").to_string()) {
                    fuentes.push(f);
                }
            }
        }
        Ok(json!({"proyectos": proyectos, "fuentes": fuentes, "citas": citas}))
    }

    fn carpeta_nueva(&self, titulo: &str) -> io::Result<PathBuf> {
        let base = nombre_seguro(titulo);
        for i in 1.. {
            let n = if i == 1 { base.clone() } else { format!("{base} ({i})") };
            let p = self.nuevos.join(&n);
            if !p.exists() {
                fs::create_dir_all(&p)?;
                return Ok(p);
            }
        }
        unreachable!()
    }

    fn base(&self) -> Carpeta {
        Carpeta::nueva(&self.estado)
    }
}

fn escribir_atomico(destino: &Path, datos: &[u8]) -> io::Result<()> {
    if let Some(p) = destino.parent() {
        fs::create_dir_all(p)?;
    }
    let tmp = destino.with_extension("tmp-sincro");
    fs::write(&tmp, datos)?;
    fs::rename(&tmp, destino)
}

impl Almacen for Carpetas {
    fn etiqueta(&self) -> String {
        let mut h = Sha256::new();
        for (e, c, ids) in self.incluidas() {
            h.update(e.carpeta().to_string_lossy().as_bytes());
            h.update(ids.join(",").as_bytes());
            for col in COLECCIONES {
                h.update(col.as_bytes());
                h.update(c.bytes(col));
            }
        }
        h.finalize().iter().map(|b| format!("{b:02x}")).collect()
    }

    fn leer(&self, con_fotos: bool) -> io::Result<Value> {
        let mut v = self.datos()?;
        let mut vistos = HashSet::new();
        let mut docs = vec![];
        for (_, c, _) in self.incluidas() {
            let mut l = c.documentos();
            if con_fotos {
                l.extend(c.fotos());
            }
            for d in l {
                if vistos.insert(d["ruta"].as_str().unwrap_or("").to_string()) {
                    docs.push(d);
                }
            }
        }
        docs.sort_by(|a, b| a["ruta"].as_str().cmp(&b["ruta"].as_str()));
        v["etiqueta"] = json!(self.etiqueta());
        v["docs"] = Value::Array(docs);
        Ok(v)
    }

    fn escribir(&self, datos: &Value, eliminados: &Value) -> io::Result<()> {
        let excluidos = self.excluidos();
        let mut completo = self.datos()?;
        // Solo se anotan como borrados ids que están en lo que se sincroniza: nunca algo de un
        // proyecto marcado "no sincronizar" (la app los borraría de todas partes).
        let mut eliminados_ok = Map::new();
        for col in COLECCIONES {
            let hay: HashSet<String> = lista(&completo[col]).iter().filter_map(|x| x["id"].as_str().map(String::from)).collect();
            let ids: Vec<Value> = lista(&eliminados[col]).into_iter().filter(|id| id.as_str().is_some_and(|s| hay.contains(s))).collect();
            if !ids.is_empty() {
                eliminados_ok.insert(col.into(), Value::Array(ids));
            }
        }
        let eliminados = &Value::Object(eliminados_ok);
        for col in COLECCIONES {
            if let Some(items) = datos.get(col) {
                completo[col] = items.clone();
            }
        }
        // Lo de proyectos marcados "no sincronizar" no se toca desde el celular.
        completo["proyectos"] = Value::Array(lista(&completo["proyectos"]).into_iter().filter(|p| !excluidos.contains(p["id"].as_str().unwrap_or(""))).collect());
        completo["citas"] = Value::Array(lista(&completo["citas"]).into_iter().filter(|c| !excluidos.contains(c["proyecto_id"].as_str().unwrap_or(""))).collect());

        // Proyectos nuevos (creados en el celular): su propia carpeta.
        let mut inc = self.incluidas();
        let con_carpeta: HashSet<String> = inc.iter().flat_map(|(_, _, ids)| ids.clone()).collect();
        for p in lista(&completo["proyectos"]) {
            let id = p["id"].as_str().unwrap_or("").to_string();
            if id.is_empty() || con_carpeta.contains(&id) {
                continue;
            }
            let dir = self.carpeta_nueva(p["titulo"].as_str().unwrap_or("Proyecto"))?;
            let _c = REGISTRO.lock().unwrap_or_else(|e| e.into_inner());
            let mut todas: Vec<Value> = self.entradas_sin_candado().into_iter().map(|e| e.v).collect();
            let nombre = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let v = json!({"clave": format!("s{}-{}", crate::cifrado::ahora_ms(), todas.len()), "nombre": nombre, "carpeta": dir.to_string_lossy(), "proyectos": [id], "biblioteca": false, "sincronizar": true});
            todas.push(v.clone());
            escribir_atomico(&self.registro, &Carpeta::json_bonito(&Value::Array(todas))?)?;
            drop(_c);
            let c = Carpeta::nueva(&dir);
            inc.push((Entrada { v }, c, vec![id]));
        }

        let regs: Vec<CarpetaReg> = inc
            .iter()
            .enumerate()
            .map(|(i, (e, _, ids))| CarpetaReg { clave: i.to_string(), proyectos: ids.clone(), biblioteca: e.biblioteca() })
            .collect();
        let partes = repartir(&completo, &regs);
        for ((_, c, _), parte) in inc.iter().zip(&partes) {
            // Solo lo que cambió: así la app no relee carpetas que no se tocaron.
            let mut cambiar = Map::new();
            for col in COLECCIONES {
                let mut m = Map::new();
                m.insert(col.into(), parte[col].clone());
                if Carpeta::json_bonito(&Value::Object(m))? != c.bytes(col) {
                    cambiar.insert(col.into(), parte[col].clone());
                }
            }
            c.escribir(&Value::Object(cambiar), eliminados)?;
        }
        Ok(())
    }

    fn leer_doc(&self, ruta: &str) -> Result<Option<Vec<u8>>, RutaInvalida> {
        let partes = ruta_doc_valida(ruta).ok_or(RutaInvalida)?;
        for (e, _, _) in self.incluidas() {
            if let Ok(b) = fs::read(partes.iter().fold(e.carpeta(), |p, x| p.join(x))) {
                return Ok(Some(b));
            }
        }
        Ok(None)
    }

    fn escribir_doc(&self, ruta: &str, bytes: &[u8]) -> Result<io::Result<()>, RutaInvalida> {
        let partes = ruta_doc_valida(ruta).ok_or(RutaInvalida)?;
        let inc = self.incluidas();
        let completo = match self.datos() {
            Ok(d) => d,
            Err(e) => return Ok(Err(e)),
        };
        let regs: Vec<CarpetaReg> = inc.iter().enumerate().map(|(i, (e, _, ids))| CarpetaReg { clave: i.to_string(), proyectos: ids.clone(), biblioteca: e.biblioteca() }).collect();
        let partes_datos = repartir(&completo, &regs);
        // A toda carpeta a la que le toca ese documento; si no le toca a ninguna todavía, a la biblioteca o a la primera.
        let mut destinos: Vec<PathBuf> = inc.iter().zip(&partes_datos).filter(|(_, p)| docs_de(p).iter().any(|r| r == ruta)).map(|((e, _, _), _)| e.carpeta()).collect();
        if destinos.is_empty() {
            destinos.extend(inc.iter().find(|(e, _, _)| e.biblioteca()).or(inc.first()).map(|(e, _, _)| e.carpeta()));
        }
        for d in destinos {
            if let Err(e) = escribir_atomico(&partes.iter().fold(d, |p, x| p.join(x)), bytes) {
                return Ok(Err(e));
            }
        }
        Ok(Ok(()))
    }

    fn base_de(&self, id: &str) -> Option<Value> {
        self.base().base_de(id)
    }
    fn guardar_base(&self, id: &str, datos: &Value) -> io::Result<()> {
        self.base().guardar_base(id, datos)
    }
    fn grupo(&self) -> Value {
        self.base().grupo()
    }
    fn anotar_aparato(&self, id: &str, nombre: &str, ahora_ms: u64, sincronizo: bool) -> io::Result<()> {
        self.base().anotar_aparato(id, nombre, ahora_ms, sincronizo)
    }
}
