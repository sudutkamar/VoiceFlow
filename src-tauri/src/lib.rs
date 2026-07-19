pub mod commands;
pub mod db;
pub mod audio;
pub mod whisper;
pub mod paste;
pub mod utils;

use tokio::sync::Mutex;
use tauri::{Manager, Emitter};
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri_plugin_global_shortcut::{ShortcutState, GlobalShortcutExt};

use db::Database;
use utils::Logger;

/// App state shared across all Tauri commands
pub struct AppState {
    pub db: Mutex<Database>,
    pub logger: Logger,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Initialize database
            let app_data = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data).ok();

            let db_path = app_data.join("voiceflow.db");
            let database = Database::new(&db_path)
                .expect("Failed to initialize database");

            let logger = Logger::new();

            // Store shared state
            app.manage(AppState {
                db: Mutex::new(database),
                logger,
            });

            // ── Create main window ──
            if let Some(window) = app.get_webview_window("main") {
                window.show().ok();
                window.set_focus().ok();
            }

            // ── Create tray icon ──
            let show_main = MenuItemBuilder::new("Show VoiceFlow").id("show_main").build(app)?;
            let toggle_rec = MenuItemBuilder::new("Toggle Recording").id("toggle_rec").build(app)?;
            let quit_item = MenuItemBuilder::new("Quit").id("quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_main)
                .item(&toggle_rec)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("VoiceFlow — Click to show")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show_main" => {
                            if let Some(win) = app.get_webview_window("main") {
                                win.show().ok();
                                win.set_focus().ok();
                            }
                        }
                        "toggle_rec" => {
                            let _ = app.emit("toggle-dictation", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                win.hide().ok();
                            } else {
                                win.show().ok();
                                win.set_focus().ok();
                            }
                        }
                    }
                })
                .build(app)?;

            // ── Register global shortcut (Ctrl+Shift+V) ──
            app.global_shortcut().on_shortcut(
                "CmdOrCtrl+Shift+V",
                move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = _app.emit("toggle-dictation", ());
                    }
                },
            )?;

            Logger::new().info("VoiceFlow started — tray icon + global shortcut registered");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Settings
            commands::settings::get_settings,
            commands::settings::update_setting,
            // Recording
            commands::dictation::start_recording,
            commands::dictation::stop_recording,
            commands::dictation::toggle_dictation,
            commands::dictation::send_audio_data,
            commands::dictation::cancel_transcription,
            commands::dictation::get_transcript,
            // Clipboard
            commands::clipboard::copy_text,
            commands::clipboard::paste_text,
            commands::clipboard::get_clipboard_text,
            // History
            commands::history::get_history,
            commands::history::search_history,
            commands::history::delete_history_item,
            commands::history::clear_history,
            commands::history::export_history,
            // Dictionary
            commands::dictionary::get_dictionary,
            commands::dictionary::add_dictionary_entry,
            commands::dictionary::delete_dictionary_entry,
            commands::dictionary::update_dictionary_entry,
            commands::dictionary::export_dictionary,
            commands::dictionary::import_dictionary,
            // Snippets
            commands::snippet::get_snippets,
            commands::snippet::add_snippet,
            commands::snippet::delete_snippet,
            commands::snippet::update_snippet,
            // Models
            commands::model::get_available_models,
            commands::model::scan_models_folder,
            commands::model::download_model,
            commands::model::delete_model,
            commands::model::is_model_downloaded,
            commands::model::get_models_path,
            commands::model::get_models_base_dir,
            commands::model::choose_models_folder,
            commands::model::reset_models_path,
            commands::model::has_any_model,
            // GPU
            commands::gpu::get_gpu_status,
            commands::gpu::download_cuda,
            commands::gpu::delete_whisper_engine,
            // Adaptive Learning
            commands::learning::learn_correction,
            commands::learning::get_learned_corrections,
            commands::learning::delete_learned_correction,
            commands::learning::clear_learned_corrections,
            commands::learning::get_adaptive_stats,
            // LLM
            commands::llm::llm_check_availability,
            commands::llm::llm_get_models,
            commands::llm::llm_download_model,
            commands::llm::llm_delete_model,
            commands::llm::llm_test_process,
            commands::llm::llm_get_models_path,
            // App
            commands::app::get_app_state,
            commands::app::get_target_app,
            commands::app::get_version,
            commands::app::is_autostart,
            commands::app::set_autostart,
            commands::app::quit_app,
            commands::app::show_main,
            commands::app::minimize_to_bar,
            commands::app::show_mini_window,
            commands::app::hide_mini_window,
            commands::app::resize_mini_window,
            commands::app::set_mini_window_focusable,
            commands::app::clear_cache,
            commands::app::mini_window_ready,
            // Warmup
            commands::warmup::get_warmup_status,
            // Log
            commands::log::set_log_level,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VoiceFlow");
}
