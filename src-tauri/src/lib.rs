// Perseus — Tauri application shell (library target).
//
// Hosts the desktop window and the platform plugins the core TypeScript
// engine depends on for local file I/O, the native save dialog,
// clipboard access (core/input, core/output, core/config), and opening
// the GitHub Releases page in the user's default browser
// (src/hooks/useUpdateChecker.ts). All actual pipeline logic — Parsoid,
// Wikidata, LLM translation, Wikitext generation — lives in the
// TypeScript core engine (`../core`) and talks to the network directly
// via `fetch`; nothing here proxies or implements that logic in Rust.

// use tauri::menu::{MenuBuilder, SubmenuBuilder};
// use tauri::Emitter;

// use tauri::menu::{Menu, MenuItem};

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![ping])
        // .setup(|app| {
        //     let file_menu = SubmenuBuilder::new(app, "File")
        //         .text("open_session", "Open Session")
        //         .text("save_session", "Save Session")
        //         .build()?;
        //     let menu = MenuBuilder::new(app).item(&file_menu).build()?;
        //     app.set_menu(menu)?;
        //     app.on_menu_event(|app, event| match event.id().as_ref() {
        //         "open_session" => {
        //             let _ = app.emit("menu://open-session", ());
        //         }
        //         "save_session" => {
        //             let _ = app.emit("menu://save-session", ());
        //         }
        //         _ => {}
        //     });
        //     Ok(())
        // })
        .run(tauri::generate_context!())
        .expect("error while running the Perseus Tauri application");
}
