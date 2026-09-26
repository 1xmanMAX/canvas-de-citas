// receptor/sincro/tests/carpetas.rs — varias carpetas de proyecto detrás del mismo servidor
use canvas_sincro::almacen::Almacen;
use canvas_sincro::carpetas::{nombre_seguro, Carpetas};
use canvas_sincro::cifrado::Clave;
use canvas_sincro::servidor::Sincro;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

fn escribir(dir: &Path, col: &str, items: Value) {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join(format!("{col}.json")), serde_json::to_string_pretty(&json!({ col: items })).unwrap() + "
").unwrap(); // como la app
}
fn leer(dir: &Path, col: &str) -> Value {
    let v: Value = serde_json::from_slice(&fs::read(dir.join(format!("{col}.json"))).unwrap()).unwrap();
    v[col].clone()
}
fn ids(v: &Value) -> Vec<String> {
    v.as_array().unwrap().iter().map(|x| x["id"].as_str().unwrap().to_string()).collect()
}

/// Tesis (con biblioteca) y Vías en carpetas distintas; la fuente 1 se cita en las dos.
fn escenario() -> (tempfile::TempDir, Carpetas) {
    let t = tempfile::tempdir().unwrap();
    let (tesis, vias) = (t.path().join("tesis"), t.path().join("vias"));
    escribir(&tesis, "proyectos", json!([{"id": "proyecto_001", "titulo": "Tesis"}]));
    escribir(&tesis, "fuentes", json!([{"id": "fuente_001", "titulo": "A", "documento_original": "fuentes/fuente_001/documento.pdf"}, {"id": "fuente_003", "titulo": "Suelta"}]));
    escribir(&tesis, "citas", json!([{"id": "cita_001", "proyecto_id": "proyecto_001", "fuente_id": "fuente_001"}]));
    fs::create_dir_all(tesis.join("fuentes/fuente_001")).unwrap();
    fs::write(tesis.join("fuentes/fuente_001/documento.pdf"), b"%PDF-a").unwrap();
    fs::create_dir_all(tesis.join("fotos")).unwrap();
    fs::write(tesis.join("fotos/foto_x.jpg"), b"JPG").unwrap();
    escribir(&vias, "proyectos", json!([{"id": "proyecto_002", "titulo": "Vías"}]));
    escribir(&vias, "fuentes", json!([{"id": "fuente_001", "titulo": "A", "documento_original": "fuentes/fuente_001/documento.pdf"}, {"id": "fuente_002", "titulo": "B"}]));
    escribir(&vias, "citas", json!([{"id": "cita_002", "proyecto_id": "proyecto_002", "fuente_id": "fuente_001"}, {"id": "cita_003", "proyecto_id": "proyecto_002", "fuente_id": "fuente_002"}]));
    let registro = t.path().join("proyectos-abiertos.json");
    fs::write(&registro, serde_json::to_string(&json!([
        {"clave": "a", "carpeta": tesis, "proyectos": ["proyecto_001"], "biblioteca": true, "sincronizar": true},
        {"clave": "b", "carpeta": vias, "proyectos": ["proyecto_002"], "biblioteca": false, "sincronizar": true}
    ])).unwrap()).unwrap();
    let c = Carpetas::nueva(&registro, t.path().join("estado"), t.path().join("Documentos/Canvas de Citas"));
    (t, c)
}

#[test]
fn lee_la_union_sin_duplicar() {
    let (_t, c) = escenario();
    let v = c.leer(false).unwrap();
    assert_eq!(ids(&v["proyectos"]), ["proyecto_001", "proyecto_002"]);
    assert_eq!(ids(&v["fuentes"]), ["fuente_001", "fuente_003", "fuente_002"]);
    assert_eq!(ids(&v["citas"]), ["cita_001", "cita_002", "cita_003"]);
    assert_eq!(v["docs"], json!([{"ruta": "fuentes/fuente_001/documento.pdf", "bytes": 6}]));
    // Los originales de fotos solo para quien los pide.
    let con = c.leer(true).unwrap();
    assert!(con["docs"].as_array().unwrap().iter().any(|d| d["ruta"] == "fotos/foto_x.jpg"));
}

