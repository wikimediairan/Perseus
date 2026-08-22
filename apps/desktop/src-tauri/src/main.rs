// Entry point binary. Delegates immediately to the library target so the
// same `run()` can also be invoked from mobile targets in the future
// (Tauri convention) — see lib.rs for the actual application setup.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    perseus_lib::run();
}
