use std::path::PathBuf;
use std::fs;
use tauri::{State, Emitter, Manager};
use uuid::Uuid;
use crate::{AppState, whisper::Transcriber};

/// Global transcriber instance (lazy init)
static TRANSCRIBER: tokio::sync::Mutex<Option<Transcriber>> = tokio::sync::Mutex::const_new(None);

async fn get_transcriber() -> tokio::sync::MutexGuard<'static, Option<Transcriber>> {
    TRANSCRIBER.lock().await
}

#[tauri::command]
pub fn start_recording(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("state-change", "recording")
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn stop_recording(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("state-change", "idle")
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_dictation(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("toggle-dictation", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn send_audio_data(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    buffer: Vec<u8>,
    _mime_type: String,
    duration: f64,
) -> Result<(), String> {
    let logger = &state.logger;
    logger.info(&format!(
        "Received audio data: {} bytes, duration: {:.0}ms",
        buffer.len(),
        duration
    ));

    if buffer.is_empty() {
        return Err("No audio data received".into());
    }

    // Save to temp file
    let temp_dir = std::env::temp_dir().join("voiceflow");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let wav_path = temp_dir.join(format!("recording_{}.wav", Uuid::new_v4()));
    fs::write(&wav_path, &buffer).map_err(|e| e.to_string())?;

    // Get settings (clone values before await to avoid Send issues)
    let (model, language) = {
        let db = state.db.lock().await;
        let model = db.get_setting("model").unwrap_or_default();
        let language = db
            .get_setting("language")
            .unwrap_or_else(|| "auto".to_string());
        (model, language)
    };

    // Transcribe (no lock held across await)
    let result = {
        let mut transcriber = get_transcriber().await;
        if transcriber.is_none() {
            *transcriber = Some(Transcriber::new());
        }
        let t = transcriber.as_mut().unwrap();
        t.transcribe(&wav_path, &model, &language).await
    };

    // Cleanup temp file
    let _ = fs::remove_file(&wav_path);

    match result {
        Ok(text) if !text.is_empty() => {
            logger.info(&format!("Transcription: {}", text));

            // Send to renderer
            let _ = app.emit(
                "transcript-ready",
                serde_json::json!({
                    "raw": text,
                    "cleaned": text,
                    "duration": duration,
                }),
            );

            // Save to history (lock, write, drop lock before next await)
            {
                let db = state.db.lock().await;
                let id = Uuid::new_v4().to_string();
                let _ = db.add_history(&id, &text, &text, 0, duration as i64);
            }
        }
        Ok(_) => {
            let _ = app.emit("error", "__NO_SPEECH__");
        }
        Err(e) => {
            logger.error(&format!("Transcription failed: {}", e));
            let _ = app.emit("error", e);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_transcription() -> Result<(), String> {
    let mut transcriber = get_transcriber().await;
    if let Some(t) = transcriber.as_mut() {
        t.cancel();
    }
    Ok(())
}

#[tauri::command]
pub fn get_transcript() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "success": true,
        "raw": "",
        "cleaned": "",
    }))
}
