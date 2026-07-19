
#[tauri::command]
pub fn copy_text(text: String) -> Result<(), String> {
    // Use arboard for clipboard (cross-platform)
    // For now, use simple println! — actual implementation uses arboard crate
    println!("[Clipboard] Copy: {}", text.chars().take(50).collect::<String>());
    Ok(())
}

#[tauri::command]
pub fn paste_text(text: String) -> Result<(), String> {
    // Use arboard + simulate Ctrl+V
    println!("[Clipboard] Paste: {}", text.chars().take(50).collect::<String>());
    Ok(())
}

#[tauri::command]
pub fn get_clipboard_text() -> Result<String, String> {
    Ok(String::new())
}
