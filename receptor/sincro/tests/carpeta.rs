// receptor/sincro/tests/carpeta.rs
use canvas_sincro::carpeta::Carpeta;
use serde_json::json;
use std::fs;

fn con_datos() -> (tempfile::TempDir, Carpeta) {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("fuentes.json"), "{\n  \"fuentes\": [\n    {\n      \"id\": \"fuente_001\",\n      \"titulo\": \"A\"\n    }\n  ]\n}\n").unwrap();
    fs::create_dir_all(dir.path().join("fuentes/fuente_001")).unwrap();
    fs::write(dir.path().join("fuentes/fuente_001/documento.pdf"), b"%PDF-1.4 prueba").unwrap();
    fs::write(dir.path().join("fuentes/fuente_001/texto.md"), b"no es documento").unwrap();
    let c = Carpeta::nueva(dir.path());
    (dir, c)
}

#[test]
fn lee_colecciones_documentos_y_etiqueta() {
    let (_d, c) = con_datos();
    let v = c.leer().unwrap();
    assert_eq!(v["fuentes"][0]["id"], "fuente_001");
    assert_eq!(v["proyectos"], json!([]));
    assert_eq!(v["docs"], json!([{"ruta": "fuentes/fuente_001/documento.pdf", "bytes": 15}]));
    assert_eq!(v["etiqueta"].as_str().unwrap().len(), 64);
}

#[test]
fn escribe_con_el_formato_de_la_app_y_cambia_la_etiqueta() {
    let (d, c) = con_datos();
    let antes = c.etiqueta();
    c.escribir(&json!({"fuentes": [{"id": "fuente_002", "titulo": "B", "anio": 2020}]}), &json!({})).unwrap();
    let txt = fs::read_to_string(d.path().join("fuentes.json")).unwrap();
    assert_eq!(txt, "{\n  \"fuentes\": [\n    {\n      \"id\": \"fuente_002\",\n      \"titulo\": \"B\",\n      \"anio\": 2020\n    }\n  ]\n}\n");
    assert_ne!(c.etiqueta(), antes);
    assert!(!d.path().join("proyectos.json").exists(), "solo escribe las colecciones enviadas");
}

#[test]
fn acumula_eliminados_sin_repetir() {
    let (d, c) = con_datos();
    c.escribir(&json!({}), &json!({"fuentes": ["fuente_009"], "citas": []})).unwrap();
    c.escribir(&json!({}), &json!({"fuentes": ["fuente_009", "fuente_010"]})).unwrap();
    let e: serde_json::Value = serde_json::from_str(&fs::read_to_string(d.path().join("eliminados.json")).unwrap()).unwrap();
    assert_eq!(e, json!({"fuentes": ["fuente_009", "fuente_010"]}));
}

#[test]
fn solo_acepta_rutas_de_documentos_dentro_de_la_carpeta() {
    let (d, c) = con_datos();
    assert_eq!(c.ruta_segura("fuentes/fuente_001/documento.pdf"), Some(d.path().join("fuentes").join("fuente_001").join("documento.pdf")));
    for mala in ["../x/documento.pdf", "fuentes/../../documento.pdf", "/etc/passwd", "fuentes/fuente_001/texto.md", "fuentes/a/b/documento.pdf", "fuentes/fuente_001/documento.", "C:\\x\\documento.pdf"] {
        assert_eq!(c.ruta_segura(mala), None, "{mala}");
    }
}
