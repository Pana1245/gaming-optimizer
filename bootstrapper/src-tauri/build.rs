fn main() {
    // Enlazar el runtime de VC++ estático. tauri-build sólo lo hace con
    // STATIC_VCRUNTIME=true (la CLI de Tauri lo pone; este exe se compila con
    // `cargo build` pelado). Sin esto el instalador importa VCRUNTIME140.dll y no
    // abre en un Windows recién instalado sin el redistributable.
    std::env::set_var("STATIC_VCRUNTIME", "true");
    tauri_build::build()
}
