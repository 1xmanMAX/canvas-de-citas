// receptor/sincro/src/carpetas.rs
//! Las carpetas de los proyectos abiertos en la app de Windows, vistas por el celular como si
//! fueran una sola: `leer` une (los proyectos marcados para sincronizar), `escribir` aplica en cada
//! carpeta solo lo que el celular cambió (misma regla de reparto que la app, `reparto.rs`) y
//! conserva lo que cada carpeta tiene y el celular no tocó. Un proyecto nuevo que llega del celular
//! recibe su propia carpeta en `Documentos\Canvas de Citas\<título>`. Todo por el Wi-Fi local.
//! Registro (lo mantiene la app, el servidor agrega los proyectos nuevos del celular):
//! `[{ "clave", "nombre", "carpeta": "F:\\…", "proyectos": [ids], "biblioteca": bool, "sincronizar": bool }]`.
use crate::almacen::{ruta_doc_valida, Almacen, RutaInvalida};
use crate::carpeta::{Carpeta, COLECCIONES};
use crate::reparto::{docs_de, repartir, CarpetaReg};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
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
fn id_de(v: &Value) -> String {
    v["id"].as_str().unwrap_or("").to_string()
}

/// Una carpeta leída de una vez: sus tres colecciones y los bytes con que se calculó la etiqueta.
struct Leida {
    e: Entrada,
    c: Carpeta,
    ids: Vec<String>,
    cols: HashMap<&'static str, Vec<Value>>,
    /// Fecha de su fuentes.json: la copia más reciente de una fuente compartida es la que se sirve.
    mtime_fuentes: u128,
}

/// Lo que el celular ve, leído una sola vez (datos y etiqueta salen de los mismos bytes).
struct Instantanea {
    etiqueta: String,
    carpetas: Vec<Leida>,
}

fn parsear(col: &str, b: &[u8]) -> io::Result<Vec<Value>> {
    if b.is_empty() {
        return Ok(vec![]);
    }
    let v: Value = serde_json::from_slice(b.strip_prefix(b"\xef\xbb\xbf").unwrap_or(b)).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("{col}.json: {e}")))?;
    Ok(match v {
        Value::Array(a) => a,
        Value::Object(mut m) => m.remove(col).map(|x| lista(&x)).unwrap_or_default(),
        _ => vec![],
    })
}

impl Carpetas {
    pub fn nueva(registro: impl Into<PathBuf>, estado: impl Into<PathBuf>, nuevos: impl Into<PathBuf>) -> Self {
        Carpetas { registro: registro.into(), estado: estado.into(), nuevos: nuevos.into() }
    }

