# VoiceFlow Project Guidelines

Ini adalah project **VoiceFlow** — aplikasi voice-to-text lokal berbasis Electron + React + TypeScript.

---

## Wajib — Baca & Gunakan Skill Berikut

Setiap kali bekerja di project ini, **WAJIB** membaca dan mengikuti instruksi dari skill-skill ini:

### 1. voiceflow-changelog
📌 **WAJIB** — Baca skill ini di setiap session.
- Tracking semua perubahan file
- Update `session-handoff.md`
- Catat decisions & technical debt
- Commit dengan format terstruktur

### 2. voiceflow-electron
📌 **WAJIB** — Baca skill ini saat mengerjakan:
- IPC communication
- Window management
- Preload scripts
- Build configuration
- Electron main process

### 3. voiceflow-audio
📌 **WAJIB** — Baca skill ini saat mengerjakan:
- Whisper model integration
- VAD / recording pipeline
- AudioWorkletProcessor
- Performance optimization

---

## Arsitektur UI

### Component Tree
```
App.tsx
├── MiniBar (mini mode — #hash mini)
│   ├── Language selector (cycle ID/EN/JA/KO/ZH)
│   ├── Mic button (record/stop)
│   ├── Waveform canvas (recording visualization)
│   ├── Cancel button (Esc)
│   ├── Copy/Settings button
│   ├── Paste/History button
│   └── Tooltips (result, partial, error, warnings)
│
├── VerticalMiniBar (mini mode — vertical orientation)
│   └── Sama seperti MiniBar tapi layout vertikal
│
├── MainApp (full mode)
│   ├── TitleBar (drag-able, dengan minimize/maximize/close)
│   ├── Sidebar (navigasi: record, models, history, benchmark, settings)
│   └── Content area (page routing dengan Suspense)
│       ├── HomePage — recording utama dengan visualizer
│       ├── Models — download & manage AI models
│       ├── History — riwayat transkripsi
│       ├── Benchmark — test model speed
│       └── Settings — konfigurasi aplikasi
│
└── Notification system (toast notifications via context)
```

### State Management
**Tidak ada Redux/Zustand** — state dikelola via:
- `useState` + `useEffect` per component
- `useRecorder` hook (custom hook untuk recording lifecycle)
- Context API untuk Notification system
- Settings di-load via IPC `electronAPI.getSettings()`
- Settings disimpan di SQLite via main process

### Pages Detail

| Page | File | Fitur Utama |
|------|------|-------------|
| **Home** | `src/App.tsx:641` | Mic button, waveform visualizer, confidence score, diff view (raw → cleaned), copy/paste actions |
| **Models** | `src/pages/Models.tsx` | List available models, download progress, pause/resume/cancel, delete model, scan folder, select active model |
| **History** | `src/pages/History.tsx` | Date-grouped list (Today/Yesterday/This Week/Earlier), search, copy, delete, export |
| **Benchmark** | `src/pages/Benchmark.tsx` | Test multiple models against sample audio, compare speed & accuracy, WPM tracking |
| **Settings** | `src/pages/Settings.tsx` | 7 tabs: General, Recording, Processing, Presets, Dictionary, Snippets, Adaptive Learning |

### Pages Mode vs Mini Mode
- **Main window** (`#/`): Full app dengan sidebar navigasi
- **Mini window** (`#mini`): Floating bar di atas semua aplikasi
  - Horizontal mode (default): `mini-bar` class
  - Vertical mode: `VerticalMiniBar` component (setting `mini_bar_orientation`)
- Mode ditentukan dari URL hash: `window.location.hash === '#mini'`

---

## UI Components

| Component | File | Fungsi |
|-----------|------|--------|
| **Notification** | `src/components/Notification.tsx` | Toast notification dengan auto-dismiss, dedup, 4 types (success/error/warning/info) |
| **VerticalMiniBar** | `src/components/VerticalMiniBar.tsx` | Vertical floating bar untuk recording, inline styles |
| **Iconify** | `src/utils/icons.tsx` | SVG icon system dengan icon names: record, models, history, benchmark, settings, minimize, maximize, closeWindow, chevronLeft, chevronRight |

---

## Styling System

### Dark/Light Theme
- **Default**: Dark mode via CSS variables di `:root`
- **Light mode**: Class `.light-theme` di `<html>`
- Theme disimpan di settings (`settings.theme`)
- CSS variables di `src/styles/app.css` dan `src/styles/global.css`
- **app.css**: Main app styles (~4900 lines) — layout, title bar, sidebar, pages, buttons, mic button, waveform
- **global.css**: Fallback styles (~1334 lines) — basic layout, header
- **modern.css**: Additional modern UI polish

### CSS Variables (app.css)
```
--bg, --bg-card, --bg-glass, --bg-hover, --bg-active
--accent, --accent-hover, --accent-glow, --accent-gradient
--success, --error
--text, --text-dim, --text-muted
--border, --border-glass
--shadow, --shadow-glass, --shadow-glass-lg
--blur, --blur-heavy
--radius, --radius-sm, --radius-lg, --radius-full
--transition, --transition-fast, --transition-spring
--sidebar-width, --sidebar-expanded
--title-height
--glass-bg, --glass-border, --glass-shadow
```

