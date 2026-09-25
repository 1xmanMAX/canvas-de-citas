// receptor/sincro/tests/cifrado.rs
use base64::{engine::general_purpose::STANDARD, Engine};
use canvas_sincro::cifrado::{Clave, ErrorCifrado, EDAD_MAX_MS};

fn vector() -> serde_json::Value {
    let ruta = concat!(env!("CARGO_MANIFEST_DIR"), "/../../app/tests/vectores/cifrado.json");
    serde_json::from_str(&std::fs::read_to_string(ruta).expect("falta el vector (Tarea 2)")).unwrap()
}

#[test]
fn cifra_igual_que_javascript() {
    let v = vector();
    let clave = Clave::desde_base64(v["clave"].as_str().unwrap()).unwrap();
    let iv: [u8; 12] = STANDARD.decode(v["iv"].as_str().unwrap()).unwrap().try_into().unwrap();
    let ahora = v["ahora"].as_u64().unwrap();
    let sobre = clave.cifrar_con(v["texto"].as_str().unwrap().as_bytes(), iv, ahora);
    assert_eq!(STANDARD.encode(&sobre), v["sobre"].as_str().unwrap());
    let plano = clave.descifrar_en(&sobre, ahora).unwrap();
    assert_eq!(String::from_utf8(plano).unwrap(), v["texto"].as_str().unwrap());
}

#[test]
fn ida_y_vuelta_json() {
    let (clave, _) = Clave::nueva();
    let v = serde_json::json!({"a": 1, "b": "ñ"});
    assert_eq!(clave.descifrar_json(&clave.cifrar_json(&v)).unwrap(), v);
}

#[test]
fn rechaza_clave_ajena_alterado_y_vencido() {
    let (k1, _) = Clave::nueva();
    let (k2, _) = Clave::nueva();
    let mut sobre = k1.cifrar(b"hola");
    assert_eq!(k2.descifrar(&sobre), Err(ErrorCifrado::Alterado));
    let ultimo = sobre.len() - 1;
    sobre[ultimo] ^= 1;
    assert_eq!(k1.descifrar(&sobre), Err(ErrorCifrado::Alterado));
    let viejo = k1.cifrar_con(b"hola", [0; 12], 1_000);
    assert_eq!(k1.descifrar_en(&viejo, 1_000 + EDAD_MAX_MS + 1), Err(ErrorCifrado::Vencido));
    assert_eq!(Clave::desde_base64("AAAA").err(), Some(ErrorCifrado::Clave));
}