    /// El registro (vacío si no existe; error si no se puede leer: no se trata como "sin datos").
    fn registro_leido(&self) -> Result<Vec<Entrada>, String> {
        let b = match fs::read(&self.registro) {
            Ok(b) => b,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(vec![]),
            Err(e) => return Err(format!("No se pudo leer el registro de carpetas: {e}")),
        };
        // (Tolera el BOM que agrega PowerShell 5 al escribir UTF-8.)
        let v: Value = serde_json::from_slice(b.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&b)).map_err(|e| format!("Registro de carpetas ilegible: {e}"))?;
        Ok(lista(&v).into_iter().map(|v| Entrada { v }).collect())
    }

    pub fn entradas(&self) -> Vec<Entrada> {
        let _c = REGISTRO.lock().unwrap_or_else(|e| e.into_inner());
        self.registro_leido().unwrap_or_default()
    }

    /// Reemplaza el registro tal cual (pruebas y herramientas).
    pub fn guardar_registro(&self, v: &Value) -> io::Result<()> {
        let _c = REGISTRO.lock().unwrap_or_else(|e| e.into_inner());
        escribir_atomico(&self.registro, &Carpeta::json_bonito(v)?)
    }

    /// El registro que manda la app: conserva lo que el servidor agregó y la app aún no conoce
    /// (proyectos creados en el celular), salvo las claves de `quitar`.
    pub fn guardar_registro_de_app(&self, v: &Value, quitar: &[String]) -> io::Result<()> {
        let _c = REGISTRO.lock().unwrap_or_else(|e| e.into_inner());
        let mut nuevo = lista(v);
        let conocidas: HashSet<String> = nuevo.iter().filter_map(|e| e["clave"].as_str().map(String::from)).collect();
        for e in self.registro_leido().unwrap_or_default() {
            let clave = e.v["clave"].as_str().unwrap_or("").to_string();
            if clave.starts_with('s') && !conocidas.contains(&clave) && !quitar.contains(&clave) {
                nuevo.push(e.v);
            }
        }
        escribir_atomico(&self.registro, &Carpeta::json_bonito(&Value::Array(nuevo))?)
    }

    /// Lee todas las carpetas que se sincronizan. Error si el registro no se puede leer, si una
    /// carpeta marcada no está disponible (disco desconectado) o si un JSON está roto: mejor
    /// "abre la app / conecta el disco" que servir una vista incompleta que el celular tome como borrado.
    fn instantanea(&self) -> io::Result<Instantanea> {
        let todas = {
            let _c = REGISTRO.lock().unwrap_or_else(|e| e.into_inner());
            self.registro_leido().map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?
        };
        let registrados: HashSet<String> = todas.iter().flat_map(|e| e.proyectos()).collect();
        let mut h = Sha256::new();
        let mut carpetas = vec![];
        for e in todas.into_iter().filter(|e| e.sincronizar()) {
            if !e.disponible() {
                return Err(io::Error::new(io::ErrorKind::NotFound, format!("No está disponible la carpeta {}", e.carpeta().display())));
            }
            let c = Carpeta::nueva(e.carpeta());
            h.update(e.carpeta().to_string_lossy().as_bytes());
            let mut cols = HashMap::new();
            for col in COLECCIONES {
                let b = c.bytes(col);
                h.update(col.as_bytes());
                h.update(&b);
                cols.insert(col, parsear(col, &b)?);
            }
            let mut ids = e.proyectos();
            for p in &cols["proyectos"] {
                let id = id_de(p);
                if !id.is_empty() && !registrados.contains(&id) && !ids.contains(&id) {
                    ids.push(id);
                }
            }
            h.update(ids.join(",").as_bytes());
            let mtime_fuentes = fs::metadata(c.raiz.join("fuentes.json")).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_nanos()).unwrap_or(0);
            carpetas.push(Leida { e, c, ids, cols, mtime_fuentes });
        }
        Ok(Instantanea { etiqueta: h.finalize().iter().map(|b| format!("{b:02x}")).collect(), carpetas })
    }

    /// La unión que ve el celular. Cada id una vez: proyectos y citas de su carpeta; una fuente
    /// compartida, de la carpeta donde se modificó más recientemente.
    fn union(inst: &Instantanea) -> Value {
        let todos: HashSet<&String> = inst.carpetas.iter().flat_map(|l| l.ids.iter()).collect();
        let (mut proyectos, mut fuentes, mut citas) = (vec![], vec![], vec![]);
        let (mut vp, mut vf, mut vc) = (HashSet::new(), HashSet::new(), HashSet::new());
        for l in &inst.carpetas {
            for p in &l.cols["proyectos"] {
                if l.ids.contains(&id_de(p)) && vp.insert(id_de(p)) {
                    proyectos.push(p.clone());
                }
            }
            for k in &l.cols["citas"] {
                if todos.contains(&k["proyecto_id"].as_str().unwrap_or("").to_string()) && vc.insert(id_de(k)) {
                    citas.push(k.clone());
                }
            }
        }
        let mut orden: Vec<&Leida> = inst.carpetas.iter().collect();
        orden.sort_by(|a, b| b.mtime_fuentes.cmp(&a.mtime_fuentes));
        for l in orden {
            for f in &l.cols["fuentes"] {
                if vf.insert(id_de(f)) {
                    fuentes.push(f.clone());
                }
            }
        }
        json!({"proyectos": proyectos, "fuentes": fuentes, "citas": citas})
    }

    fn excluidos(&self) -> HashSet<String> {
        self.entradas().into_iter().filter(|e| !e.sincronizar()).flat_map(|e| e.proyectos()).collect()
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

    fn regs(carpetas: &[Leida]) -> Vec<CarpetaReg> {
        carpetas.iter().enumerate().map(|(i, l)| CarpetaReg { clave: i.to_string(), proyectos: l.ids.clone(), biblioteca: l.e.biblioteca() }).collect()
    }
}

