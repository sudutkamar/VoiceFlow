use tauri::State;
use crate::AppState;

#[tauri::command]
pub async fn get_warmup_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let model = {
        let db = state.db.lock().await;
        db.get_setting("model").unwrap_or_default()
    };

    // Check if whisper-cli exists
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    let whisper_available = exe_dir
        .join("resources")
        .join("whisper")
        .join("cpu")
        .join("whisper-cli.exe")
        .exists();

    // Check GPU
    let gpu_available = exe_dir
        .join("resources")
        .join("whisper")
        .join("cpu")
        .join("ggml-cuda.dll")
        .exists();

    // Check model
    let models_dir = if let Some(docs) = dirs::document_dir() {
        docs.join("VoiceFlow").join("models")
    } else {
        exe_dir.join("resources").join("whisper").join("models")
    };

    let model_size = models_dir
        .join(&model)
        .metadata()
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(serde_json::json!({
        "ready": whisper_available,
        "model": model,
        "whisperAvailable": whisper_available,
        "gpuAvailable": gpu_available,
        "modelSize": model_size,
    }))
}
