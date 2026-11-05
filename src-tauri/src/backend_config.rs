//! Which backend the UI uses: this device (the Rust backend in this app, the default) or an external rapidraw-web
//! server (relay + bridge), reached over a WebSocket by the UI itself (src/remote/). Stored as a small JSON file in
//! the app data folder, readable only by this user. Deliberately not in the system credential store: the UI reads it
//! at every start, and on macOS a keychain access from a newly built (ad-hoc signed) app waits for a permission
//! dialog and blocks the start.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BackendConfig {
    /// "local" (this device) or "remote" (external server)
    pub mode: String,
    pub url: String,
    pub user: String,
    pub password: String,
}

fn config_file(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.join("backend.json"))
}

pub fn load(app_handle: &AppHandle) -> BackendConfig {
    let mut config = config_file(app_handle)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<BackendConfig>(&text).ok())
        .unwrap_or_default();
    if config.mode != "remote" {
        config.mode = "local".to_string();
    }
    config
}

pub fn save(app_handle: &AppHandle, config: &BackendConfig) -> Result<(), String> {
    let path = config_file(app_handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    // written next to the old file and renamed, so a crash never leaves half a file
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    restrict_permissions(&tmp);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[cfg(unix)]
fn restrict_permissions(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &std::path::Path) {}

#[tauri::command]
pub fn get_backend_config(app_handle: AppHandle) -> BackendConfig {
    load(&app_handle)
}

#[tauri::command]
pub fn set_backend_config(app_handle: AppHandle, config: BackendConfig) -> Result<(), String> {
    let mut config = config;
    if config.mode != "remote" {
        config.mode = "local".to_string();
    }
    config.url = config.url.trim().trim_end_matches('/').to_string();
    config.user = config.user.trim().to_string();
    save(&app_handle, &config)
}
