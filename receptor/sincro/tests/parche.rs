use canvas_sincro::parche::{aplicar, canonico, diferencias, huella, ParcheAjeno};
use serde_json::json;

fn vector() -> Vec<serde_json::Value> {
    let ruta = concat!(env!("CARGO_MANIFEST_DIR"), "/../../app/tests/vectores/parche.json");
    serde_json::from_str(&std::fs::read_to_string(ruta).expect("falta el vector de parches")).unwrap()
}

#[test]
fn calcula_y_aplica_igual_que_javascript() {
    for c in vector() {
        let nombre = c["nombre"].as_str().unwrap();
        let ops = diferencias(&c["a"], &c["b"]);
        assert_eq!(serde_json::Value::Array(ops.clone()), c["ops"], "diferencias: {nombre}");
        let mut a = c["a"].clone();
        aplicar(&mut a, c["ops"].as_array().unwrap()).unwrap();
        assert_eq!(a, c["b"], "aplicar: {nombre}");
        assert_eq!(canonico(&c["b"]), c["canonico"].as_str().unwrap(), "canónico: {nombre}");
        assert_eq!(huella(&c["b"]), c["huella"].as_str().unwrap(), "huella: {nombre}");
    }
}

#[test]
fn rechaza_un_parche_de_otra_version() {
    let mut a = json!({"fuentes": []});
    assert_eq!(aplicar(&mut a, &[json!({"r": ["fuentes", {"id": "f1"}, "anio"], "v": 1})]), Err(ParcheAjeno));
}