#[test]
fn escribir_reparte_y_solo_toca_lo_que_cambio() {
    let (t, c) = escenario();
    let mut datos = c.leer(false).unwrap();
    // El celular corrige la fuente compartida y agrega una cita a la tesis.
    datos["fuentes"][0]["titulo"] = json!("A corregida");
    datos["citas"].as_array_mut().unwrap().push(json!({"id": "cita_009", "proyecto_id": "proyecto_001", "fuente_id": "fuente_003"}));
    let antes_proy = fs::metadata(t.path().join("vias/proyectos.json")).unwrap().modified().unwrap();
    std::thread::sleep(std::time::Duration::from_millis(20));
    c.escribir(&json!({"fuentes": datos["fuentes"], "citas": datos["citas"]}), &json!({})).unwrap();
    assert_eq!(leer(&t.path().join("tesis"), "fuentes")[0]["titulo"], "A corregida");
    assert_eq!(leer(&t.path().join("vias"), "fuentes")[0]["titulo"], "A corregida");
    assert_eq!(ids(&leer(&t.path().join("tesis"), "citas")), ["cita_001", "cita_009"]);
    assert_eq!(ids(&leer(&t.path().join("vias"), "citas")), ["cita_002", "cita_003"]);
    assert_eq!(fs::metadata(t.path().join("vias/proyectos.json")).unwrap().modified().unwrap(), antes_proy, "proyectos.json de Vías no cambió");
}

#[test]
fn proyecto_nuevo_del_celular_recibe_su_carpeta() {
    let (t, c) = escenario();
    let mut datos = c.leer(false).unwrap();
    datos["proyectos"].as_array_mut().unwrap().push(json!({"id": "proyecto_003", "titulo": "Puentes: diseño/2026"}));
    c.escribir(&json!({"proyectos": datos["proyectos"]}), &json!({})).unwrap();
    let dir = t.path().join("Documentos/Canvas de Citas").join(nombre_seguro("Puentes: diseño/2026"));
    assert_eq!(ids(&leer(&dir, "proyectos")), ["proyecto_003"]);
    let reg: Value = serde_json::from_slice(&fs::read(t.path().join("proyectos-abiertos.json")).unwrap()).unwrap();
    assert_eq!(reg.as_array().unwrap().len(), 3);
    assert_eq!(reg[2]["proyectos"], json!(["proyecto_003"]));
    // Y ya no está en la tesis ni en Vías.
    assert_eq!(ids(&leer(&t.path().join("tesis"), "proyectos")), ["proyecto_001"]);
}

#[test]
fn no_sincronizar_excluye_y_no_se_borra_nada() {
    let (t, c) = escenario();
    let mut reg: Value = serde_json::from_slice(&fs::read(t.path().join("proyectos-abiertos.json")).unwrap()).unwrap();
    reg[1]["sincronizar"] = json!(false);
    c.guardar_registro(&reg).unwrap();
    let v = c.leer(false).unwrap();
    assert_eq!(ids(&v["proyectos"]), ["proyecto_001"]);
    assert_eq!(ids(&v["citas"]), ["cita_001"]);
    // El celular manda un proyecto 2 cambiado y además "borra" su cita: se ignora todo eso.
    c.escribir(&json!({"proyectos": [{"id": "proyecto_001", "titulo": "Tesis"}, {"id": "proyecto_002", "titulo": "Pisado"}]}), &json!({"citas": ["cita_002"], "proyectos": ["proyecto_002"]})).unwrap();
    assert_eq!(leer(&t.path().join("vias"), "proyectos")[0]["titulo"], "Vías");
    assert!(!t.path().join("tesis/eliminados.json").exists(), "no se anota como borrado nada de un proyecto sin sincronizar");
    assert!(!t.path().join("vias/eliminados.json").exists());
}

