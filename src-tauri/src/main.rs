// Prevención de apertura de consola de comandos en ejecutable de producción Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    screenhub_client::run();
}
