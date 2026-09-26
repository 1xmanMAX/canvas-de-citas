// receptor/sincro/tests/reparto.rs — mismos vectores que app/tests/unit/reparto.test.js
use canvas_sincro::reparto::{docs_de, repartir, CarpetaReg};
use serde_json::{json, Value};

fn ids(v: &Value) -> Vec<String> {
    v.as_array().unwrap().iter().map(|x| x["id"].as_str().unwrap().to_string()).collect()
}

#[test]
fn vectores_compartidos_con_la_app() {
    let texto = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../app/tests/vectores/reparto.json")).unwrap();
    let vectores: Value = serde_json::from_str(&texto).unwrap();
    for v in vectores.as_array().unwrap() {
        let carpetas: Vec<CarpetaReg> = v["carpetas"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| CarpetaReg {
                clave: c["clave"].as_str().unwrap().into(),
                proyectos: c["proyectos"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().into()).collect(),
                biblioteca: c["biblioteca"].as_bool().unwrap(),
            })
            .collect();
        let partes = repartir(&v["datos"], &carpetas);
        let esperado = v["esperado"].as_object().unwrap();
        assert_eq!(partes.len(), carpetas.len(), "{}", v["nombre"]);
        for (c, parte) in carpetas.iter().zip(&partes) {
            let e = &esperado[&c.clave];
            for col in ["proyectos", "fuentes", "citas"] {
                let esperados: Vec<String> = e[col].as_array().unwrap().iter().map(|x| x.as_str().unwrap().into()).collect();
                assert_eq!(ids(&parte[col]), esperados, "{} / {} / {}", v["nombre"], c.clave, col);
            }
        }
    }
}

#[test]
fn documentos_de_fuentes_y_originales_de_fotos() {
    let parte = json!({
        "proyectos": [{"id": "p", "canvas": {"fotos": [{"id": "foto_a", "original": "fotos/foto_a.jpg"}, {"id": "foto_b"}],
            "objetivos": {"oe1": {"fotos": [{"id": "foto_c", "original": "fotos/foto_c.png"}]}}}}],
        "fuentes": [{"id": "fuente_001", "documento_original": "fuentes/fuente_001/documento.pdf"}, {"id": "fuente_002", "documento_original": null}],
        "citas": []
    });
    let mut d = docs_de(&parte);
    d.sort();
    assert_eq!(d, vec!["fotos/foto_a.jpg", "fotos/foto_c.png", "fuentes/fuente_001/documento.pdf"]);
}
