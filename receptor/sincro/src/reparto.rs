// receptor/sincro/src/reparto.rs
//! Un proyecto, una carpeta: qué va a cada carpeta. Misma regla que `app/src/lib/reparto.js`
//! (vectores compartidos en `app/tests/vectores/reparto.json`): mantenerlas iguales.
//! - cada proyecto va a la carpeta que lo lista;
//! - cada cita, a la carpeta de su proyecto;
//! - cada fuente, a toda carpeta donde tiene citas; si no tiene citas en ningún proyecto con
//!   carpeta, a las carpetas marcadas como biblioteca.
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap, HashSet};

#[derive(Clone, Debug)]
pub struct CarpetaReg {
    pub clave: String,
    pub proyectos: Vec<String>,
    pub biblioteca: bool,
}

fn lista(v: &Value) -> Vec<Value> {
    v.as_array().cloned().unwrap_or_default()
}

/// Una parte `{proyectos, fuentes, citas}` por carpeta, en el mismo orden que `carpetas`.
pub fn repartir(datos: &Value, carpetas: &[CarpetaReg]) -> Vec<Value> {
    let mut de_proyecto: HashMap<&str, Vec<usize>> = HashMap::new();
    for (i, c) in carpetas.iter().enumerate() {
        for pid in &c.proyectos {
            de_proyecto.entry(pid.as_str()).or_default().push(i);
        }
    }
    let n = carpetas.len();
    let (mut proyectos, mut fuentes, mut citas) = (vec![vec![]; n], vec![vec![]; n], vec![vec![]; n]);
    for p in lista(&datos["proyectos"]) {
        for &i in de_proyecto.get(p["id"].as_str().unwrap_or("")).map(|v| v.as_slice()).unwrap_or(&[]) {
            proyectos[i].push(p.clone());
        }
    }
    let mut fuente_en: HashMap<String, BTreeSet<usize>> = HashMap::new();
    for c in lista(&datos["citas"]) {
        let fid = c["fuente_id"].as_str().unwrap_or("").to_string();
        for &i in de_proyecto.get(c["proyecto_id"].as_str().unwrap_or("")).map(|v| v.as_slice()).unwrap_or(&[]) {
            citas[i].push(c.clone());
            fuente_en.entry(fid.clone()).or_default().insert(i);
        }
    }
    let bibliotecas: Vec<usize> = carpetas.iter().enumerate().filter(|(_, c)| c.biblioteca).map(|(i, _)| i).collect();
    for f in lista(&datos["fuentes"]) {
        match fuente_en.get(f["id"].as_str().unwrap_or("")) {
            Some(donde) => donde.iter().for_each(|&i| fuentes[i].push(f.clone())),
            None => bibliotecas.iter().for_each(|&i| fuentes[i].push(f.clone())),
        }
    }
    (0..n).map(|i| json!({"proyectos": proyectos[i], "fuentes": fuentes[i], "citas": citas[i]})).collect()
}

fn fotos_de(p: &Value) -> Vec<Value> {
    let mut out = lista(&p["canvas"]["fotos"]);
    for sub in ["objetivos", "lecturas"] {
        if let Some(objs) = p["canvas"][sub].as_object() {
            for o in objs.values() {
                out.extend(lista(&o["fotos"]));
            }
        }
    }
    out
}

/// Rutas de los documentos de una parte: los de sus fuentes y los originales de sus fotos.
pub fn docs_de(parte: &Value) -> Vec<String> {
    let mut vistos = HashSet::new();
    let mut out = vec![];
    let mut agregar = |r: Option<&str>| {
        if let Some(r) = r.filter(|r| !r.is_empty()) {
            if vistos.insert(r.to_string()) {
                out.push(r.to_string());
            }
        }
    };
    for f in lista(&parte["fuentes"]) {
        agregar(f["documento_original"].as_str());
    }
    for p in lista(&parte["proyectos"]) {
        for f in fotos_de(&p) {
            agregar(f["original"].as_str());
        }
    }
    out
}