fn escribir_atomico(destino: &Path, datos: &[u8]) -> io::Result<()> {
    if let Some(p) = destino.parent() {
        fs::create_dir_all(p)?;
    }
    let mut azar = [0u8; 4];
    let _ = getrandom::getrandom(&mut azar);
    let nombre = destino.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let tmp = destino.with_file_name(format!("{nombre}.{:08x}.tmp-sincro", u32::from_le_bytes(azar)));
    fs::write(&tmp, datos)?;
    fs::rename(&tmp, destino)
}

impl Almacen for Carpetas {
    fn listo(&self) -> Result<(), String> {
        self.instantanea().map(|_| ()).map_err(|e| e.to_string())
    }

    fn etiqueta(&self) -> String {
        self.instantanea().map(|i| i.etiqueta).unwrap_or_else(|e| format!("no-disponible: {e}"))
    }

    fn leer(&self, con_fotos: bool) -> io::Result<Value> {
        let inst = self.instantanea()?;
        let mut v = Self::union(&inst);
        let mut vistos = HashSet::new();
        let mut docs = vec![];
        for l in &inst.carpetas {
            let mut ds = l.c.documentos();
            if con_fotos {
                ds.extend(l.c.fotos());
            }
            for d in ds {
                if vistos.insert(d["ruta"].as_str().unwrap_or("").to_string()) {
                    docs.push(d);
                }
            }
        }
        docs.sort_by(|a, b| a["ruta"].as_str().cmp(&b["ruta"].as_str()));
        v["etiqueta"] = json!(inst.etiqueta);
        v["docs"] = Value::Array(docs);
        Ok(v)
    }

