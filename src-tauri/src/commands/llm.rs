
#[tauri::command]
pub fn llm_check_availability() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "success": true,
        "available": false,
        "hasCli": false,
        "binaryDownloaded": false,
        "models": [],
        "error": "LLM not yet implemented in Tauri backend"
    }))
}

#[tauri::command]
pub fn llm_get_models() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "success": true,
        "models": [],
    }))
}

#[tauri::command]
pub fn llm_download_model(_model_name: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "success": false,
        "error": "LLM download not yet implemented"
    }))
}

#[tauri::command]
pub fn llm_delete_model(_model_name: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "success": false,
        "error": "LLM delete not yet implemented"
    }))
}

#[tauri::command]
pub fn llm_test_process(
    _text: String,
    _model_name: Option<String>,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "success": false,
        "error": "LLM test not yet implemented"
    }))
}

#[tauri::command]
pub fn llm_get_models_path() -> Result<String, String> {
    Ok(String::new())
}
