use tauri::State;
use crate::{AppState, db::HistoryEntry};

#[tauri::command]
pub async fn get_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<HistoryEntry>, String> {
    let db = state.db.lock().await;
    db.get_history(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_history(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<HistoryEntry>, String> {
    let db = state.db.lock().await;
    db.search_history(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_history_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_history_item(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.clear_history().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_history(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().await;
    let entries = db.get_history(Some(1000)).map_err(|e| e.to_string())?;

    let mut csv = String::from("ID,Raw Text,Cleaned Text,Duration (ms),Audio Duration (ms),Created At\n");
    for entry in &entries {
        csv.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"\n",
            entry.id,
            entry.raw_text.replace('"', "\"\""),
            entry.cleaned_text.replace('"', "\"\""),
            entry.duration_ms,
            entry.audio_duration_ms,
            entry.created_at,
        ));
    }
    Ok(csv)
}
