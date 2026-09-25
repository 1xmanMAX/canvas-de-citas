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
