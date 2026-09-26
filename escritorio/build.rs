// Ícono del exe (recurso 1): el del Explorador, la barra de tareas y la ventana.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut r = winresource::WindowsResource::new();
        r.set_icon_with_id("../app/public/icon.ico", "1");
        r.set("FileDescription", "Canvas de Citas");
        r.set("ProductName", "Canvas de Citas");
        r.compile().expect("recursos de Windows");
    }
}
