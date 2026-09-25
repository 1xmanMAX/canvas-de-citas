// receptor/sincro/tests/servidor.rs
use canvas_sincro::carpeta::Carpeta;
use canvas_sincro::cifrado::Clave;
use canvas_sincro::servidor::Sincro;
use serde_json::json;

fn sincro(tope: usize) -> (tempfile::TempDir, Sincro) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("fuentes.json"), "{\"fuentes\":[{\"id\":\"fuente_001\"}]}").unwrap();
    let (clave, clave_b64) = Clave::nueva();
    let s = Sincro { carpeta: Carpeta::nueva(dir.path()), clave, clave_b64, puerto: 47481, tope };
    (dir, s)
}
fn prueba(s: &Sincro, url: &str) -> String {
    s.clave.cifrar_json(&json!({ "ruta": url }))
}
fn leer(s: &Sincro, r: &canvas_sincro::servidor::Respuesta) -> serde_json::Value {
    s.clave.descifrar_json(std::str::from_utf8(&r.cuerpo).unwrap()).unwrap()
}

#[test]
fn sin_prueba_o_con_otra_clave_responde_401() {
    let (_d, s) = sincro(1 << 20);
    assert_eq!(s.atender("GET", "/sync/estado", None, b"", false).estado, 401);
    let (otra, _) = Clave::nueva();
    let falsa = otra.cifrar_json(&json!({"ruta": "/sync/estado"}));
    assert_eq!(s.atender("GET", "/sync/estado", Some(&falsa), b"", false).estado, 401);
    // Una prueba válida para otra ruta tampoco sirve.
    assert_eq!(s.atender("GET", "/sync/estado", Some(&prueba(&s, "/sync/doc?ruta=x")), b"", false).estado, 401);
}

#[test]
fn estado_y_guardado_con_control_de_version() {
    let (d, s) = sincro(1 << 20);
    let r = s.atender("GET", "/sync/estado", Some(&prueba(&s, "/sync/estado")), b"", false);
    assert_eq!(r.estado, 200);
    let estado = leer(&s, &r);
    assert_eq!(estado["fuentes"][0]["id"], "fuente_001");
    let etiqueta = estado["etiqueta"].as_str().unwrap().to_string();

    let cuerpo = s.clave.cifrar_json(&json!({"etiqueta": etiqueta, "fuentes": [{"id": "fuente_002"}], "eliminados": {"fuentes": ["fuente_001"]}}));
    let r = s.atender("PUT", "/sync/estado", Some(&prueba(&s, "/sync/estado")), cuerpo.as_bytes(), false);
    assert_eq!(r.estado, 200);
    assert!(std::fs::read_to_string(d.path().join("fuentes.json")).unwrap().contains("fuente_002"));
    assert!(std::fs::read_to_string(d.path().join("eliminados.json")).unwrap().contains("fuente_001"));

    // Con la etiqueta vieja (la PC cambió entre medio): 409 y nada se escribe.
    let viejo = s.clave.cifrar_json(&json!({"etiqueta": etiqueta, "fuentes": []}));
    assert_eq!(s.atender("PUT", "/sync/estado", Some(&prueba(&s, "/sync/estado")), viejo.as_bytes(), false).estado, 409);
    assert!(std::fs::read_to_string(d.path().join("fuentes.json")).unwrap().contains("fuente_002"));
}

#[test]
fn documentos_ida_y_vuelta_y_rutas_invalidas() {
    let (_d, s) = sincro(1 << 20);
    let url = "/sync/doc?ruta=fuentes%2Ffuente_001%2Fdocumento.pdf";
    let r = s.atender("PUT", url, Some(&prueba(&s, url)), &s.clave.cifrar(b"%PDF-1.4 hola"), false);
    assert_eq!(r.estado, 200);
    let r = s.atender("GET", url, Some(&prueba(&s, url)), b"", false);
    assert_eq!(r.estado, 200);
    assert_eq!(s.clave.descifrar(&r.cuerpo).unwrap(), b"%PDF-1.4 hola");
    let malo = "/sync/doc?ruta=..%2F..%2Fsecreto.txt";
    assert_eq!(s.atender("GET", malo, Some(&prueba(&s, malo)), b"", false).estado, 400);
}

#[test]
fn emparejar_solo_desde_la_misma_pc_y_tope_de_cuerpo() {
    let (_d, s) = sincro(64);
    assert_eq!(s.atender("GET", "/sync/emparejar", None, b"", false).estado, 403);
    let r = s.atender("GET", "/sync/emparejar", None, b"", true);
    assert_eq!(r.estado, 200);
    let v: serde_json::Value = serde_json::from_slice(&r.cuerpo).unwrap();
    assert!(v["codigo"].as_str().unwrap().starts_with("canvas-sync://"));
    assert!(v["codigo"].as_str().unwrap().ends_with(&s.clave_b64));
    assert_eq!(s.atender("PUT", "/sync/estado", None, &[0u8; 65], false).estado, 413);
}