#[test]
fn documentos_a_las_carpetas_que_les_tocan() {
    let (t, c) = escenario();
    assert_eq!(c.leer_doc("fuentes/fuente_001/documento.pdf").unwrap().unwrap(), b"%PDF-a");
    assert!(c.leer_doc("../proyectos.json").is_err());
    // Documento de la fuente compartida: a las dos carpetas.
    c.escribir_doc("fuentes/fuente_001/documento.pdf", b"%PDF-nuevo").unwrap().unwrap();
    assert_eq!(fs::read(t.path().join("vias/fuentes/fuente_001/documento.pdf")).unwrap(), b"%PDF-nuevo");
    assert_eq!(fs::read(t.path().join("tesis/fuentes/fuente_001/documento.pdf")).unwrap(), b"%PDF-nuevo");
    // Original de foto de nadie todavía: a la biblioteca.
    c.escribir_doc("fotos/foto_nueva.png", b"PNG").unwrap().unwrap();
    assert_eq!(fs::read(t.path().join("tesis/fotos/foto_nueva.png")).unwrap(), b"PNG");
}

#[test]
fn apk_viejo_sincroniza_con_el_servidor_multicarpeta() {
    let (t, c) = escenario();
    let (clave, clave_b64) = Clave::nueva();
    let s = Sincro { carpeta: Box::new(c), clave, clave_b64, puerto: 47481, tope: 1 << 24, puente: None };
    let prueba = |url: &str| s.clave.cifrar_json(&json!({ "ruta": url }));
    // v2 sin "capacidades": igual que el APK de hoy.
    let pedido = s.clave.cifrar_json(&json!({"dispositivo": "cel1", "nombre": "Celular", "base": null}));
    let r = s.atender("POST", "/sync/v2/leer", Some(&prueba("/sync/v2/leer")), pedido.as_bytes(), false);
    assert_eq!(r.estado, 200);
    let v = s.clave.descifrar_json(std::str::from_utf8(&r.cuerpo).unwrap()).unwrap();
    assert_eq!(v["modo"], "completo");
    assert_eq!(ids(&v["datos"]["proyectos"]), ["proyecto_001", "proyecto_002"]);
    assert!(v["docs"].as_array().unwrap().iter().all(|d| !d["ruta"].as_str().unwrap().starts_with("fotos/")), "un APK viejo no ve fotos/");
    // Envía todo con un cambio en cada proyecto.
    let mut datos = v["datos"].clone();
    datos["proyectos"][0]["titulo"] = json!("Tesis (cel)");
    datos["proyectos"][1]["titulo"] = json!("Vías (cel)");
    let envio = s.clave.cifrar_json(&json!({"dispositivo": "cel1", "etiqueta": v["etiqueta"], "datos": datos, "eliminados": {}}));
    let w = s.atender("POST", "/sync/v2/escribir", Some(&prueba("/sync/v2/escribir")), envio.as_bytes(), false);
    assert_eq!(w.estado, 200);
    assert_eq!(leer(&t.path().join("tesis"), "proyectos")[0]["titulo"], "Tesis (cel)");
    assert_eq!(leer(&t.path().join("vias"), "proyectos")[0]["titulo"], "Vías (cel)");
    // Con la capacidad "fotos", los originales también se listan.
    let pedido2 = s.clave.cifrar_json(&json!({"dispositivo": "cel2", "nombre": "Nuevo", "base": null, "capacidades": ["fotos"]}));
    let r2 = s.atender("POST", "/sync/v2/leer", Some(&prueba("/sync/v2/leer")), pedido2.as_bytes(), false);
    let v2 = s.clave.descifrar_json(std::str::from_utf8(&r2.cuerpo).unwrap()).unwrap();
    assert!(v2["docs"].as_array().unwrap().iter().any(|d| d["ruta"] == "fotos/foto_x.jpg"));
}
