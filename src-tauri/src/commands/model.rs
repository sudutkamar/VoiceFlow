use std::path::PathBuf;
use std::fs;
use tauri::State;
use crate::AppState;

fn get_default_models_dir() -> PathBuf {
    if let Some(docs) = dirs::document_dir() {
        let models_dir = docs.join("VoiceFlow").join("models");
        fs::create_dir_all(&models_dir).ok();
        return models_dir;
    }
    PathBuf::from("models")
}

async fn get_models_dir(state: &AppState) -> PathBuf {
    let db = state.db.lock().await;
    let custom_path = db.get_setting("custom_models_path");

    if let Some(path) = custom_path {
        let p = PathBuf::from(&path);
        if p.exists() {
            return p;
        }
    }

    get_default_models_dir()
}

#[tauri::command]
pub async fn get_available_models(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let dir = get_models_dir(&state).await;
    if !dir.exists() {
        return Ok(vec![]);
    }

    let models: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "bin"))
        .filter_map(|e| e.file_name().to_str().map(String::from))
        .collect();

    Ok(models)
}

#[tauri::command]
pub async fn scan_models_folder(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    get_available_models(state).await
}

#[tauri::command]
pub async fn is_model_downloaded(
    state: State<'_, AppState>,
    model: String,
) -> Result<bool, String> {
    let dir = get_models_dir(&state).await;
    Ok(dir.join(&model).exists())
}

#[tauri::command]
pub async fn get_models_path(state: State<'_, AppState>) -> Result<String, String> {
    Ok(get_models_dir(&state).await.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_models_base_dir() -> Result<String, String> {
    if let Some(docs) = dirs::document_dir() {
        Ok(docs.join("VoiceFlow").to_string_lossy().to_string())
    } else {
        Ok("VoiceFlow".to_string())
    }
}

#[tauri::command]
pub async fn choose_models_folder(state: State<'_, AppState>) -> Result<String, String> {
    Ok(get_models_dir(&state).await.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn reset_models_path(state: State<'_, AppState>) -> Result<String, String> {
    {
        let db = state.db.lock().await;
        db.update_setting("custom_models_path", "").map_err(|e| e.to_string())?;
    }
    Ok(get_models_dir(&state).await.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn has_any_model(state: State<'_, AppState>) -> Result<bool, String> {
    let models = get_available_models(state).await?;
    Ok(!models.is_empty())
}

#[tauri::command]
pub fn download_model(
    _model: String,
) -> Result<(), String> {
    Err("Download not yet implemented in Tauri backend".into())
}

#[tauri::command]
pub async fn delete_model(
    state: State<'_, AppState>,
    model: String,
) -> Result<bool, String> {
    let dir = get_models_dir(&state).await;
    let path = dir.join(&model);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}
