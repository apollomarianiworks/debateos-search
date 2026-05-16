use serde::{Deserialize, Serialize};
use std::fs;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub brave_api_key: String,
    pub active_provider: String,
    pub safe_search: bool,
    pub results_per_page: u32,
    #[serde(default = "default_true")]
    pub restore_last_session: bool,
    #[serde(default = "default_mode")]
    pub search_mode: String,
    #[serde(default)]
    pub preferred_categories: Vec<String>,
}

fn default_mode() -> String {
    "standard".to_string()
}

fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            brave_api_key: String::new(),
            active_provider: "mock".to_string(),
            safe_search: true,
            results_per_page: 10,
            restore_last_session: true,
            search_mode: "standard".to_string(),
            preferred_categories: vec!["all".to_string()],
        }
    }
}

fn settings_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir should exist")
        .join("settings.json")
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app);
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}
