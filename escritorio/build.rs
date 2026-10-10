// Ícono del exe (recurso 1) y la app incluida: cada archivo de `app/dist` va dentro del exe
// (src/main.rs los sirve en https://canvas.localhost/, sin internet). Antes: `npm run build` en app/.
use std::fmt::Write as _;
use std::path::Path;

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut r = winresource::WindowsResource::new();
        r.set_icon_with_id("../app/public/icon.ico", "1");
        r.set("FileDescription", "Canvas de Citas");
        r.set("ProductName", "Canvas de Citas");
        r.compile().expect("recursos de Windows");
    }

    let dist = Path::new(env!("CARGO_MANIFEST_DIR")).join("../app/dist");
    println!("cargo:rerun-if-changed={}", dist.display());
    if !dist.join("index.html").exists() {
        panic!("Falta app/dist: ejecuta `npm run build` en app/ antes de compilar el exe");
    }
    let mut archivos = Vec::new();
    juntar(&dist, &dist, &mut archivos);
    archivos.sort();
    let mut s = String::from("/// Archivos de app/dist: (ruta, contenido).\npub static ARCHIVOS: &[(&str, &[u8])] = &[\n");
    for (ruta, abs) in &archivos {
        println!("cargo:rerun-if-changed={abs}");
        writeln!(s, "    ({ruta:?}, include_bytes!({abs:?})),").unwrap();
    }
    s.push_str("];\n");
    std::fs::write(Path::new(&std::env::var("OUT_DIR").unwrap()).join("app.rs"), s).unwrap();
}

fn juntar(raiz: &Path, dir: &Path, out: &mut Vec<(String, String)>) {
    for e in std::fs::read_dir(dir).unwrap().flatten() {
        let p = e.path();
        if p.is_dir() {
            juntar(raiz, &p, out);
        } else if !p.extension().is_some_and(|x| x == "map") {
            let ruta = p.strip_prefix(raiz).unwrap().to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
            out.push((ruta, p.to_string_lossy().into_owned()));
        }
    }
}
