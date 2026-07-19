use std::collections::HashMap;
use tauri::State;
use crate::{AppState, db::Database};

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    let db = state.db.lock().await;
    Ok(db.get_all_settings())
}

#[tauri::command]
pub async fn update_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_setting(&key, &value)
        .map_err(|e| e.to_string())
}
