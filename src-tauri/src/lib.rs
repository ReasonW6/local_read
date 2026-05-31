mod commands;
mod models;
pub mod paths;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dirs = paths::RuntimeDirs::from_app_handle(app.handle())
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            app.manage(commands::AppState::new(dirs));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_books,
            commands::get_book_cover,
            commands::read_book,
            commands::import_books,
            commands::delete_book,
            commands::save_config,
            commands::load_config,
            commands::list_configs,
            commands::delete_config,
            commands::list_fonts,
            commands::import_font,
            commands::read_font,
            commands::delete_font,
            commands::open_books_folder,
            commands::window_minimize,
            commands::window_maximize_toggle,
            commands::window_close,
            commands::window_is_maximized
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Local Read Tauri application");
}