    fn escribir(&self, datos: &Value, eliminados: &Value) -> io::Result<()> {
        let mut inst = self.instantanea()?;
        let antes = Self::union(&inst);
        let excluidos = self.excluidos();
        let mut completo = antes.clone();
        for col in COLECCIONES {
            if let Some(items) = datos.get(col) {
                completo[col] = items.clone();
            }
        }
        // Lo de proyectos marcados "no sincronizar" no se toca desde el celular.
        completo["proyectos"] = Value::Array(lista(&completo["proyectos"]).into_iter().filter(|p| !excluidos.contains(p["id"].as_str().unwrap_or(""))).collect());
        completo["citas"] = Value::Array(lista(&completo["citas"]).into_iter().filter(|c| !excluidos.contains(c["proyecto_id"].as_str().unwrap_or(""))).collect());

        // Qué cambió el celular: ids nuevos o distintos y ids borrados, respecto a lo que vio.
        let mut cambiados: HashMap<&str, HashSet<String>> = HashMap::new();
        let mut borrados: HashMap<&str, HashSet<String>> = HashMap::new();
        for col in COLECCIONES {
            let viejo: HashMap<String, Value> = lista(&antes[col]).into_iter().map(|x| (id_de(&x), x)).collect();
            let nuevo: HashMap<String, Value> = lista(&completo[col]).into_iter().map(|x| (id_de(&x), x)).collect();
            cambiados.insert(col, nuevo.iter().filter(|(id, x)| viejo.get(*id) != Some(*x)).map(|(id, _)| id.clone()).collect());
            borrados.insert(col, viejo.keys().filter(|id| !nuevo.contains_key(*id)).cloned().collect());
        }
        // Solo se anotan como borrados ids que están en lo que se sincroniza: nunca algo de un
        // proyecto marcado "no sincronizar" (la app los borraría de todas partes).
        let mut eliminados_ok = Map::new();
        for col in COLECCIONES {
            let hay: HashSet<String> = lista(&antes[col]).iter().map(id_de).collect();
            let ids: Vec<Value> = lista(&eliminados[col]).into_iter().filter(|id| id.as_str().is_some_and(|s| hay.contains(s))).collect();
            if !ids.is_empty() {
                eliminados_ok.insert(col.into(), Value::Array(ids));
            }
        }
        let eliminados = &Value::Object(eliminados_ok);

        // Proyectos nuevos (creados en el celular): su propia carpeta.
        let con_carpeta: HashSet<String> = inst.carpetas.iter().flat_map(|l| l.ids.clone()).collect();
        for p in lista(&completo["proyectos"]) {
            let id = id_de(&p);
            if id.is_empty() || con_carpeta.contains(&id) || excluidos.contains(&id) {
                continue;
            }
            let dir = self.carpeta_nueva(p["titulo"].as_str().unwrap_or("Proyecto"))?;
            let nombre = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let v = json!({"clave": format!("s{}-{}", crate::cifrado::ahora_ms(), inst.carpetas.len()), "nombre": nombre, "carpeta": dir.to_string_lossy(), "proyectos": [id], "biblioteca": false, "sincronizar": true});
            {
                let _c = REGISTRO.lock().unwrap_or_else(|e| e.into_inner());
                let mut todas: Vec<Value> = self.registro_leido().map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?.into_iter().map(|e| e.v).collect();
                todas.push(v.clone());
                escribir_atomico(&self.registro, &Carpeta::json_bonito(&Value::Array(todas))?)?;
            }
            let c = Carpeta::nueva(&dir);
            inst.carpetas.push(Leida { e: Entrada { v }, c, ids: vec![id], cols: COLECCIONES.iter().map(|&k| (k, vec![])).collect(), mtime_fuentes: 0 });
        }

        let partes = repartir(&completo, &Self::regs(&inst.carpetas));
        for (l, parte) in inst.carpetas.iter().zip(&partes) {
            let mut cambiar = Map::new();
            for col in COLECCIONES {
                let propios: HashMap<String, &Value> = l.cols[col].iter().map(|x| (id_de(x), x)).collect();
                let (camb, borr) = (&cambiados[col], &borrados[col]);
                let mut out = vec![];
                let mut puestos = HashSet::new();
                // Lo que le toca: la versión del celular si la cambió; si no, la que ya tiene esta carpeta.
                for x in lista(&parte[col]) {
                    let id = id_de(&x);
                    puestos.insert(id.clone());
                    match propios.get(&id) {
                        Some(p) if !camb.contains(&id) => out.push((*p).clone()),
                        _ => out.push(x),
                    }
                }
                // Lo propio que la unión no trae (p. ej. un id que choca con otra carpeta): se conserva,
                // salvo que el celular lo haya borrado o cambiado (y ahora vaya a otra carpeta).
                for p in &l.cols[col] {
                    let id = id_de(p);
                    if !puestos.contains(&id) && !borr.contains(&id) && !camb.contains(&id) {
                        out.push(p.clone());
                    }
                }
                let mut m = Map::new();
                m.insert(col.into(), Value::Array(out.clone()));
                if Carpeta::json_bonito(&Value::Object(m))? != l.c.bytes(col) {
                    cambiar.insert(col.into(), Value::Array(out));
                }
            }
            l.c.escribir(&Value::Object(cambiar), eliminados)?;
        }
        Ok(())
    }

    fn leer_doc(&self, ruta: &str) -> Result<Option<Vec<u8>>, RutaInvalida> {
        let partes = ruta_doc_valida(ruta).ok_or(RutaInvalida)?;
        for e in self.entradas().into_iter().filter(|e| e.sincronizar() && e.disponible()) {
            if let Ok(b) = fs::read(partes.iter().fold(e.carpeta(), |p, x| p.join(x))) {
                return Ok(Some(b));
            }
        }
        Ok(None)
    }

    fn escribir_doc(&self, ruta: &str, bytes: &[u8]) -> Result<io::Result<()>, RutaInvalida> {
        let partes = ruta_doc_valida(ruta).ok_or(RutaInvalida)?;
        let inst = match self.instantanea() {
            Ok(i) => i,
            Err(e) => return Ok(Err(e)),
        };
        let partes_datos = repartir(&Self::union(&inst), &Self::regs(&inst.carpetas));
        // A toda carpeta a la que le toca ese documento; si no le toca a ninguna todavía, a la biblioteca o a la primera.
        let mut destinos: Vec<PathBuf> = inst.carpetas.iter().zip(&partes_datos).filter(|(_, p)| docs_de(p).iter().any(|r| r == ruta)).map(|(l, _)| l.e.carpeta()).collect();
        if destinos.is_empty() {
            destinos.extend(inst.carpetas.iter().find(|l| l.e.biblioteca()).or(inst.carpetas.first()).map(|l| l.e.carpeta()));
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