### Glassmorphism Design
- `backdrop-filter: blur(20px)` untuk efek glass
- Gradient accents (`--accent-gradient`)
- Shadow layering
- Border transparan (`rgba(255, 255, 255, 0.08)`)

---

## Data Layer

### SQLite (better-sqlite3)
- Database di `electron/modules/database.ts`
- Tables: settings, history, dictionary, snippets, learning_cache
- Semua query via main process, di-expose lewat IPC

### IPC Channels (electron/preload.ts)
**Semua fungsi di `window.electronAPI`**:
- `getSettings()`, `updateSetting(key, value)` — settings CRUD
- `getHistory()`, `searchHistory()`, `deleteHistoryItem()`, `exportHistory()` — history
- `getDictionary()`, `addDictionaryEntry()`, `deleteDictionaryEntry()` — dictionary
- `getSnippets()`, `addSnippet()`, `deleteSnippet()` — text snippets
- `downloadModel()`, `getAvailableModels()`, `deleteModel()` — model management
- `getGpuStatus()`, `downloadCuda()` — GPU acceleration
- `learnCorrection()`, `getLearnedCorrections()` — adaptive learning
- `startRecording()`, `stopRecording()`, `toggleDictation()` — recording control
- `onStateChange()`, `onDownloadProgress()` — event listeners

### Event System (Main → Renderer)
IPC events via `on*` callbacks:
- `onStateChange` — recording state changes
- `onTranscriptReady` — transcription result
- `onPartialTranscript` — partial real-time text
- `onDownloadProgress` — model download progress
- `onThemeChange` — dark/light theme toggle
- `onReloadSettings` — settings reload trigger

---

## Audio Pipeline

```
Mic → getUserMedia → AudioWorkletProcessor → Ring Buffer (wavRecorder.ts)
                                                      ↓
                                              VAD (adaptiveVAD.ts)
                                                      ↓
                                            Audio Trim → Encode
                                                      ↓
                                              IPC → Main Process
                                                      ↓
                                              Whisper Inference
                                                      ↓
                                          Text Post-processing
                                         (textCleaner, fuzzyMatcher,
                                          adaptiveLearning, confidenceScorer)
                                                      ↓
                                              Result → Renderer
```

### Key Files
- `src/hooks/useRecorder.ts` — React hook untuk recording lifecycle
- `src/utils/adaptiveVAD.ts` — Voice Activity Detection
- `src/utils/audioWorkletProcessor.js` — AudioWorklet processor
- `src/utils/wavRecorder.ts` — WAV recording buffer
- `src/utils/audio.ts` — Audio utilities (playSound)
- `electron/modules/recorder.ts` — Main process recording
- `electron/modules/transcriber.ts` — Whisper integration
- `electron/modules/audioConverter.ts` — Format conversion
- `electron/modules/audioPreprocessor.ts` — Audio preprocessing

---

## Electron Architecture

```
electron/
├── main.ts              — App entry, window management, IPC setup
├── preload.ts           — contextBridge API (electronAPI)
├── ipc/
│   ├── dictation.ipc.ts — Recording & transcription IPC
│   ├── model.ipc.ts     — Model download & management IPC
│   ├── settings.ipc.ts  — Settings CRUD IPC
│   └── snippet.ipc.ts   — Snippet & dictionary IPC
├── modules/
│   ├── recorder.ts      — Audio recording (main process)
│   ├── transcriber.ts   — Whisper inference
│   ├── database.ts      — SQLite via better-sqlite3
│   ├── pasteEngine.ts   — Auto-paste to active window
│   ├── hotkeyManager.ts — Global hotkey registration
│   ├── modelDownloader.ts — Model file downloader
│   ├── cudaDownloader.ts — CUDA toolkit downloader
│   ├── audioConverter.ts — WAV/format conversion
│   ├── audioPreprocessor.ts — Audio preprocessing
│   ├── textCleaner.ts   — Text normalization
│   ├── fuzzyMatcher.ts  — Fuzzy correction matching
│   ├── confidenceScorer.ts — Confidence scoring
│   ├── adaptiveLearning.ts — User correction learning
│   └── logger.ts        — Logging system
└── utils/
    └── levenshtein.ts   — String distance calculation
```

---

## Stack
- **Electron** 31+ (desktop framework)
- **React** 18 + **TypeScript** (renderer/frontend)
- **Vite** 5 (build tool)
- **better-sqlite3** (local database)
- **Whisper AI** (speech-to-text lokal — C++ inference via node addon)
- **uiohook-napi** (global keyboard hook)
- **ffmpeg-static** (audio conversion)
- **zod** (validation)
- **iconify/react** (icons)
- **Target**: Windows (electron-builder NSIS installer)

---

## Cara Menggunakan Skill

Skill-skill akan otomatis terdaftar. Jika model tidak otomatis mengaktifkannya, gunakan perintah:
- `/skill:voiceflow-changelog` — load changelog instructions
- `/skill:voiceflow-electron` — load electron patterns
- `/skill:voiceflow-audio` — load audio patterns

Tapi idealnya, model harus membaca ketiga skill ini secara otomatis di setiap session tanpa diminta.
