use tauri::State;
use uuid::Uuid;
use crate::{AppState, db::SnippetEntry};

#[tauri::command]
pub async fn get_snippets(state: State<'_, AppState>) -> Result<Vec<SnippetEntry>, String> {
    let db = state.db.lock().await;
    db.get_snippets().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_snippet(
    state: State<'_, AppState>,
    trigger: String,
    output: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    let id = Uuid::new_v4().to_string();
    db.add_snippet(&id, &trigger, &output)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_snippet(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_snippet(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_snippet(
    state: State<'_, AppState>,
    id: String,
    trigger: String,
    output: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_snippet(&id, &trigger, &output)
        .map_err(|e| e.to_string())
}
