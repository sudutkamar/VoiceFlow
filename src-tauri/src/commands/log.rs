use tauri::State;
use crate::AppState;

#[tauri::command]
pub fn set_log_level(
    state: State<'_, AppState>,
    level: String,
) -> Result<(), String> {
    state.logger.set_level(&level);
    Ok(())
}
