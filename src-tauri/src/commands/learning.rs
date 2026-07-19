use tauri::State;
use uuid::Uuid;
use crate::{AppState, db::LearnedCorrection};

#[tauri::command]
pub async fn learn_correction(
    state: State<'_, AppState>,
    original: String,
    corrected: String,
) -> Result<(), String> {
    let db = state.db.lock().await;

    // Check if correction already exists
    if let Some(existing_id) = find_correction_id(&db, &original) {
        db.increment_correction_frequency(&existing_id)
            .map_err(|e| e.to_string())?;
    } else {
        let id = Uuid::new_v4().to_string();
        db.add_learned_correction(&id, &original, &corrected)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn find_correction_id(_db: &crate::db::Database, _original: &str) -> Option<String> {
    // Use a direct query to find the ID
    // For now, return None to always insert new
    None
}

#[tauri::command]
pub async fn get_learned_corrections(
    state: State<'_, AppState>,
) -> Result<Vec<LearnedCorrection>, String> {
    let db = state.db.lock().await;
    db.get_learned_corrections().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_learned_correction(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_learned_correction(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_learned_corrections(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.clear_learned_corrections().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_adaptive_stats(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let db = state.db.lock().await;
    let corrections = db.get_learned_corrections().map_err(|e| e.to_string())?;

    let total = corrections.len() as i64;
    let total_frequency: i64 = corrections.iter().map(|c| c.frequency).sum();
    let avg_confidence = if total > 0 {
        corrections.iter().map(|c| c.confidence).sum::<f64>() / total as f64
    } else {
        0.0
    };

    Ok(serde_json::json!({
        "total": total,
        "totalFrequency": total_frequency,
        "avgConfidence": avg_confidence,
    }))
}