#[test]
fn hola_confirma_la_clave() {
    let (_d, s) = sincro(1 << 20);
    assert_eq!(s.atender("GET", "/sync/hola", None, b"", false).estado, 401);
    let r = s.atender("GET", "/sync/hola", Some(&prueba(&s, "/sync/hola")), b"", false);
    assert_eq!(r.estado, 200);
    assert_eq!(leer(&s, &r), json!({"app": "canvas-sincro", "v": 1}));
}

// --- v2: grupo de sincronización con parches ---

fn pedir(s: &Sincro, ruta: &str, cuerpo: serde_json::Value) -> (u16, serde_json::Value) {
    let r = s.atender("POST", ruta, Some(&prueba(s, ruta)), s.clave.cifrar_json(&cuerpo).as_bytes(), false);
    let v = if r.cuerpo.is_empty() { json!(null) } else { s.clave.descifrar_json(std::str::from_utf8(&r.cuerpo).unwrap()).unwrap_or(json!(null)) };
    (r.estado, v)
}

#[test]
fn v2_primero_todo_luego_solo_lo_que_cambio() {
    let (d, s) = sincro(1 << 20);
    // Primera vez: sin base común → todo.
    let (e, r) = pedir(&s, "/sync/v2/leer", json!({"dispositivo": "cel1", "nombre": "Celular", "base": null}));
    assert_eq!(e, 200);
    assert_eq!(r["modo"], "completo");
    let datos = r["datos"].clone();
    assert_eq!(datos["fuentes"][0]["id"], "fuente_001");

    // El aparato agrega una cita y lo envía como parche.
    let mut nuevo = datos.clone();
    nuevo["citas"] = json!([{"id": "cita_001", "texto": "hola"}]);
    let ops = canvas_sincro::parche::diferencias(&datos, &nuevo);
    let huella = canvas_sincro::parche::huella(&nuevo);
    let (e, w) = pedir(&s, "/sync/v2/escribir", json!({"dispositivo": "cel1", "etiqueta": r["etiqueta"], "parche": ops, "huella": huella}));
    assert_eq!(e, 200);
    assert_eq!(w["huella"], huella.as_str());
    assert_eq!(w["escritas"], json!(["citas"]), "solo reescribe la colección tocada");
    assert!(std::fs::read_to_string(d.path().join("citas.json")).unwrap().contains("cita_001"));
    assert!(!d.path().join("proyectos.json").exists());

    // La PC cambia algo por su cuenta (la app de Comet o la skill).
    std::fs::write(d.path().join("fuentes.json"), "{\"fuentes\":[{\"id\":\"fuente_001\",\"titulo\":\"Nuevo\"}]}").unwrap();
    let (_, r2) = pedir(&s, "/sync/v2/leer", json!({"dispositivo": "cel1", "base": huella}));
    assert_eq!(r2["modo"], "parche");
    assert_eq!(r2["parche"], json!([{"r": ["fuentes", {"id": "fuente_001"}, "titulo"], "v": "Nuevo"}]));
    // El grupo recuerda el aparato y su nombre.
    assert_eq!(r2["grupo"][0]["id"], "cel1");
    assert_eq!(r2["grupo"][0]["nombre"], "Celular");
    assert!(r2["grupo"][0]["sincronizado"].is_u64());
}

#[test]
fn v2_otra_base_o_etiqueta_vieja() {
    let (_d, s) = sincro(1 << 20);
    let (_, r) = pedir(&s, "/sync/v2/leer", json!({"dispositivo": "lap", "base": "no-coincide"}));
    assert_eq!(r["modo"], "completo");
    let (e, _) = pedir(&s, "/sync/v2/escribir", json!({"dispositivo": "lap", "etiqueta": "vieja", "parche": []}));
    assert_eq!(e, 409);
    // Parche sobre algo que no existe o huella distinta: 422 y nada se escribe.
    let (e, _) = pedir(&s, "/sync/v2/escribir", json!({"dispositivo": "lap", "etiqueta": r["etiqueta"], "parche": [{"r": ["fuentes", {"id": "no"}, "x"], "v": 1}]}));
    assert_eq!(e, 422);
    let (e, _) = pedir(&s, "/sync/v2/escribir", json!({"dispositivo": "lap", "etiqueta": r["etiqueta"], "parche": [], "huella": "otra"}));
    assert_eq!(e, 422);
    // Ids de aparato raros: 400.
    let (e, _) = pedir(&s, "/sync/v2/leer", json!({"dispositivo": "../x"}));
    assert_eq!(e, 400);
}
