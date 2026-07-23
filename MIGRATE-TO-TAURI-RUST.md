# Migration Guide: Electron → Tauri 2 + Rust

**Project:** VoiceFlow (nama sementara — ganti sesuai project baru)  
**Frontend:** React 18 + TypeScript (TIDAK BERUBAH)  
**Backend:** Electron + Node.js → Tauri 2 + Rust  
**Status:** PLANNING — Belum mulai  
**Target:** Project folder BARU — semua file frontend di-copy, backend di-rewrite

---

## Daftar Isi

1. [Prinsip Utama](#1-prinsip-utama)
2. [Perbandingan: Before vs After](#2-perbandingan-before-vs-after)
3. [Technology Stack Baru](#3-technology-stack-baru)
4. [Arsitektur Baru](#4-arsitektur-baru)
5. [Frozen Zones — Frontend yang TIDAK BERUBAH](#5-frozen-zones--frontend-yang-tidak-berubah)
6. [IPC Mapping: Electron → Tauri Commands](#6-ipc-mapping-electron--tauri-commands)
7. [Module Rewrite Guide: File per File](#7-module-rewrite-guide-file-per-file)
8. [Phase-by-Phase Migration Plan](#8-phase-by-phase-migration-plan)
9. [Testing Strategy](#9-testing-strategy)
10. [Risks & Mitigasi](#10-risks--mitigasi)
11. [Timeline & Effort](#11-timeline--effort)
12. [Appendix: Boilerplate Code](#12-appendix-boilerplate-code)

---

## 1. Prinsip Utama

### 🎯 Golden Rule

> **Frontend React TIDAK boleh berubah.** Semua file di `src/` tetap persis sama.
> Hanya backend (`electron/`) yang di-rewrite ke Rust (`src-tauri/`).

### Artinya:

```
✅ React components — COPY AS-IS  (MiniBar, HomePage, Settings, dll)
✅ CSS/styles — COPY AS-IS        (app.css, variables.css, dll)  
✅ hooks/useRecorder.ts — TETAP   (hanya ganti panggilan IPC)
✅ utils/wavRecorder.ts — TETAP   (Web API, tidak perlu Rust)
✅ utils/constants.ts — TETAP
✅ utils/errorHandler.ts — TETAP
✅ utils/icons.tsx — TETAP
✅ utils/languages.ts — TETAP
✅ utils/soundEffects.ts — TETAP
✅ utils/micDetector.ts — TETAP

❌ electron/ — REWRITE semua ke Rust
❌ electron/preload.ts — GANTI dengan @tauri-apps/api
❌ electron/main.ts — GANTI dengan Tauri main.rs
❌ src/types/electron.d.ts — GANTI dengan tauri commands types
```

### Kenapa ini penting?

Frontend React sudah mature, sudah di-test, user sudah suka. **Tidak ada alasan untuk mengubah kode yang sudah jalan.** Perubahan hanya di layer komunikasi (IPC → Tauri commands).

---

## 2. Perbandingan: Before vs After

### Installer & Resource

| Aspek | Electron (Before) | Tauri + Rust (After) | Gain |
|-------|-------------------|---------------------|------|
| Installer size | ~200 MB | ~8-12 MB | **20x lebih kecil** |
| RAM idle | ~150 MB | ~30-50 MB | **3-5x lebih ringan** |
| RAM recording | ~200 MB | ~60-80 MB | **3x lebih ringan** |
| Startup time | 2-3 detik | <500ms | **4-6x lebih cepat** |
| CPU usage (idle) | ~2-5% | <1% | Hampir tidak terasa |
| File count | ~30.000 (node_modules) | ~100 files | **300x lebih sedikit** |

### Struktur Folder

```
SEBELUM (Electron):
voiceflow/
├── src/                    ← React frontend (TETAP)
├── electron/               ← Backend (DIREWRITE)
│   ├── main.ts             ← Window management + IPC
│   ├── preload.ts          ← contextBridge API
│   ├── ipc/                ← IPC handlers
│   ├── modules/            ← Business logic
│   └── utils/              ← Shared utilities
├── node_modules/           ← ~30.000 files
├── package.json
└── tsconfig.json

SESUDAH (Tauri):
project-baru/
├── src/                    ← REACT FRONTEND (COPY AS-IS)
├── src-tauri/              ← RUST BACKEND (BARU)
│   ├── src/
│   │   ├── main.rs         ← App entry + Tauri builder
│   │   ├── commands/       ← Tauri command handlers
│   │   ├── modules/        ← Business logic (Rust)
│   │   └── utils/          ← Shared utilities
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json            ← Lebih sederhana (hanya frontend deps)
└── vite.config.ts          ← Sama
```

---

## 3. Technology Stack Baru

### Frontend (SAMA PERSIS — TIDAK BERUBAH)

| Library | Versi | Catatan |
|---------|-------|---------|
| React | 18.x | Sama |
| TypeScript | 5.x | Sama |
| Vite | 5.x | Sama |
| @iconify/react | 6.x | Sama |
| i18next | 26.x | Sama |
| zod | 3.x | Sama |

### Backend (BARU — Rust)

| Crate | Fungsi | Menggantikan |
|-------|--------|-------------|
| `tauri` 2.x | Framework desktop | `electron` |
| `tauri-plugin-global-shortcut` | Global hotkey | `uiohook-napi` |
| `tauri-plugin-clipboard-manager` | Clipboard | `electron.clipboard` |
| `tauri-plugin-shell` | Spawn whisper CLI | `child_process` |
| `tauri-plugin-dialog` | File picker | `dialog.showOpenDialog` |
| `rusqlite` | SQLite database | `better-sqlite3` |
| `serde` + `serde_json` | Serialization | — |
| `reqwest` | HTTP download | `https` module |
| `tokio` | Async runtime | — |
| `windows-sys` | Win32 API (paste) | `keybd_event` / `SendInput` |
| `enigo` | Keyboard/mouse simulation | Paste engine |
| `rdev` | Global keyboard listener | `uiohook-napi` |
| `chrono` | Date/time | — |
| `log` + `env_logger` | Logging | Custom Logger |
| `uuid` | UUID generation | `uuid` npm |
| `thiserror` | Error handling | — |
| `anyhow` | Error handling | — |

### Dependencies yang **HILANG** (tidak perlu di Tauri)

| Library | Alasan |
|---------|--------|
| `electron` | Diganti Tauri |
| `electron-builder` | Diganti `tauri build` |
| `better-sqlite3` | Diganti `rusqlite` |
| `uiohook-napi` | Diganti `rdev` + `tauri-plugin-global-shortcut` |
| `ffmpeg-static` | Opsional — bisa Rust `ffmpeg` crate |
| `concurrently` | Tidak perlu (Tauri handle sendiri) |
| `wait-on` | Tidak perlu |
| `cross-env` | Tidak perlu |

---

## 4. Arsitektur Baru

```
┌────────────────────────────────────────────────────────────────┐
│                        TAURI APP                               │
├────────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐      ┌─────────────────────────┐    │
│  │   FRONTEND (React)   │      │   BACKEND (Rust)        │    │
│  │                      │      │                         │    │
│  │  MiniBar / Pages     │─────▶│  commands/              │    │
│  │  hooks/useRecorder   │ Tauri│  ├── dictation.rs       │    │
│  │  utils/*             │ IPC  │  ├── settings.rs        │    │
│  │                      │◀─────│  ├── models.rs          │    │
│  │  @tauri-apps/api     │      │  ├── llm.rs             │    │
│  │  window, clipboard,  │      │  ├── gpu.rs             │    │
│  │  shell, dialog       │      │  └── hotkey.rs          │    │
│  └──────────────────────┘      │                         │    │
│                                 │  modules/               │    │
│                          │  ├── transcriber.rs     │    │
│                          │  ├── paste_engine.rs     │    │
│                          │  ├── database.rs         │    │
│                          │  ├── model_downloader.rs │    │
│                          │  ├── text_cleaner.rs     │    │
│                          │  ├── audio_processor.rs  │    │
│                          │  └── learning.rs         │    │
│                          └─────────────────────────┘    │
├────────────────────────────────────────────────────────────────┤
│                      WebView2 (Windows)                       │
└────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
BEFORE (Electron):
  React Component → window.electronAPI.xxx() → preload bridge
    → ipcMain.handle → module function → return result
    → JSON serialize → ipcRenderer → React state

AFTER (Tauri):
  React Component → @tauri-apps/api invoke('xxx') 
    → #[tauri::command] fn xxx() → Rust function
    → serde serialize → Promise resolve → React state
```

Perbedaan utama: **tanpa preload bridge.** Tauri commands langsung accessible dari frontend via `@tauri-apps/api`.

---

## 5. Frozen Zones — Frontend yang TIDAK BERUBAH

### 🔴 ABSOLUTELY FROZEN — Copy As-Is

```
src/
├── App.tsx                    — Root component
├── main.tsx                   — React entry point
├── components/
│   ├── MiniBar/MiniBar.tsx    — Floating bar horizontal
│   ├── VerticalMiniBar.tsx    — Floating bar vertikal
│   ├── MainApp/              — App layout + sidebar
│   ├── HomePage/             — Recording utama
│   ├── ErrorBoundary.tsx     — Error boundary
│   └── Notification.tsx      — Toast system
├── pages/
│   ├── History.tsx            — Riwayat transkripsi
│   ├── Models.tsx             — Model management
│   ├── Benchmark.tsx          — Benchmark
│   ├── LlmModels.tsx          — LLM model management
│   └── Settings/              — Settings (all tabs)
├── hooks/
│   ├── useRecorder.ts         — Recording lifecycle (HARAM ZONE)
│   └── SettingsContext.tsx     — Settings context
├── utils/
│   ├── wavRecorder.ts         — Audio capture (HARAM ZONE)
│   ├── audioWorkletProcessor.js
│   ├── audio.ts               — Sound effects
│   ├── constants.ts           — Constants
│   ├── errorHandler.ts        — Error handling
│   ├── icons.tsx              — SVG icons
│   ├── languages.ts           — Language definitions
│   ├── micDetector.ts         — Mic detection
│   └── soundEffects.ts        — Sound playback
├── styles/
│   ├── app.css                — Entry CSS
│   ├── variables.css          — CSS variables
│   ├── base.css               — Base styles
│   ├── components.css         — Component styles
│   ├── pages.css              — Page styles
│   ├── interactions.css       — Interactions
│   ├── utilities.css          — Utility classes
│   ├── minibar-horizontal.css — MiniBar styles
│   ├── minibar-vertical.css   — Vertical styles
│   └── global.css / modern.css
├── i18n/                      — Internationalization
├── test/                      — Test setup
└── types/
    └── electron.d.ts          — HAPUS, ganti dengan Tauri types
```

### 🟡 SLIGHTLY MODIFIED — 3 file yang perlu perubahan MINOR

| File | Perubahan |
|------|-----------|
| `src/hooks/useRecorder.ts` | Ganti `window.electronAPI.xxx()` → `import { invoke } from '@tauri-apps/api/core'` |
| `src/components/MiniBar/MiniBar.tsx` | Ganti `window.electronAPI.xxx` → `invoke()` + `@tauri-apps/api/event` |
| `src/components/VerticalMiniBar.tsx` | Sama seperti MiniBar |
| `src/pages/Models.tsx` | Sama — ganti panggilan IPC |
| `src/pages/History.tsx` | Sama |
| `src/pages/Settings/*.tsx` | Sama |

**Perubahan hanya di import path dan method name — logic tetap identik.**

---

## 6. IPC Mapping: Electron → Tauri Commands

### 6.1 Core Dictation

| Electron API | Tauri Command | Return Type |
|-------------|---------------|-------------|
| `window.electronAPI.startRecording()` | `invoke('start_recording')` | `{ success: boolean, error?: string }` |
| `window.electronAPI.stopRecording()` | `invoke('stop_recording')` | `{ success: boolean, error?: string }` |
| `window.electronAPI.sendAudioData(data)` | `invoke('send_audio_data', { buffer: number[], mimeType: string, duration: number })` | `void` |
| `window.electronAPI.cancelTranscription()` | `invoke('cancel_transcription')` | `{ success: boolean }` |
| `window.electronAPI.getTranscript()` | `invoke('get_transcript')` | `{ success: boolean, text?: string }` |

### 6.2 Clipboard & Paste

| Electron API | Tauri Command |
|-------------|---------------|
| `window.electronAPI.copyText(text)` | `invoke('copy_text', { text })` — atau `writeText()` dari clipboard plugin |
| `window.electronAPI.pasteText(text)` | `invoke('paste_text', { text })` — Rust paste engine |
| `window.electronAPI.getClipboardText()` | `invoke('get_clipboard_text')` |

### 6.3 Window Management

| Electron API | Tauri Equivalent |
|-------------|-----------------|
| `showMiniWindow()` | `window.setFocus()` + `window.show()` |
| `hideMiniWindow()` | `window.hide()` |
| `resizeMiniWindow(h, w)` | `window.setSize(new PhysicalSize(w, h))` |
| `setMiniWindowFocusable(bool)` | Tidak ada direct — atur di tauri.conf.json |
| `miniWindowReady()` | `invoke('mini_window_ready')` |
| `showMain(page?)` | `invoke('show_main_window', { page })` |
| `hideAllForPaste()` | `invoke('hide_all_windows')` |
| `showAfterPaste()` | `invoke('show_after_paste')` |

### 6.4 Settings

| Electron API | Tauri Command |
|-------------|---------------|
| `getSettings()` | `invoke('get_settings')` |
| `updateSetting(key, value)` | `invoke('update_setting', { key, value })` |
| `getHistory(limit?)` | `invoke('get_history', { limit })` |
| `clearHistory()` | `invoke('clear_history')` |
| `deleteHistoryItem(id)` | `invoke('delete_history_item', { id })` |
| `searchHistory(query)` | `invoke('search_history', { query })` |
| `exportHistory()` | `invoke('export_history')` |

### 6.5 Dictionary & Snippets

| Electron API | Tauri Command |
|-------------|---------------|
| `getDictionary()` | `invoke('get_dictionary')` |
| `addDictionaryEntry(p, r)` | `invoke('add_dictionary_entry', { phrase, replacement })` |
| `deleteDictionaryEntry(id)` | `invoke('delete_dictionary_entry', { id })` |
| `getSnippets()` | `invoke('get_snippets')` |
| `addSnippet(t, o)` | `invoke('add_snippet', { trigger, output })` |
| `deleteSnippet(id)` | `invoke('delete_snippet', { id })` |

### 6.6 Models

| Electron API | Tauri Command |
|-------------|---------------|
| `getAvailableModels()` | `invoke('get_available_models')` |
| `scanModelsFolder()` | `invoke('scan_models_folder')` |
| `downloadModel(name)` | `invoke('download_model', { name })` |
| `pauseDownload()` | `invoke('pause_download')` |
| `resumeDownload()` | `invoke('resume_download')` |
| `cancelDownload()` | `invoke('cancel_download')` |
| `deleteModel(name)` | `invoke('delete_model', { name })` |
| `isModelDownloaded(name)` | `invoke('is_model_downloaded', { name })` |
| `getModelsPath()` | `invoke('get_models_path')` |
| `chooseModelsFolder()` | `invoke('choose_models_folder')` |
| `resetModelsPath()` | `invoke('reset_models_path')` |

### 6.7 Events (Main → Renderer)

| Electron Event | Tauri Equivalent |
|---------------|-----------------|
| `onStateChange(cb)` | `listen('state-change', cb)` |
| `onTranscriptReady(cb)` | `listen('transcript-ready', cb)` |
| `onError(cb)` | `listen('error', cb)` |
| `onPartialTranscript(cb)` | `listen('partial-transcript', cb)` |
| `onDownloadProgress(cb)` | `listen('download-progress', cb)` |
| `onWarmupComplete(cb)` | `listen('warmup-complete', cb)` |
| `onModelChanged(cb)` | `listen('model-changed', cb)` |
| `onThemeChange(cb)` | `listen('theme-changed', cb)` |
| `onReloadSettings(cb)` | `listen('reload-settings', cb)` |
| `onTargetAppChanged(cb)` | `listen('target-app-changed', cb)` |
| `onHotkeyRegistered(cb)` | `listen('hotkey-registered', cb)` |

### 6.8 GPU / CUDA

| Electron API | Tauri Command |
|-------------|---------------|
| `getGpuStatus()` | `invoke('get_gpu_status')` |
| `chooseGpuFolder()` | `invoke('choose_gpu_folder')` |
| `scanGpuFolder()` | `invoke('scan_gpu_folder')` |
| `downloadCuda()` | `invoke('download_cuda')` |

### 6.9 Adaptive Learning

| Electron API | Tauri Command |
|-------------|---------------|
| `learnCorrection(orig, corrected)` | `invoke('learn_correction', { original, corrected })` |
| `getLearnedCorrections()` | `invoke('get_learned_corrections')` |
| `deleteLearnedCorrection(id)` | `invoke('delete_learned_correction', { id })` |
| `getAdaptiveStats()` | `invoke('get_adaptive_stats')` |

### 6.10 LLM Post-Processing

| Electron API | Tauri Command |
|-------------|---------------|
| `llmCheckAvailability()` | `invoke('llm_check_availability')` |
| `llmGetModels()` | `invoke('llm_get_models')` |
| `llmDownloadModel(name)` | `invoke('llm_download_model', { name })` |
| `llmTestProcess(text, model?)` | `invoke('llm_test_process', { text, model })` |
| `llmDownloadBinary()` | `invoke('llm_download_binary')` |

### 6.11 App Lifecycle

| Electron API | Tauri Command |
|-------------|---------------|
| `getVersion()` | `invoke('get_version')` |
| `quitApp()` | `invoke('quit_app')` |
| `isAutoStart()` | `invoke('is_autostart')` |
| `setAutoStart(bool)` | `invoke('set_autostart', { enable })` |
| `clearCache()` | `invoke('clear_cache')` |
| `getWarmupStatus()` | `invoke('get_warmup_status')` |
| `checkForUpdates()` | `invoke('check_for_updates')` — atau Tauri updater plugin |

---

## 7. Module Rewrite Guide: File per File

### 7.1 `electron/main.ts` → `src-tauri/src/main.rs`

**Electron (953 lines):** Window management, IPC setup, app lifecycle, tray, warmup, model migration.

**Rust target (~200 lines):**

```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod modules;
mod utils;
mod events;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Init database
            let db = modules::database::Database::new(app.path().app_data_dir()?)?;
            app.manage(db);
            
            // Init logger
            let logger = modules::logger::Logger::new();
            app.manage(logger);
            
            // Create main window
            let _main_window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("VoiceFlow")
                .fullscreen(false)
                .inner_size(1200.0, 900.0)
                .build()?;
            
            // Create mini window (hidden initially)
            let _mini_window = WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("index.html#mini".into()))
                .title("VoiceFlow Mini")
                .inner_size(380.0, 52.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .build()?;
            
            // Init hotkey manager
            let hotkey_mgr = modules::hotkey::HotkeyManager::new(app.handle());
            app.manage(hotkey_mgr);
            
            // Warmup
            let transcriber = modules::transcriber::Transcriber::new();
            app.manage(transcriber);
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Commands
            commands::dictation::start_recording,
            commands::dictation::stop_recording,
            commands::dictation::cancel_transcription,
            commands::settings::get_settings,
            commands::settings::update_setting,
            commands::models::get_available_models,
            commands::models::download_model,
            commands::models::delete_model,
            commands::clipboard::copy_text,
            commands::clipboard::paste_text,
            commands::gpu::get_gpu_status,
            commands::llm::llm_check_availability,
            commands::learning::learn_correction,
            commands::app::get_version,
            commands::app::quit_app,
            commands::warmup::get_warmup_status,
            // ... 50+ commands
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run Tauri app");
}
```

### 7.2 `electron/preload.ts` + `src/types/electron.d.ts` → DIHAPUS

**Tidak perlu preload.** Tauri menyediakan API langsung dari frontend:

```typescript
// BEFORE (Electron):
const result = await window.electronAPI.getSettings();

// AFTER (Tauri):
import { invoke } from '@tauri-apps/api/core';
const result = await invoke('get_settings');
import { listen } from '@tauri-apps/api/event';
const unlisten = await listen('state-change', (event) => { ... });
```

Juga tidak perlu tipe `ElectronAPI` di `electron.d.ts`. Tauri commands sudah auto-typed via `tauri::command` + serde.

### 7.3 `electron/modules/database.ts` → `src-tauri/src/modules/database.rs`

**Electron (~499 lines):** better-sqlite3, 6 tables (settings, history, dictionary, snippets, learning_cache, presets).

**Rust target (~350 lines):**

```rust
// src-tauri/src/modules/database.rs
use rusqlite::{Connection, params};
use std::sync::Mutex;
use serde::{Serialize, Deserialize};

pub struct Database {
    conn: Mutex<Connection>,
}
```

**Mapping SQL:**

| Table | Electron | Rust |
|-------|----------|------|
| settings | `database.getSetting(key)` | `db.get_setting(key) -> Option<String>` |
| history | `addHistory()`, `getHistory()`, `searchHistory()` | Same — rusqlite |
| dictionary | `addDictionaryEntry()`, etc | Same |
| snippets | `addSnippet()`, etc | Same |
| learning_cache | `addCorrection()`, etc | Same |
| presets | `setPresets()`, `getPresets()` | Same |

**Migration data:** SQLite DB file sama format → bisa langsung dipakai. Cuma beda driver.

### 7.4 `electron/modules/transcriber.ts` → `src-tauri/src/modules/transcriber.rs`

**Electron (~1226 lines):** Whisper CLI spawn, model management, GPU detection, warmup.

**Rust target (~400 lines):**

```rust
// src-tauri/src/modules/transcriber.rs
use std::process::Command;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Transcriber {
    model_path: Mutex<Option<PathBuf>>,
    whisper_path: PathBuf,
}
```

**Key differences:**
- `child_process.spawn()` → `std::process::Command` (Rust native, lebih cepat)
- Path resolution → `app.path()` (Tauri API)
- GPU detection → stat CUDA DLL + `nvidia-smi` check
- Warmup → pre-cache file existence + model size

### 7.5 `electron/modules/pasteEngine.ts` → `src-tauri/src/modules/paste_engine.rs`

**Electron (~298 lines):** Win32 API keyboard simulation, clipboard, window focus.

**Rust (~200 lines):**

```rust
// src-tauri/src/modules/paste_engine.rs
// CRITICAL: Windows-specific Win32 API

use enigo::{Enigo, Keyboard, Settings};
use std::thread;
use std::time::Duration;

pub fn paste_text(text: &str) -> Result<(), String> {
    // 1. Save clipboard
    // 2. Set clipboard to text
    // 3. Simulate Ctrl+V
    // 4. Restore clipboard
    // 5. Return
}
```

**Implementation notes:**
- `enigo` crate untuk keyboard simulation
- `tauri-plugin-clipboard-manager` untuk clipboard
- `windows-sys` crate untuk Win32 `ShowWindow` (hide/show app before paste)
- **Ini adalah modul PALING KRUSIAL** — paste engine harus sempurna

### 7.6 `electron/modules/hotkeyManager.ts` → `src-tauri/src/modules/hotkey.rs`

**Electron (~676 lines):** uiohook-napi global key listener, state machine.

**Rust (~250 lines):**

```rust
// src-tauri/src/modules/hotkey.rs
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

pub struct HotkeyManager {
    app: AppHandle,
    // State machine: idle, recording, processing
}
```

**Implementation notes:**
- `tauri-plugin-global-shortcut` untuk register/unregister hotkey
- State machine menggunakan `RwLock<State>`
- Window show/hide via `app.get_webview_window()`
- Push-to-talk: hold hotkey → record, release → stop

### 7.7 `electron/modules/textCleaner.ts` → Rust (opsional)

**Bisa tetap di JS atau pindah ke Rust.** Karena textCleaner adalah pure string manipulation:

```rust
pub fn clean(text: &str, options: &CleanOptions) -> String { ... }
pub fn voice_commands(text: &str) -> String { ... }
pub fn smart_punctuation(text: &str) -> String { ... }
```

**Rekomendasi:** TETAP di JS (renderer side) — tidak perlu panggil Rust untuk string manipulation sederhana. Lebih cepat langsung di browser.

### 7.8 `electron/modules/audioConverter.ts` & `audioPreprocessor.ts` → Rust

**Audio processing lebih cocok di Rust:**

```rust
// src-tauri/src/modules/audio_processor.rs
use std::process::Command;

pub fn convert_to_wav(input: &Path, output: &Path) -> Result<(), String> {
    // Panggil ffmpeg dari bundled ffmpeg
}

pub fn preprocess(input: &Path, options: &PreprocessOptions) -> Result<Vec<f32>, String> {
    // HPF, LPF, noise gate, normalizer
    // Rust bisa proses audio chunk-by-chunk tanpa blocking main thread
}
```

### 7.9 `electron/modules/modelDownloader.ts` → `src-tauri/src/modules/model_downloader.rs`

**Electron (~1383 lines):** HTTP download with resume, speed limit, retry.

**Rust (~400 lines):**

```rust
// src-tauri/src/modules/model_downloader.rs
use reqwest::Client;
use tokio::io::AsyncWriteExt;
use std::sync::atomic::{AtomicBool, AtomicU64};

pub struct ModelDownloader {
    client: Client,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    downloaded_bytes: Arc<AtomicU64>,
}
```

**Key differences:**
- `reqwest` lebih mature dari Node.js `https` module
- `tokio::fs` untuk async file I/O
- Resume via `Range` header — sama seperti Electron
- **EXDEV bug tidak akan terjadi** karena Rust handle rename via `std::fs::rename`
- Temp file di `models_path/.temp/` — sudah same-drive

### 7.10 `electron/modules/fuzzyMatcher.ts` → Rust (opsional)

Sama seperti textCleaner — **bisa tetap di JS** atau pindah ke Rust.

Jika pindah ke Rust, gunakan:
```rust
pub fn suggest<'a>(word: &str, dictionary: &[DictEntry], max_results: usize) -> Vec<Suggestion> {
    // Levenshtein distance + confidence scoring
}
```

Implementasi Levenshtein di Rust:
```rust
fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    // Standard DP implementation — Rust 10x lebih cepat dari JS
}
```

### 7.11 `electron/modules/adaptiveLearning.ts` → Rust

```rust
// src-tauri/src/modules/learning.rs
pub struct AdaptiveLearning {
    db: Arc<Database>,
}

impl AdaptiveLearning {
    pub fn learn_correction(&self, original: &str, corrected: &str) -> Result<(), String> {
        // Store in learning_cache table
        // Update frequency counter
        // Recalculate confidence
    }
}
```

### 7.12 `electron/modules/confidenceScorer.ts` → Rust

```rust
pub fn score_transcription(raw: &str, cleaned: &str, audio_duration_ms: u64) -> f64 {
    // WPM check
    // Audio-to-text length ratio
    // Dictionary match ratio
    // Return 0.0 - 1.0
}
```

### 7.13 `electron/modules/modelDefinitions.ts` → Rust

```rust
// src-tauri/src/modules/model_definitions.rs
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    pub name: &'static str,
    pub url: &'static str,
    pub size_bytes: u64,
    pub language: &'static str,
    pub description: &'static str,
}

pub static AVAILABLE_MODELS: &[ModelInfo] = &[
    ModelInfo { name: "ggml-tiny.bin", url: "https://...", size_bytes: 75_000_000, language: "multilingual", description: "Fastest, least accurate" },
    // ... all models
];
```

### 7.14 `electron/modules/llmPostProcessor.ts` → Rust

```rust
// src-tauri/src/modules/llm_post_processor.rs
pub struct LlmProcessor {
    binary_path: PathBuf,
    models_path: PathBuf,
}

impl LlmProcessor {
    pub fn process(&self, text: &str, model: &str) -> Result<String, String> {
        // Spawn llama.cpp with grammar for grammar correction
        // Read stdout for processed text
        // Timeout handling
    }
}
```

### 7.15 `electron/modules/cudaDownloader.ts` → Rust

```rust
// src-tauri/src/modules/cuda_downloader.rs
pub struct CudaDownloader {
    downloader: ModelDownloader,
}

impl CudaDownloader {
    pub fn download_cuda(&self) -> Result<(), String> {
        // Download CUDA toolkit archive
        // Extract to app_data/whisper/gpu/
        // Verify DLLs
    }
}
```

### 7.16 `electron/modules/logger.ts` → Rust

```rust
use log::{Level, Log};

pub struct Logger;

impl Log for Logger {
    fn enabled(&self, metadata: &log::Metadata) -> bool { true }
    fn log(&self, record: &log::Record) {
        println!("[{}] {}", record.level(), record.args());
    }
    fn flush(&self) {}
}
```

### 7.17 `electron/modules/autoUpdater.ts` → Rust

Gunakan `tauri-plugin-updater` bawaan Tauri — lebih simple:
```rust
// tauri.conf.json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://releases.project.com/{{target}}/{{current_version}}"],
      "pubkey": "..."
    }
  }
}
```

### 7.18 `electron/modules/crashReporter.ts` → Rust

```rust
use std::panic;
use std::fs::{self, OpenOptions};
use std::io::Write;
use chrono::Local;

pub fn init_crash_reporter(log_dir: &Path) {
    panic::set_hook(Box::new(|info| {
        let crash_report = format!("CRASH at {}: {}", Local::now(), info);
        if let Ok(mut f) = OpenOptions::new().append(true).create(true).open(log_dir.join("crashes.log")) {
            writeln!(f, "{}", crash_report).ok();
        }
    }));
}

---

## 8. Phase-by-Phase Migration Plan

### Phase 0: Setup & Environment (3 hari)

```
[ ] Init project Tauri + React
[ ] Copy semua file src/ dari project lama
[ ] Setup tauri.conf.json (windows, permissions, plugins)
[ ] Setup Cargo.toml dengan semua dependencies
[ ] Setup package.json (hanya frontend deps)
[ ] Verifikasi React app bisa jalan di Tauri webview
```

### Phase 1: Core Infrastructure (5 hari)

```
[ ] Database module (rusqlite) — migrate schema + query functions
[ ] Logger module
[ ] Path utilities (modelsPath, userData, etc)
[ ] Windows module (main window + mini window)
[ ] Settings commands (get_settings, update_setting)
[ ] Test: app starts, settings load, windows show/hide
```

### Phase 2: Audio & Transcription (5 hari)

```
[ ] Audio receiver command (buffer dari JS → Rust)
[ ] Transcriber module (Whisper CLI spawn)
[ ] Audio processor (WAV conversion jika perlu)
[ ] Warmup system
[ ] GPU detection
[ ] Test: record audio → transcribe → result appears
```

### Phase 3: Output Pipeline (5 hari)

```
[ ] Paste engine (enigo + Win32 API)
[ ] Clipboard commands
[ ] TextCleaner (tetap di JS atau Rust)
[ ] FuzzyMatcher (tetap di JS atau Rust)
[ ] Confidence scorer
[ ] Adaptive learning module
[ ] LLM post-processor
[ ] Test: transcription → clean → paste ke Notepad
```

### Phase 4: Model Management (4 hari)

```
[ ] Model downloader (reqwest streaming + resume)
[ ] Model definitions
[ ] Model scanner
[ ] CUDA downloader
[ ] Speed limiter
[ ] Test: download model, pause, resume, cancel, delete
```

### Phase 5: Hotkeys & System Integration (3 hari)

```
[ ] Global shortcut plugin
[ ] Hotkey manager (state machine)
[ ] System tray
[ ] Auto-start
[ ] Single-instance lock
[ ] Test: hotkey start/stop recording, tray menu
```

### Phase 6: Remaining Features (4 hari)

```
[ ] History commands
[ ] Dictionary commands
[ ] Snippet commands
[ ] Learning commands
[ ] LLM commands
[ ] Benchmark commands
[ ] Export/import
[ ] Cache management
[ ] Auto-updater
[ ] Crash reporter
```

### Phase 7: Polish & QA (5 hari)

```
[ ] Error handling — semua Result → error string
[ ] Loading states
[ ] Events — semua listen() events syncronized
[ ] Performance testing
[ ] Memory leak testing (long recording sessions)
[ ] Edge cases: mic denied, no model, disk full
[ ] Installer testing
[ ] Full recording test checklist
```

**Total: ~34 hari kerja (~7 minggu)**

---

## 9. Testing Strategy

### Automated Tests (Rust)

```
# Unit tests — inline di setiap module
cargo test

# Test database operations
cargo test --test database_tests

# Test audio processor
cargo test --test audio_tests
```

### Manual Tests (Checklist Wajib)

Setelah setiap phase, jalankan:

**Recording:**
- [ ] Record 5 detik → teks muncul
- [ ] Record 30+ detik → tidak crash
- [ ] Cancel (Esc) → idle
- [ ] VAD auto-stop → berhenti
- [ ] Rapid records (10x) → no memory leak
- [ ] Mic denied → error message

**Paste:**
- [ ] Paste ke Notepad → text muncul
- [ ] Paste ke VS Code → text muncul
- [ ] Paste ke browser → text muncul
- [ ] Rapid paste → clipboard restored

**Model Management:**
- [ ] Download model → progress bar
- [ ] Pause/resume → correct byte offset
- [ ] Cancel → cleanup temp file
- [ ] EXDEV cross-drive → fallback sukses
- [ ] Download ulang model sama → skip/no error

**UI:**
- [ ] MiniBar show/hide/resize
- [ ] Language switch → recording pakai language baru
- [ ] Theme switch → dark/light
- [ ] Main window navigate all pages

### Regression Testing

Sebelum rilis:
```
[ ] Full test checklist dari .pi/AGENTS.md
[ ] 1 jam recording session (stress test)
[ ] 100+ transcription cycles
[ ] All settings combinations
[ ] Multi-monitor setup
[ ] High DPI display
[ ] Slow PC (4GB RAM)
[ ] Fast PC (32GB RAM + GPU)
```

---

## 10. Risks & Mitigasi

| # | Risk | Severity | Mitigasi |
|---|------|----------|----------|
| 1 | **Paste engine gagal di beberapa app** | 🔴 CRITICAL | Test di 10+ aplikasi (Notepad, VS Code, Chrome, Word, Telegram, dll). Fallback: clipboard-only paste |
| 2 | **Global hotkey conflict** | 🟠 HIGH | Default hotkey (Ctrl+Shift+Space) harus unique. Kasih opsi ganti hotkey. Unregister saat quit |
| 3 | **Audio buffer serialization overhead** | 🟡 MEDIUM | Float32Array → Vec<f32> → JSON. Untuk recording 30 detik = ~480KB data. Acceptable |
| 4 | **Whisper CLI path berbeda** | 🟡 MEDIUM | Bundled di resources, verify di warmup. Fallback ke download prompt |
| 5 | **SQLite schema mismatch** | 🟡 MEDIUM | DB migration system — version check di initialize() |
| 6 | **Windows WebView2 tidak terinstall** | 🟢 LOW | Tauri installer bisa bundle WebView2 bootstrapper. Atau fallback ke Edge WebView2 |
| 7 | **Transparent window tidak sempurna** | 🟡 MEDIUM | Tauri 2 support transparent window. Test di Windows 10 + 11, high DPI, multi-monitor |
| 8 | **uiohook-napi → rdev behavioral difference** | 🟠 HIGH | rdev mungkin beda dalam menangani key repeat, key combinations. Test semua hotkey scenario |
| 9 | **Async vs sync — Rust ownership** | 🟡 MEDIUM | Rust ownership model berbeda dari JS. Async state management perlu Arc<RwLock<>>. Pelajari pattern sebelum mulai |
| 10 | **Learning curve Rust** | 🟡 MEDIUM | Tim perlu waktu adaptasi. Phase 0-1 gunakan JS modules dulu jika urgent, Rust rewrite bertahap |

### Critical Path

Yang PALING riskan dan harus dikerjakan duluan:

1. **Audio pipeline** (recording → transcribe) — ini CORE, tanpa ini app guna
2. **Paste engine** — tanpanya, hasil transkripsi tidak bisa dipakai
3. **Hotkey** — tanpanya, user harus klik tombol setiap kali

**Saran:** Buat prototype P1 (audio + paste + hotkey) di Rust dulu. Kalau prototype sukses, lanjut full migration. Kalau tidak, evaluasi ulang.

---

## 11. Timeline & Effort

### Total Estimasi

| Phase | Duration | Dependencies | Risiko |
|-------|----------|-------------|--------|
| 0: Setup | 3 hari | None | 🟢 Low |
| 1: Core Infra | 5 hari | Phase 0 | 🟢 Low |
| 2: Audio | 5 hari | Phase 1 | 🔴 HIGH |
| 3: Output | 5 hari | Phase 2 | 🔴 HIGH |
| 4: Models | 4 hari | Phase 1 | 🟡 Medium |
| 5: Hotkeys | 3 hari | Phase 1 | 🟡 Medium |
| 6: Features | 4 hari | Phase 1-5 | 🟢 Low |
| 7: Polish | 5 hari | All Phases | 🟡 Medium |
| **Total** | **34 hari** | — | |

### Lines of Code Estimate

| Module | Electron (TypeScript) | Tauri (Rust) | Perubahan |
|--------|---------------------|--------------|-----------|
| Database | ~500 lines | ~350 lines | **Simplify** — no async needed |
| Transcriber | ~1226 lines | ~400 lines | **Simplify** — hanya spawn |
| Paste Engine | ~298 lines | ~200 lines | **Simplify** — enigo crate |
| Hotkey Manager | ~676 lines | ~250 lines | **Simplify** — plugin |
| Model Downloader | ~1383 lines | ~400 lines | **Simplify** — reqwest |
| Main/Root | ~953 lines | ~200 lines | **Simplify** |
| Preload | ~408 lines | **DIHAPUS** 🗑️ | **Eliminate** |
| Electron API types | ~350 lines | **DIHAPUS** 🗑️ | **Eliminate** |
| Total Backend | ~5800 lines | ~1800 lines | **~3x lebih sedikit** |

### Resource Requirements

- **1 Rust developer** (intermediate) — familiar dengan async, serde, ownership
- **1 tester** — untuk recording + paste testing di berbagai environment
- **1 minggu buffer** — untuk unexpected issues (terutama paste engine dan audio pipeline)

---

## 12. Appendix: Boilerplate Code

### 12.1 `Cargo.toml`

```toml
[package]
name = "voiceflow"
version = "2.0.0"
edition = "2021"

[lib]
name = "voiceflow_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-updater = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
reqwest = { version = "0.12", features = ["stream", "json"] }
tokio = { version = "1", features = ["full"] }
enigo = "0.2"
rdev = "0.6"
chrono = "0.4"
log = "0.4"
env_logger = "0.11"
uuid = { version = "1", features = ["v4"] }
thiserror = "1"
anyhow = "1"
tar = "0.4"
flate2 = "1"
```

### 12.2 `tauri.conf.json` (key sections)

```json
{
  "productName": "VoiceFlow",
  "version": "2.0.0",
  "identifier": "com.voiceflow.app",
  "build": {
    "frontendDist": "../dist",
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173"
  },
  "app": {
    "windows": [
      {
        "title": "VoiceFlow",
        "label": "main",
        "url": "/",
        "width": 1200,
        "height": 900,
        "decorations": false,
        "resizable": true
      },
      {
        "title": "VoiceFlow Mini",
        "label": "mini",
        "url": "/#mini",
        "width": 380,
        "height": 52,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "visible": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* https://api.iconify.design; img-src 'self' data: https://api.iconify.design; font-src 'self' data:;"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "resources/icons/32x32.png",
      "resources/icons/128x128.png",
      "resources/icons/icon.ico"
    ],
    "resources": [
      "resources/whisper/**/*"
    ]
  },
  "plugins": {
    "updater": {
      "active": true
    },
    "shell": {
      "open": true,
      "scope": [
        {
          "name": "whisper",
          "cmd": "whisper-cli",
          "args": true
        }
      ]
    }
  }
}
```

### 12.3 Example Tauri Command (settings.rs)

```rust
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::modules::database::Database;

#[derive(Serialize, Deserialize)]
pub struct ApiResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResult<T> {
    pub fn ok(data: T) -> Self { Self { success: true, data: Some(data), error: None } }
    pub fn err(msg: impl ToString) -> Self { Self { success: false, data: None, error: Some(msg.to_string()) } }
}

#[tauri::command]
pub async fn get_settings(db: State<'_, Database>) -> Result<ApiResult<Vec<(String, String)>>, String> {
    let settings = db.get_all_settings().map_err(|e| e.to_string())?;
    Ok(ApiResult::ok(settings))
}

#[tauri::command]
pub async fn update_setting(db: State<'_, Database>, key: String, value: String) -> Result<ApiResult<()>, String> {
    db.update_setting(&key, &value).map_err(|e| e.to_string())?;
    Ok(ApiResult::ok(()))
}
```

### 12.4 Event Emitter Pattern (Rust → JS)

```rust
// Rust: emit event ke frontend
use tauri::{Emitter, AppHandle};

pub fn emit_state_change(app: &AppHandle, state: &str) {
    let _ = app.emit("state-change", state);
}

// Frontend: listen event
// import { listen } from '@tauri-apps/api/event';
// const unlisten = await listen('state-change', (event) => {
//   setState(event.payload);
// });
```

### 12.5 `package.json` (frontend only — simplified)

```json
{
  "name": "voiceflow",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-clipboard-manager": "^2",
    "@tauri-apps/plugin-shell": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@iconify/react": "^6.0.2",
    "i18next": "^26.3.6",
    "i18next-browser-languagedetector": "^8.2.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-i18next": "^17.0.9",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.2",
    "vite": "^5.3.1"
  }
}
```

### 12.6 Folder Structure Template

```
project-baru/
├── src/                          # REACT FRONTEND (copy from old project)
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── utils/
│   ├── styles/
│   ├── types/
│   │   └── tauri.d.ts            # NEW: Tauri command types (instead of electron.d.ts)
│   └── ...
├── src-tauri/                    # RUST BACKEND (new)
│   ├── src/
│   │   ├── main.rs               # App entry
│   │   ├── lib.rs                 # Library root
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── dictation.rs
│   │   │   ├── settings.rs
│   │   │   ├── models.rs
│   │   │   ├── clipboard.rs
│   │   │   ├── gpu.rs
│   │   │   ├── llm.rs
│   │   │   ├── learning.rs
│   │   │   ├── history.rs
│   │   │   ├── snippet.rs
│   │   │   ├── dictionary.rs
│   │   │   ├── benchmark.rs
│   │   │   ├── warmup.rs
│   │   │   └── app.rs
│   │   ├── modules/
│   │   │   ├── mod.rs
│   │   │   ├── database.rs
│   │   │   ├── transcriber.rs
│   │   │   ├── paste_engine.rs
│   │   │   ├── hotkey.rs
│   │   │   ├── model_downloader.rs
│   │   │   ├── model_definitions.rs
│   │   │   ├── audio_processor.rs
│   │   │   ├── text_cleaner.rs     # Opsional — tetap JS atau Rust
│   │   │   ├── fuzzy_matcher.rs    # Opsional
│   │   │   ├── learning.rs
│   │   │   ├── llm_processor.rs
│   │   │   ├── cuda_downloader.rs
│   │   │   ├── confidence_scorer.rs
│   │   │   ├── logger.rs
│   │   │   └── window_manager.rs
│   │   └── utils/
│   │       ├── mod.rs
│   │       └── models_path.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json
│   └── icons/
├── resources/
│   ├── whisper/
│   │   ├── cpu/
│   │   │   └── whisper-cli.exe
│   │   └── models/
│   └── icons/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

### 12.7 Cheatsheet: Electron → Tauri API Mapping

| Electron | Tauri |
|----------|-------|
| `ipcRenderer.invoke('channel', arg)` | `invoke('command_name', { arg })` |
| `ipcRenderer.on('event', handler)` | `listen('event', handler)` |
| `contextBridge.exposeInMainWorld()` | **Tidak perlu** — langsung `invoke()` |
| `BrowserWindow` | `WebviewWindow` / `app.get_webview_window()` |
| `app.getPath('userData')` | `app.path().app_data_dir()` |
| `nativeImage` | `tauri::image::Image` |
| `clipboard.writeText()` | `clipboard.write_text()` via plugin |
| `dialog.showOpenDialog()` | `dialog.open()` via plugin |
| `globalShortcut.register()` | `global_shortcut.register()` via plugin |
| `shell.openExternal()` | `shell.open()` via plugin |
| `process.env.NODE_ENV` | `cfg!(debug_assertions)` (Rust) / `import.meta.env.DEV` (JS) |
| `__dirname` | `app.path().resource_dir()` |
| `require()` / `import` | `use tauri::State` + managed state |
| `new BrowserWindow({ transparent: true })` | `{ transparent: true }` di tauri.conf.json |
| `win.setAlwaysOnTop(true)` | `{ alwaysOnTop: true }` di tauri.conf.json |
| `app.on('before-quit')` | `on_window_event(WindowEvent::Destroyed)` atau `app.on_drop()` |

---

## Kata Penutup

Migrasi ini layak dilakukan untuk:
- **Installer 20x lebih kecil** — dari 200MB ke 10MB
- **RAM 3x lebih hemat** — dari 150MB ke 50MB
- **Startup 5x lebih cepat** — dari 3 detik ke 500ms
- **Zero node_modules** — dari 30.000 files ke ~100 files Rust
- **Safety** — Rust memory safety mencegah memory leak (masalah umum di JS audio apps)

**Tapi:**
- **Butuh waktu ~7 minggu** full-time
- **Paste engine adalah make-or-break** — pastikan testing di 10+ apps
- **Audio pipeline harus di-test manual** setiap perubahan
- **Frontend tetap 100% sama** — user tidak akan lihat perbedaan