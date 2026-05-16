mod commands;

use commands::crawler::fetch_url;
use commands::settings::{get_settings, save_settings};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            fetch_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
