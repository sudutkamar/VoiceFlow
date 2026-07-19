use tauri::State;
use crate::AppState;

#[tauri::command]
pub fn get_gpu_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let whisper_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    let cpu_dir = whisper_dir.join("resources").join("whisper").join("cpu");
    let gpu_dir = whisper_dir.join("resources").join("whisper").join("gpu");

    let has_gpu = cpu_dir.join("ggml-cuda.dll").exists()
        || gpu_dir.join("ggml-cuda.dll").exists();

    Ok(serde_json::json!({
        "hasGpu": has_gpu,
        "mode": if has_gpu { "GPU (CUDA)" } else { "CPU Only" },
        "whisperDir": whisper_dir.to_string_lossy(),
        "cpuDir": cpu_dir.to_string_lossy(),
        "gpuDir": gpu_dir.to_string_lossy(),
        "cudaDllsPresent": has_gpu,
        "needsDownload": false,
    }))
}

#[tauri::command]
pub fn download_cuda() -> Result<serde_json::Value, String> {
    // Placeholder — actual implementation downloads CUDA DLLs
    Ok(serde_json::json!({
        "success": false,
        "error": "CUDA download not yet implemented in Tauri backend"
    }))
}

#[tauri::command]
pub fn delete_whisper_engine(
    _state: State<'_, AppState>,
    _engine_type: String,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "success": false,
        "error": "Engine deletion not yet implemented in Tauri backend"
    }))
}
