fn main() {
    println!("cargo:rerun-if-changed=../ui/index.html");
    println!("cargo:rerun-if-changed=../ui/app.js");
    println!("cargo:rerun-if-changed=../ui/style.css");
    println!("cargo:rerun-if-changed=../ui/sw.js");
    println!("cargo:rerun-if-changed=../ui");
    tauri_build::build();
}
