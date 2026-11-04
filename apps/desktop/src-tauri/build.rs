fn main() {
    // The target triple, so a debug build finds the Node the stage script
    // fetched for it (`binaries/node-<triple>`).
    println!(
        "cargo:rustc-env=ODDBORO_TARGET={}",
        std::env::var("TARGET").unwrap_or_default()
    );
    tauri_build::build()
}
