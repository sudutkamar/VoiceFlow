# VoiceFlow Migration Plan: Electron → Tauri

**Date:** 2026-07-19  
**Status:** PLANNING — Belum mulai implementasi  
**Target:** VoiceFlow v2.0 dengan Tauri 2 + React 19 + Rust

---

## Table of Contents

1. [Kenapa Migrasi?](#1-kenapa-migrasi)
2. [Perbandingan Sebelum vs Sesudah](#2-perbandingan-sebelum-vs-sesudah)
3. [Technology Stack Baru](#3-technology-stack-baru)
4. [Arsitektur Baru](#4-arsitektur-baru)
5. [Migration Map: File per File](#5-migration-map-file-per-file)
6. [Risiko & Mitigasi](#6-risiko--mitigasi)
7. [Phase-by-Phase Plan](#7-phase-by-phase-plan)
8. [Timeline & Effort](#8-timeline--effort)
9. [My Honest Opinion](#9-my-honest-opinion)

---

## 1. Kenapa Migrasi?

### Masalah Electron untuk VoiceFlow

```
Electron bundling CHROMIUM sendiri di dalam aplikasi:
├── Chromium = ~120MB (browser engine lengkap)
├── Node.js = ~40MB (backend runtime)
├── Aplikasi VoiceFlow = ~40MB (kode kita)
└── TOTAL = ~200MB installer, ~150MB RAM idle

Padahal VoiceFlow CUMA butuh:
├── WebView untuk render React UI
├── Backend untuk audio + whisper + sqlite
└── Tidak perlu browser engine lengkap!
```

### Keuntungan Tauri untuk VoiceFlow

| Aspek | Electron (Now) | Tauri (After) | Improvement |
|-------|----------------|---------------|-------------|
| **Installer size** | ~200MB | ~5-10MB | **20x lebih kecil** |
| **RAM idle** | ~150MB | ~30-50MB | **3x lebih ringan** |
| **RAM recording** | ~200MB | ~60-80MB | **2.5x lebih ringan** |
| **Startup time** | 2-3 detik | <500ms | **4-6x lebih cepat** |
| **Backend language** | JavaScript | Rust | **Lebih cepat, memory-safe** |
| **Audio processing** | JS (single-thread) | Rust (multi-thread) | **Parallel processing** |
| **Security** | Loose sandbox | Strict sandbox | **Lebih aman** |
| **Cross-platform** | Windows only | Windows + Linux + macOS | **Multi-platform** |
| **Distribution** | NSIS installer 200MB | Bundled exe 5MB | **Mudah share** |

### Kenapa VoiceFlow Cocok untuk Tauri

```
✅ Audio recording → Web Audio API (sama di Tauri)
✅ Whisper CLI → spawn process (sama di Tauri)
✅ SQLite → rusqlite (lebih cepat dari better-sqlite3)
✅ Global hotkey → tauri-plugin-global-shortcut
✅ Clipboard → tauri-plugin-clipboard-manager
✅ Transparent window → Tauri 2 support
✅ Always-on-top → Tauri 2 support

❌ Tidak ada fitur yang TIDAK BISA dilakukan Tauri
```

---

## 2. Perbandingan Sebelum vs Sesudah

### Installer

```
SEBELUM (Electron):
voiceflow-setup-1.0.0.exe = 198 MB

SESUDAH (Tauri):
voiceflow-setup-2.0.0.exe = 8 MB

→ User bisa download dalam 5 detik (vs 2 menit)
```

### Memory Usage

```
SEBELUM (Electron):
├── Idle:     ████████████████████░░░░░░░░░░ 150MB
├── Recording: ████████████████████████████░░ 200MB
└── Peak:     ██████████████████████████████ 250MB

SESUDAH (Tauri):
├── Idle:     ██████░░░░░░░░░░░░░░░░░░░░░░░░ 40MB
├── Recording: ████████████░░░░░░░░░░░░░░░░░░ 80MB
└── Peak:     ████████████████░░░░░░░░░░░░░░ 120MB

→ Hemat 100-130MB RAM (bisa jalan di PC low-end)
```

### Startup Time

```
SEBELUM (Electron):
[Double-click] → [Loading...] → [3 detik] → [App ready]

SESUDAH (Tauri):
[Double-click] → [< 500ms] → [App ready]

→ Terasa "instant" bagi user
```

---

## 3. Technology Stack Baru

### Stack Comparison

| Layer | Electron (Now) | Tauri (After) | Notes |
|-------|----------------|---------------|-------|
| **Desktop Framework** | Electron 31 | Tauri 2 | Framework baru |
| **Frontend** | React 18 | React 19 | Upgrade minor |
| **Language (Frontend)** | TypeScript 5.5 | TypeScript 5.8 | Upgrade |
| **Language (Backend)** | JavaScript/Node.js | **Rust** | Total rewrite backend |
| **Build Tool** | Vite 5 | Vite 6 | Upgrade |
| **Database** | better-sqlite3 | **rusqlite** (Rust) | Rewrite |
| **Audio Recording** | ScriptProcessorNode | **AudioWorklet** | Modern API |
| **Whisper Integration** | child_process.spawn | **tauri::command** + spawn | Adaptasi |
| **Global Hotkey** | uiohook-napi | **tauri-plugin-global-shortcut** | Plugin bawaan |
| **Clipboard** | electron clipboard | **tauri-plugin-clipboard-manager** | Plugin bawaan |
| **File System** | fs (Node.js) | **tauri-plugin-fs** | Plugin bawaan |
| **Dialog (file picker)** | electron dialog | **tauri-plugin-dialog** | Plugin bawaan |
| **HTTP Client** | fetch / axios | **reqwest** (Rust) | Lebih cepat |
| **Notification** | electron notification | **tauri-plugin-notification** | Plugin bawaan |
| **Auto Update** | electron-updater | **tauri-plugin-updater** | Plugin bawaan |
| **Logging** | Custom Logger | **tauri-plugin-log** | Plugin bawaan |
| **Icons** | @iconify/react | @iconify/react | Sama |
| **Validation** | Zod | Zod | Sama |
| **i18n** | i18next | i18next | Sama |

### Rust Dependencies (Backend)

```toml
# Cargo.toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "window-all"] }
tauri-plugin-shell = "2"
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-notification = "2"
tauri-plugin-updater = "2"
tauri-plugin-log = "2"
rusqlite = { version = "0.31", features = ["bundled"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio = { version = "1", features = ["full"] }
chrono = "0.4"
uuid = { version = "1", features = ["v4"] }
log = "0.4"
anyhow = "1"
```

---

## 4. Arsitektur Baru

### Current Architecture (Electron)

```
┌─────────────────────────────────────────────┐
│              RENDERER (Chromium)             │
│  React 18 + TypeScript                      │
│  State: useState × 20+                      │
│  VAD: useVad() inline                       │
│  Recording: useRecorder() hook              │
│  Styling: CSS variables + glassmorphism     │
│  Routing: window.location.hash              │
└──────────────────────┬──────────────────────┘
                       │ IPC (80+ channels)
┌──────────────────────┴──────────────────────┐
│           MAIN PROCESS (Node.js)            │
│  main.ts (700+ lines)                       │
│  15 modules, 5 IPC files                    │
│  SQLite via better-sqlite3                  │
│  Whisper CLI via child_process              │
│  PasteEngine via robotjs                    │
└─────────────────────────────────────────────┘
```

### New Architecture (Tauri)

```
┌─────────────────────────────────────────────┐
│              WEBVIEW (System WebView2)       │
│  React 19 + TypeScript                      │
│  State: Zustand                             │
│  VAD: AdaptiveVAD (proper implementation)   │
│  Recording: useRecorder() hook              │
│  Styling: CSS variables + glassmorphism     │
│  Routing: React Router v6                   │
└──────────────────────┬──────────────────────┘
                       │ Tauri Commands (type-safe)
┌──────────────────────┴──────────────────────┐
│              CORE (Rust)                     │
│  src-tauri/src/                             │
│  ├── main.rs           (app entry)          │
│  ├── commands/         (IPC handlers)       │
│  │   ├── dictation.rs  (recording + STT)    │
│  │   ├── settings.rs   (settings CRUD)      │
│  │   ├── model.rs      (model management)   │
│  │   ├── history.rs    (history ops)        │
│  │   ├── snippet.rs    (snippets + dict)    │
│  │   ├── llm.rs        (LLM post-process)   │
│  │   ├── clipboard.rs  (copy/paste)         │
│  │   └── gpu.rs        (CUDA management)    │
│  ├── db/               (SQLite via rusqlite)│
│  │   ├── mod.rs        (connection pool)    │
│  │   ├── settings.rs   (settings queries)   │
│  │   ├── history.rs    (history queries)    │
│  │   └── dictionary.rs (dictionary queries) │
│  ├── audio/            (audio processing)   │
│  │   ├── recorder.rs   (mic capture)        │
│  │   ├── vad.rs        (voice detection)    │
│  │   └── converter.rs  (format conversion)  │
│  ├── whisper/          (STT engine)         │
│  │   ├── mod.rs        (process management) │
│  │   └── transcriber.rs (inference)         │
│  ├── paste/            (auto-paste)         │
│  │   └── engine.rs     (clipboard + paste)  │
│  └── utils/            (shared utilities)   │
│      ├── logger.rs     (logging)            │
│      ├── hotkey.rs     (global hotkeys)     │
│      └── updater.rs    (auto-update)        │
└─────────────────────────────────────────────┘
```

### IPC Pattern Change

```
ELECTRON (current):
  // preload.ts
  ipcRenderer.invoke('get-settings')
  ipcRenderer.send('audio-recorded', buffer)
  ipcRenderer.on('transcript-ready', callback)

TAURI (new):
  // frontend
  import { invoke } from '@tauri-apps/api/core';
  const settings = await invoke('get_settings');
  await invoke('send_audio_data', { buffer, mimeType, duration });
  
  // Rust backend
  #[tauri::command]
  fn get_settings(db: State<'_, Database>) -> Result<Settings, String> { ... }
```

**Kelebihan Tauri IPC:**
- Type-safe (Rust → TypeScript codegen)
- No preload script needed
- Smaller payload (no Chromium serialization overhead)
- Built-in error handling

---

## 5. Migration Map: File per File

### Frontend (src/) — Minimal Changes

```
src/                          →  src/
├── App.tsx                   →  App.tsx (add React Router)
├── main.tsx                  →  main.tsx (Tauri init)
├── components/
│   ├── AppContent.tsx        →  AppContent.tsx (React Router)
│   ├── MiniBar/              →  MiniBar/ (NO CHANGE)
│   ├── VerticalMiniBar.tsx   →  VerticalMiniBar.tsx (NO CHANGE)
│   ├── ErrorBoundary.tsx     →  ErrorBoundary.tsx (NO CHANGE)
│   └── Notification.tsx      →  Notification.tsx (NO CHANGE)
├── pages/
│   ├── Models.tsx            →  Models.tsx (change IPC calls)
│   ├── History.tsx           →  History.tsx (change IPC calls)
│   ├── Benchmark.tsx         →  Benchmark.tsx (change IPC calls)
│   ├── LlmModels.tsx         →  LlmModels.tsx (change IPC calls)
│   └── Settings/             →  Settings/ (change IPC calls)
├── hooks/
│   └── useRecorder.ts        →  useRecorder.ts (change IPC calls)
├── utils/
│   ├── wavRecorder.ts        →  wavRecorder.ts (NO CHANGE - Web Audio API)
│   ├── adaptiveVAD.ts        →  adaptiveVAD.ts (REWRITE - proper impl)
│   ├── audio.ts              →  audio.ts (NO CHANGE)
│   ├── constants.ts          →  constants.ts (NO CHANGE)
│   ├── errorHandler.ts       →  errorHandler.ts (NO CHANGE)
│   ├── icons.tsx             →  icons.tsx (NO CHANGE)
│   ├── languages.ts          →  languages.ts (NO CHANGE)
│   ├── micDetector.ts        →  micDetector.ts (NO CHANGE)
│   └── soundEffects.ts       →  soundEffects.ts (NO CHANGE)
├── styles/                   →  styles/ (NO CHANGE)
├── types/
│   ├── electron.d.ts         →  tauri.d.ts (REWRITE - Tauri types)
│   └── vite-env.d.ts         →  vite-env.d.ts (NO CHANGE)
└── i18n/
    └── index.ts              →  index.ts (NO CHANGE)
```

**Total frontend files changed: ~15 files (IPC calls only)**  
**Total frontend files unchanged: ~25 files**

### Backend (electron/ → src-tauri/) — Full Rewrite

```
electron/                     →  src-tauri/src/
├── main.ts (700 lines)       →  main.rs (200 lines) ✨
├── preload.ts (500 lines)    →  (DELETED - not needed)
├── ipc/
│   ├── dictation.ipc.ts      →  commands/dictation.rs
│   ├── model.ipc.ts          →  commands/model.rs
│   ├── settings.ipc.ts       →  commands/settings.rs
│   ├── snippet.ipc.ts        →  commands/snippet.rs
│   ├── llm.ipc.ts            →  commands/llm.rs
│   └── engine.ipc.ts         →  commands/gpu.rs
├── modules/
│   ├── recorder.ts           →  audio/recorder.rs
│   ├── transcriber.ts        →  whisper/transcriber.rs
│   ├── database.ts           →  db/mod.rs + db/*.rs
│   ├── pasteEngine.ts        →  paste/engine.rs
│   ├── hotkeyManager.ts      →  utils/hotkey.rs
│   ├── modelDownloader.ts    →  commands/model.rs
│   ├── cudaDownloader.ts     →  commands/gpu.rs
│   ├── audioConverter.ts     →  audio/converter.rs
│   ├── audioPreprocessor.ts  →  audio/preprocessor.rs
│   ├── textCleaner.ts        →  utils/text_cleaner.rs
│   ├── fuzzyMatcher.ts       →  utils/fuzzy_matcher.rs
│   ├── confidenceScorer.ts   →  utils/confidence_scorer.rs
│   ├── adaptiveLearning.ts   →  utils/adaptive_learning.rs
│   ├── llmPostProcessor.ts   →  commands/llm.rs
│   ├── modelDefinitions.ts   →  utils/model_definitions.rs
│   ├── autoUpdater.ts        →  (tauri-plugin-updater)
│   ├── crashReporter.ts      →  (tauri-plugin-log)
│   └── logger.ts             →  utils/logger.rs
└── utils/
    ├── levenshtein.ts        →  utils/levenshtein.rs
    └── modelsPath.ts         →  utils/models_path.rs
```

**Total backend files: ~30 Rust files (full rewrite)**

### Config Files

```
CHANGE                        →  NEW
──────────────────────────────  ──────────────────────────────
package.json                  →  package.json (remove electron deps)
vite.config.ts                →  vite.config.ts (add Tauri plugin)
tsconfig.json                 →  tsconfig.json (minor changes)
electron-builder.yml          →  (DELETED)
electron/                     →  (DELETED)
                              →  src-tauri/Cargo.toml (NEW)
                              →  src-tauri/tauri.conf.json (NEW)
                              →  src-tauri/src/main.rs (NEW)
                              →  src-tauri/build.rs (NEW)
```

---

## 6. Risiko & Mitigasi

### High Risk

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Audio recording breaks** | 🔴 CRITICAL | Medium | Test AudioWorklet di WebView2 sebelum rewrite |
| **Transparent window issues** | 🟠 HIGH | Medium | Test Tauri 2 transparent window early |
| **Rust learning curve** | 🟡 MEDIUM | High | Start with simple commands, iterate |
| **Whisper CLI spawn issues** | 🟠 HIGH | Low | Same spawn mechanism, test early |
| **SQLite migration** | 🟡 MEDIUM | Low | rusqlite is mature, API similar |

### Medium Risk

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **IPC serialization issues** | 🟡 MEDIUM | Medium | Use serde for type-safe serialization |
| **Global hotkey conflicts** | 🟡 MEDIUM | Low | tauri-plugin-global-shortcut is battle-tested |
| **Clipboard paste issues** | 🟡 MEDIUM | Medium | Test paste engine thoroughly |
| **Model download flow** | 🟡 MEDIUM | Low | Rewrite reqwest-based downloader |

### Low Risk

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **CSS rendering differences** | 🟢 LOW | Low | WebView2 uses same Chromium engine |
| **i18n issues** | 🟢 LOW | Very Low | i18next works in any browser |
| **Icon rendering** | 🟢 LOW | Very Low | Iconify works everywhere |

---

## 7. Phase-by-Phase Plan

### Phase 0: Preparation (Week 1)

```
Tasks:
├── Setup Tauri 2 project skeleton
├── Verify AudioWorklet works in WebView2
├── Verify transparent window works
├── Verify global shortcut works
├── Test whisper-cli spawn from Rust
└── Benchmark: Tauri vs Electron memory usage

Deliverable: Working Tauri skeleton with basic recording
```

### Phase 1: Core Backend (Week 2-3)

```
Tasks:
├── Setup rusqlite database (settings, history, dictionary, snippets)
├── Implement dictation command (recording + transcription)
├── Implement paste engine in Rust
├── Implement model management (download, delete, list)
├── Implement CUDA/GPU management
├── Implement text processing pipeline (cleaner, fuzzy, confidence)
└── Implement adaptive learning

Deliverable: All backend features working via Tauri commands
```

### Phase 2: Frontend Adaptation (Week 3-4)

```
Tasks:
├── Replace electronAPI calls with invoke()
├── Update useRecorder hook for Tauri
├── Update MiniBar for Tauri commands
├── Update all pages (Models, History, Settings, Benchmark)
├── Update LLM post-processing page
├── Add Zustand for settings caching
└── Update type definitions

Deliverable: All frontend features working with Tauri backend
```

### Phase 3: Polish & Testing (Week 5)

```
Tasks:
├── Fix transparent window behavior
├── Fix always-on-top layering
├── Fix tray icon behavior
├── Test recording pipeline end-to-end
├── Test paste engine with various apps
├── Test model download flow
├── Test CUDA/GPU detection
├── Performance profiling
└── Memory leak testing

Deliverable: Production-ready VoiceFlow v2.0
```

### Phase 4: Distribution (Week 6)

```
Tasks:
├── Setup Tauri bundler (NSIS installer)
├── Code signing certificate
├── Auto-update configuration
├── Test installer on clean Windows
├── Test upgrade from v1.x
└── Documentation

Deliverable: Distributable VoiceFlow v2.0 installer
```

---

## 8. Timeline & Effort

### Conservative Estimate

```
Phase 0: Preparation       ████████░░░░░░░░░░░░░░░░  1 week
Phase 1: Core Backend      ████████████████░░░░░░░░  2 weeks
Phase 2: Frontend Adapt    ████████████░░░░░░░░░░░░  1.5 weeks
Phase 3: Polish & Test     ████████░░░░░░░░░░░░░░░░  1 week
Phase 4: Distribution      ████░░░░░░░░░░░░░░░░░░░░  0.5 weeks
                            ─────────────────────────
                            TOTAL: ~6 weeks
```

### Optimistic Estimate (If Rust experience)

```
Phase 0: Preparation       ████░░░░░░░░░░░░░░░░░░░░  3 days
Phase 1: Core Backend      ████████░░░░░░░░░░░░░░░░  1 week
Phase 2: Frontend Adapt    ██████░░░░░░░░░░░░░░░░░░  1 week
Phase 3: Polish & Test     ████░░░░░░░░░░░░░░░░░░░░  4 days
Phase 4: Distribution      ██░░░░░░░░░░░░░░░░░░░░░░  2 days
                            ─────────────────────────
                            TOTAL: ~3.5 weeks
```

### Worst Case (Rust learning + issues)

```
TOTAL: ~10 weeks
```

---

## 9. My Honest Opinion

### Apakah VoiceFlow HARUS migrasi ke Tauri?

**Jawaban jujur: TIDAK HARUS, tapi SANGAT DISARANKAN untuk v2.0.**

### Kenapa?

#### ✅ Arguments FOR migrating

1. **Ukuran installer 20x lebih kecil** — User bisa share VoiceFlow via WhatsApp/Telegram langsung
2. **RAM 3x lebih hemat** — Bisa jalan di PC/laptop low-end sekalipun
3. **Startup 4-6x lebih cepat** — Terasa "instant" bagi user
4. **Rust backend** — Lebih cepat untuk audio processing, memory-safe
5. **Cross-platform** — Bisa target Linux dan macOS juga
6. **Modern stack** — Tauri 2 + React 19 + Rust = stack paling modern 2026
7. **Better security** — Sandbox lebih ketat dari Electron

#### ❌ Arguments AGAINST migrating (sekarang)

1. **VoiceFlow v1.0 SUDAH WORKING** — Recording pipeline sudah tested, Mini Bar sudah polished
2. **Effort besar** — 6 minggu minimum untuk rewrite
3. **Rust learning curve** — Kalau belum familiar Rust, tambah 2-4 minggu
4. **Regression risk** — Banyak fitur yang harus di-test ulang
5. **ROI question** — Apakah user peduli 200MB vs 5MB? Mungkin tidak.

### Rekomendasi Final

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   VoiceFlow v1.x (Electron) → FIX VAD BUG → RELEASE        │
│                                                             │
│   VoiceFlow v2.0 (Tauri)    → FULL REWRITE → RELEASE       │
│                                                             │
│   Timeline:                                                 │
│   ├── Now:     Fix VAD bug + polish v1.x (1-2 weeks)       │
│   ├── Month 2: Start Tauri v2.0 development                 │
│   ├── Month 3: v2.0 beta release                            │
│   └── Month 4: v2.0 stable release                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Kenapa Begitu?

1. **Fix VAD bug dulu** — Karena ini critical bug yang bikin user frustrasi
2. **Release v1.x yang solid** — User sudah menunggu, jangan delay
3. **Mulai v2.0 di paralel** — Bisa development di branch terpisah
4. **Release v2.0 sebagai upgrade** — User existing bisa upgrade ke v2.0

### Cost-Benefit Summary

```
Cost of migration:
├── 6 minggu development time
├── Risk of regression bugs
├── Need to learn Rust (if not familiar)
└── Testing effort

Benefit of migration:
├── 20x smaller installer (200MB → 10MB)
├── 3x less RAM (150MB → 50MB)
├── 4x faster startup (3s → <500ms)
├── Cross-platform support
├── Better security
├── Modern tech stack
└── Better user experience on low-end PCs

Verdict: BENEFITS > COSTS for long-term product
```

---

## Appendix A: Quick Start (Tauri Setup)

```bash
# 1. Install Tauri CLI
npm install -g @tauri-apps/cli

# 2. Create Tauri project
npm create tauri-app@latest voiceflow-v2

# 3. Choose stack
# → React + TypeScript
# → Package manager: npm

# 4. Install dependencies
cd voiceflow-v2
npm install

# 5. Run dev server
npm run tauri dev

# 6. Build for production
npm run tauri build
```

## Appendix B: Tauri Config Example

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-config-schema/schema.json",
  "productName": "VoiceFlow",
  "version": "2.0.0",
  "identifier": "com.voiceflow.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "VoiceFlow",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "decorations": false,
        "transparent": false
      },
      {
        "label": "mini",
        "title": "VoiceFlow Mini",
        "width": 380,
        "height": 52,
        "resizable": true,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "visible": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ipc: http://ipc.localhost; img-src 'self' data: https://api.iconify.design"
    }
  },
  "plugins": {
    "shell": {
      "open": true
    },
    "global-shortcut": {
      "enabled": true
    },
    "updater": {
      "active": true,
      "endpoints": ["https://releases.voiceflow.app/{{target}}/{{arch}}/{{current_version}}"],
      "pubkey": "..."
    }
  }
}
```

---

*Generated by audit session 2026-07-19*
