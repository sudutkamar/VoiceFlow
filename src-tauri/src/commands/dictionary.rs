use tauri::State;
use uuid::Uuid;
use crate::{AppState, db::DictionaryEntry};

#[tauri::command]
pub async fn get_dictionary(state: State<'_, AppState>) -> Result<Vec<DictionaryEntry>, String> {
    let db = state.db.lock().await;
    db.get_dictionary().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_dictionary_entry(
    state: State<'_, AppState>,
    phrase: String,
    replacement: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    let id = Uuid::new_v4().to_string();
    db.add_dictionary_entry(&id, &phrase, &replacement)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_dictionary_entry(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_dictionary_entry(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_dictionary_entry(
    state: State<'_, AppState>,
    id: String,
    phrase: String,
    replacement: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_dictionary_entry(&id, &phrase, &replacement)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_dictionary(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().await;
    let entries = db.get_dictionary().map_err(|e| e.to_string())?;

    let mut csv = String::from("Phrase,Replacement\n");
    for entry in &entries {
        csv.push_str(&format!(
            "\"{}\",\"{}\"\n",
            entry.phrase.replace('"', "\"\""),
            entry.replacement.replace('"', "\"\""),
        ));
    }
    Ok(csv)
}

#[tauri::command]
pub async fn import_dictionary(
    state: State<'_, AppState>,
    csv_content: String,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().await;
    let mut imported = 0;
    let mut skipped = 0;

    for line in csv_content.lines().skip(1) {
        let parts: Vec<&str> = line.splitn(2, ',').collect();
        if parts.len() == 2 {
            let phrase = parts[0].trim_matches('"').trim();
            let replacement = parts[1].trim_matches('"').trim();
            if !phrase.is_empty() {
                let id = Uuid::new_v4().to_string();
                if db.add_dictionary_entry(&id, phrase, replacement).is_ok() {
                    imported += 1;
                } else {
                    skipped += 1;
                }
            }
        }
    }

    Ok(serde_json::json!({
        "imported": imported,
        "skipped": skipped,
    }))
}
