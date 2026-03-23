use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter,
};

// ── Managed state ────────────────────────────────────────────────────────────

struct InitialFileContent(Mutex<Option<String>>);

// ── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Called once by the frontend on startup.
/// Returns the raw JSON string of the .mty file that was double-clicked,
/// or null if the app was launched normally (no file argument).
#[tauri::command]
fn get_initial_file_content(state: tauri::State<'_, InitialFileContent>) -> Option<String> {
    state.0.lock().unwrap().take()
}

// ── Menu builders ─────────────────────────────────────────────────────────────

fn build_file_menu(app: &tauri::App) -> tauri::Result<Submenu<tauri::Wry>> {
    let new_project = MenuItem::with_id(app, "menu-new",    "New Project", true, None::<&str>)?;
    let open        = MenuItem::with_id(app, "menu-open",   "Open…",       true, None::<&str>)?;
    let save        = MenuItem::with_id(app, "menu-save",   "Save",        true, Some("CmdOrCtrl+S"))?;
    let export      = MenuItem::with_id(app, "menu-export", "Export .mty", true, None::<&str>)?;
    Submenu::with_items(app, "File", true, &[&new_project, &open, &save, &export])
}

fn build_edit_menu(app: &tauri::App) -> tauri::Result<Submenu<tauri::Wry>> {
    let undo  = MenuItem::with_id(app, "menu-undo", "Undo", true, Some("CmdOrCtrl+Z"))?;
    let redo  = MenuItem::with_id(app, "menu-redo", "Redo", true, Some("CmdOrCtrl+Shift+Z"))?;
    let sep   = PredefinedMenuItem::separator(app)?;
    let cut   = PredefinedMenuItem::cut(app, None)?;
    let copy  = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    Submenu::with_items(app, "Edit", true, &[&undo, &redo, &sep, &cut, &copy, &paste])
}

fn build_window_menu(app: &tauri::App) -> tauri::Result<Submenu<tauri::Wry>> {
    Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )
}

// ── macOS: App menu + full menu bar ──────────────────────────────────────────

#[cfg(target_os = "macos")]
fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    let app_menu = Submenu::with_items(
        app,
        "R6 Tactical Studio",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_menu   = build_file_menu(app)?;
    let edit_menu   = build_edit_menu(app)?;
    let window_menu = build_window_menu(app)?;
    let help_menu   = Submenu::with_items(app, "Help", true, &[])?;

    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu, &help_menu])
}

// ── Windows / Linux: no App menu ─────────────────────────────────────────────

#[cfg(not(target_os = "macos"))]
fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    let file_menu   = build_file_menu(app)?;
    let edit_menu   = build_edit_menu(app)?;
    let window_menu = build_window_menu(app)?;
    let help_menu   = Submenu::with_items(app, "Help", true, &[])?;

    Menu::with_items(app, &[&file_menu, &edit_menu, &window_menu, &help_menu])
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Read any file path passed as the first CLI argument (file-association double-click).
    // args[0] is the binary; args[1] is the file path on both macOS and Windows.
    let initial_content = std::env::args()
        .nth(1)
        .filter(|p| p.ends_with(".mty"))
        .and_then(|path| std::fs::read_to_string(&path).ok());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(InitialFileContent(Mutex::new(initial_content)))
        .setup(|app| {
            let menu = build_menu(app)?;
            app.set_menu(menu)?;
            // Forward every menu-item click to the frontend as a plain event string.
            app.on_menu_event(|app_handle, event| {
                let _ = app_handle.emit(event.id().as_ref(), ());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, get_initial_file_content])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
