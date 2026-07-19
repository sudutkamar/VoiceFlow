use tauri::{Manager, AppHandle, Emitter};
use tauri::webview::WebviewWindowBuilder;

#[tauri::command]
pub fn get_app_state() -> Result<String, String> {
    Ok("idle".to_string())
}

#[tauri::command]
pub fn get_target_app() -> Result<String, String> {
    Ok(String::new())
}

#[tauri::command]
pub fn get_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub fn is_autostart() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub fn set_autostart(_enable: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn show_main(app: AppHandle, page: Option<String>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        if let Some(p) = page {
            let _ = window.emit("navigate", p);
        }
    }

    // Hide mini window
    if let Some(mini) = app.get_webview_window("mini") {
        let _ = mini.hide();
    }

    Ok(())
}

#[tauri::command]
pub fn minimize_to_bar(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    show_mini_window(app)
}

#[tauri::command]
pub fn show_mini_window(app: AppHandle) -> Result<(), String> {
    // Create mini window on-demand if it doesn't exist
    if app.get_webview_window("mini").is_none() {
        let _mini = WebviewWindowBuilder::new(
            &app,
            "mini",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("VoiceFlow Mini")
        .inner_size(380.0, 52.0)
        .min_inner_size(200.0, 28.0)
        .max_inner_size(800.0, 120.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    } else if let Some(mini) = app.get_webview_window("mini") {
        mini.show().map_err(|e| e.to_string())?;
        mini.set_always_on_top(true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_mini_window(app: AppHandle) -> Result<(), String> {
    if let Some(mini) = app.get_webview_window("mini") {
        mini.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_mini_window(
    app: AppHandle,
    height: f64,
    width: Option<f64>,
) -> Result<(), String> {
    if let Some(mini) = app.get_webview_window("mini") {
        let new_height = height.max(28.0) as u32;
        let new_width = width.map(|w| w as u32).unwrap_or(380);

        mini.set_size(tauri::PhysicalSize {
            width: new_width,
            height: new_height,
        })
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_mini_window_focusable(
    app: AppHandle,
    focusable: bool,
) -> Result<(), String> {
    if let Some(mini) = app.get_webview_window("mini") {
        mini.set_focusable(focusable).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn mini_window_ready() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn clear_cache() -> Result<serde_json::Value, String> {
    let temp_dir = std::env::temp_dir().join("voiceflow");
    let mut cleared = 0;

    if temp_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&temp_dir) {
            for entry in entries.flatten() {
                if std::fs::remove_file(entry.path()).is_ok() {
                    cleared += 1;
                }
            }
        }
    }

    Ok(serde_json::json!({
        "success": true,
        "filesCleared": cleared,
    }))
}
