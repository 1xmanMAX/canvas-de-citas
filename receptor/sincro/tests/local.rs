// receptor/sincro/tests/local.rs — puente de archivos de la app de Windows (/local/*)
use canvas_sincro::carpetas::Carpetas;
use canvas_sincro::local::{relativa_segura, Puente};
use serde_json::{json, Value};
use std::fs;

fn puente() -> (tempfile::TempDir, Puente, String) {
    let t = tempfile::tempdir().unwrap();
    let tesis = t.path().join("tesis");
    fs::create_dir_all(&tesis).unwrap();
    fs::write(tesis.join("proyectos.json"), "{\"proyectos\":[]}\n").unwrap();
    let registro = t.path().join("proyectos-abiertos.json");
    fs::write(&registro, json!([{"clave": "a", "carpeta": tesis, "proyectos": [], "biblioteca": true}]).to_string()).unwrap();
    let c = Carpetas::nueva(&registro, t.path().join("estado"), t.path().join("nuevos"));
    let p = Puente::nuevo("secreto".into(), c, "canvas-sync://1.2.3.4:47481/#clave".into());
    let enc = |s: &str| s.replace('\\', "%5C").replace(':', "%3A").replace(' ', "%20");
    let q = enc(&tesis.to_string_lossy());
    (t, p, q)
}

#[test]
fn sin_token_o_desde_otra_maquina_responde_403() {
    let (_t, p, q) = puente();
    let url = format!("/local/leer?carpeta={q}&ruta=proyectos.json");
    assert_eq!(p.atender("GET", &url, None, b"", true).estado, 403);
    assert_eq!(p.atender("GET", &url, Some("otro"), b"", true).estado, 403);
    assert_eq!(p.atender("GET", &url, Some("secreto"), b"", false).estado, 403);
    assert_eq!(p.atender("GET", &url, Some("secreto"), b"", true).estado, 200);
}

#[test]
fn leer_escribir_y_borrar_dentro_de_la_carpeta() {
    let (t, p, q) = puente();
    let r = p.atender("PUT", &format!("/local/escribir?carpeta={q}&ruta=fuentes/fuente_001/documento.pdf"), Some("secreto"), b"%PDF", true);
    assert_eq!(r.estado, 200);
    assert_eq!(fs::read(t.path().join("tesis/fuentes/fuente_001/documento.pdf")).unwrap(), b"%PDF");
    let r = p.atender("GET", &format!("/local/leer?carpeta={q}&ruta=fuentes/fuente_001/documento.pdf"), Some("secreto"), b"", true);
    assert_eq!(r.cuerpo, b"%PDF");
    assert!(r.cabeceras.iter().any(|(k, v)| *k == "X-Modificado" && v.parse::<u64>().unwrap() > 0));
    assert_eq!(p.atender("GET", &format!("/local/leer?carpeta={q}&ruta=no.json"), Some("secreto"), b"", true).estado, 404);
    assert_eq!(p.atender("POST", &format!("/local/borrar?carpeta={q}&ruta=fuentes/fuente_001/documento.pdf"), Some("secreto"), b"", true).estado, 200);
    assert!(!t.path().join("tesis/fuentes/fuente_001/documento.pdf").exists());
}

#[test]
fn nunca_fuera_de_la_carpeta_ni_en_carpetas_no_registradas() {
    let (t, p, q) = puente();
    for mala in ["../x.json", "a/../../x", "C:/x", "/x", "a\\..\\x", ""] {
        assert!(relativa_segura(mala).is_none(), "{mala}");
        let r = p.atender("PUT", &format!("/local/escribir?carpeta={q}&ruta={}", mala.replace('\\', "%5C")), Some("secreto"), b"x", true);
        assert_eq!(r.estado, 400, "{mala}");
    }
    let otra = t.path().join("otra").to_string_lossy().replace('\\', "%5C").replace(':', "%3A");
    assert_eq!(p.atender("PUT", &format!("/local/escribir?carpeta={otra}&ruta=a.json"), Some("secreto"), b"x", true).estado, 403);
    assert!(!t.path().join("otra/a.json").exists());
    assert_eq!(p.atender("GET", "/local/leer?carpeta=relativa&ruta=a.json", Some("secreto"), b"", true).estado, 400);
}

#[test]
fn crear_subcarpeta_y_registrarla() {
    let (t, p, q) = puente();
    let r = p.atender("POST", &format!("/local/crear-subcarpeta?carpeta={q}&nombre=V%C3%ADas%3A%20urbanas"), Some("secreto"), b"", true);
    assert_eq!(r.estado, 200);
    let v: Value = serde_json::from_slice(&r.cuerpo).unwrap();
    assert_eq!(v["nombre"], "Vías urbanas");
    let nueva = v["ruta"].as_str().unwrap().to_string();
    assert!(std::path::Path::new(&nueva).is_dir());
    // La recién creada ya se puede usar y registrar.
    let reg = json!([{"clave": "a", "carpeta": t.path().join("tesis"), "proyectos": [], "biblioteca": true}, {"clave": "b", "carpeta": nueva, "proyectos": ["proyecto_002"], "biblioteca": false}]);
    assert_eq!(p.atender("PUT", "/local/registro", Some("secreto"), reg.to_string().as_bytes(), true).estado, 200);
    let r = p.atender("GET", "/local/registro", Some("secreto"), b"", true);
    let v: Value = serde_json::from_slice(&r.cuerpo).unwrap();
    assert_eq!(v[1]["proyectos"], json!(["proyecto_002"]));
    // Un registro con una carpeta que nunca se eligió no se acepta.
    let malo = json!([{"clave": "x", "carpeta": t.path().join("cualquiera"), "proyectos": []}]);
    assert_eq!(p.atender("PUT", "/local/registro", Some("secreto"), malo.to_string().as_bytes(), true).estado, 403);
}

#[test]
fn emparejar_da_el_codigo_y_su_qr() {
    let (_t, p, _q) = puente();
    let r = p.atender("GET", "/local/emparejar", Some("secreto"), b"", true);
    let v: Value = serde_json::from_slice(&r.cuerpo).unwrap();
    assert_eq!(v["codigo"], "canvas-sync://1.2.3.4:47481/#clave");
    assert!(v["qr"].as_str().unwrap().starts_with("<?xml") || v["qr"].as_str().unwrap().contains("<svg"));
}
