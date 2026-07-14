# VoiceFlow Project Guidelines

Ini adalah project **VoiceFlow** - aplikasi voice-to-text lokal berbasis Electron + React + TypeScript.

---

## ⚠️ CRITICAL RULES - JANGAN LANGGAR

### Rule #1: JANGAN RUSAK RECORDING
Recording audio adalah fitur UTAMA VoiceFlow. Jika recording rusak, aplikasi TIDAK BISA DIPAKAI sama sekali.

**⚠️ HARAM ZONE — FILE INI TIDAK BOLEH DISENTUH TANPA APPROVAL:**

File-file di bawah adalah **CORE PIPELINE** Voice-to-Text. Satu perubahan kecil bisa merusak SEMUA sistem recording.

| Kategori | File | Alasan |
|----------|------|--------|
| 🔴 PRE-HAL | `src/utils/wavRecorder.ts` | Audio capture — Heartbeat recording. Jika rusak, mic tidak merekam. |
| 🔴 PRE-HAL | `src/utils/audioWorkletProcessor.js` | AudioWorklet processor — processing audio samples. |
| 🔴 PRE-HAL | `src/utils/audio.ts` | Audio utilities & sound effects. |
| 🔴 RECORDING | `src/hooks/useRecorder.ts` | React hook — seluruh lifecycle recording (start, stop, VAD, IPC). |
| 🔴 RECORDING | `src/utils/adaptiveVAD.ts` | Voice Activity Detection — auto-stop saat diam. |
| 🔴 RECORDING | `electron/modules/recorder.ts` | Main process recording. |
| 🔴 VOICE-TO-TEXT | `electron/modules/transcriber.ts` | Whisper inference — mengubah audio jadi teks. |
| 🔴 VOICE-TO-TEXT | `electron/ipc/dictation.ipc.ts` | IPC handler recording & transcription pipeline. |
| 🔴 VOICE-TO-TEXT | `electron/modules/pasteEngine.ts` | Auto-paste hasil transkripsi ke window target. |
| 🔴 VOICE-TO-TEXT | `electron/modules/audioConverter.ts` | Format conversion audio. |
| 🔴 VOICE-TO-TEXT | `electron/modules/audioPreprocessor.ts` | Audio preprocessing sebelum Whisper. |

**Perubahan pada file HARAM ZONE hanya boleh dilakukan jika:**
1. Ada bug yang terverifikasi (bukan dugaan)
2. Ada approval eksplisit dari user setelah presentasi comparison
3. Ada fallback plan yang jelas (cara revert)

**Setelah perubahan, WAJIB test checklist:**
- [ ] Record 5 detik → teks muncul
- [ ] Record 30+ detik → tidak crash
- [ ] Cancel (Esc) → idle
- [ ] VAD auto-stop → berhenti
- [ ] Paste ke Notepad → text muncul
- [ ] Copy text → clipboard terisi
- [ ] Multiple rapid records → no memory leak

**SEBELUM mengubah file HARAM ZONE:**
1. Baca dan pahami flow recording dari Mic → WAV → Whisper → Text → Paste
2. Test recording SEBELUM dan SESUDAH perubahan
3. Jangan asumsi "ini cuma refactor kecil" — recording punya banyak edge case
4. Pahami bahwa PRE-HAL files adalah fondasi — error di sini merusak semua yang di atasnya

### Rule #2: JANGAN LANGSUNG IMPLEMENTASI PERUBAHAN BESAR

Jika ada ide untuk mengganti/mengupgrade sistem yang ada (contoh: ScriptProcessorNode → AudioWorkletNode):

**❌ JANGAN:**
- Langsung implementasi dan commit
- Replace sistem yang sudah working
- Asumsi "ini pasti lebih bagus"

**✅ LAKUKAN:**
1. **Buat perbandingan (comparison)** — tabel pro/kontra
2. **Sebutkan risiko** — apa yang bisa rusak?
3. **Test di branch terpisah** — jangan langsung di main
4. **Minta approval** — jelaskan ke user sebelum implement
5. **Fallback plan** — jika gagal, cara revert?

**Contoh format comparison:**
```
## ScriptProcessorNode vs AudioWorkletNode

| Aspek | ScriptProcessorNode | AudioWorkletNode |
|-------|--------------------|--------------------|
| Status | Deprecated (web) | Modern standard |
| Electron support | ✅ Full (Chromium 126) | ✅ Full |
| Main thread | Blocks | Offloaded |
| Complexity | Simple | Requires worklet file |
| Migration risk | N/A | HIGH — bisa break recording |

**Rekomendasi:** Tunda migration ke v1.1. ScriptProcessorNode masih work fine di Electron.
```

### Rule #3: RECORDING ADALAH SISTEM KRITIS

Recording punya dependencies yang kompleks:
```
wavRecorder.ts
  ├── getUserMedia (browser API)
  ├── AudioContext (browser API)
  ├── ScriptProcessorNode (deprecated tapi working)
  ├── AdaptiveVAD (custom)
  └── WAV encoding (custom)

useRecorder.ts (React hook)
  ├── WavRecorder instance
  ├── IPC: sendAudioData → main process
  ├── IPC: onTranscriptReady ← main process
  ├── IPC: onPartialTranscript ← main process
  └── VAD hook (auto-stop)

main process (dictation.ipc.ts)
  ├── Save WAV to temp file
  ├── Transcriber.transcribe()
  │   ├── Audio preprocessing (optional)
  │   ├── Whisper CLI spawn
  │   ├── Text post-processing
  │   │   ├── TextCleaner
  │   │   ├── FuzzyMatcher
  │   │   ├── AdaptiveLearning
  │   │   ├── ConfidenceScorer
  │   │   └── LlmPostProcessor (optional)
  │   └── Return result
  ├── PasteEngine.paste()
  └── Save to history
```

Semua dependency ini harus work bersama. Mengubah 1 file bisa ripple effect ke semua sistem.

### Rule #4: JANGAN RUSAK FLOATING UI (MINI BAR)

Floating UI (mini bar) adalah fitur UNIK VoiceFlow. User sudah suka dengan UI/UX-nya. Jangan rusak.

**File Floating UI (HARUS HATI-HATI):**
- `src/components/MiniBar/MiniBar.tsx` — MiniBar component (horizontal mode)
- `src/components/VerticalMiniBar.tsx` — Vertical mode
- `src/styles/app.css` — CSS untuk mini bar
- `electron/main.ts` — Window creation (miniWindow)

**Yang TIDAK BOLEH diubah tanpa approval:**
- Layout/positioning mini bar (floating, always-on-top)
- Zoom/scale behavior
- Waveform visualization (canvas)
- Language selector UI
- Recording state transitions (idle → recording → processing → done)
- Mini bar resize behavior
- Mini bar ↔ main window transitions

**Yang BOLEH diubah (dengan hati-hati):**
- Warna/theme (ikuti CSS variables)
- Tooltip text
- Error messages
- Sound effects
- Tambah fitur baru (jangan replace yang ada)

**Sebelum mengubah floating UI:**
1. Baca CSS di `app.css` — search `.mini-bar`, `.m-voice-btn`, `.m-canvas`
2. Pahami zoom behavior — `miniZoom = windowHeight / BASE_HEIGHT`
3. Test di horizontal DAN vertical mode
4. Test resize — drag mini bar untuk ubah ukuran
5. Test recording flow — mulai → proses → selesai

### Rule #5: TEST CHECKLIST

Setelah mengubah apapun yang berhubungan dengan recording:

**Recording Tests:**
- [ ] Record 5 detik → teks muncul
- [ ] Record panjang (30+ detik) → tidak crash
- [ ] Cancel recording (Esc) → kembali idle
- [ ] VAD auto-stop → berhenti saat diam
- [ ] Hotkey record → bisa mulai/stop
- [ ] Mini bar record → bisa mulai/stop
- [ ] Paste ke Notepad → text muncul
- [ ] Copy text → clipboard berisi
- [ ] Multiple rapid records → tidak memory leak
- [ ] Microphone denied → error message jelas

**Floating UI Tests:**
- [ ] Mini bar muncul di bottom center screen
- [ ] Mini bar horizontal → semua button terlihat
- [ ] Mini bar vertical → layout benar
- [ ] Resize mini bar → zoom proportionally
- [ ] Language cycle → ID/EN/JA/KO/ZH berubah
- [ ] Recording di mini bar → waveform muncul
- [ ] Done state → result text muncul
- [ ] Click mini bar → tidak minimize
- [ ] Blur mini bar → tetap visible (always-on-top)
- [ ] Switch horizontal ↔ vertical → smooth transition

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

## Session Start Checklist

Wajib dilakukan di SETIAP session:

- [ ] Baca `session-handoff.md` (kalau ada)
- [ ] Baca `.pi/AGENTS.md` ini — terutama **HARAM ZONE**
- [ ] Load skill `voiceflow-changelog`
- [ ] Load skill `voiceflow-electron`
- [ ] Load skill `voiceflow-audio`
- [ ] Catat perubahan di CHANGELOG
- [ ] Pahami arsitektur UI sebelum modifikasi
- [ ] Pahami data flow (settings, IPC, database)

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
- `useRecorder` hook (custom hook untuk recording lifecycle) — **HARAM ZONE**
- Context API untuk Notification system
- Settings di-load via IPC `electronAPI.getSettings()`
- Settings disimpan di SQLite via main process

### Pages vs Mini Mode
- **Main window** (`#/`): Full app dengan sidebar navigasi
- **Mini window** (`#mini`): Floating bar di atas semua aplikasi
  - Horizontal mode (default): `mini-bar` class
  - Vertical mode: `VerticalMiniBar` component (setting `mini_bar_orientation`)
- Mode ditentukan dari URL hash: `window.location.hash === '#mini'`

### Quick Component Reference

| Komponen | File | Catatan |
|----------|------|---------|
| MiniBar | `src/components/MiniBar/MiniBar.tsx` | Floating bar horizontal |
| VerticalMiniBar | `src/components/VerticalMiniBar.tsx` | Floating bar vertikal |
| HomePage | `src/components/HomePage/HomePage.tsx` | Recording utama |
| Models | `src/pages/Models.tsx` | Download & manage AI models |
| History | `src/pages/History.tsx` | Riwayat transkripsi |
| Settings | `src/pages/Settings.tsx` | 7 tab settings |
| Notification | `src/components/Notification.tsx` | Toast system |
| Iconify | `src/utils/icons.tsx` | SVG icon system |
| electronAPI | `src/types/electron.d.ts` | Semua IPC API types |
| modelsPath | `electron/utils/modelsPath.ts` | Shared path helper untuk models storage |

---

## Styling System

### Dark/Light Theme
- **Default**: Dark mode via CSS variables di `:root`
- **Light mode**: Class `.light-theme` di `<html>`
- Theme disimpan di settings (`settings.theme`)
- CSS files: `app.css` (entry), `variables.css`, `base.css`, `components.css`, `pages.css`, `minibar-horizontal.css`, `minibar-vertical.css`, `utilities.css`, `interactions.css`, `global.css`, `modern.css`

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

### Key Files (HARAM ZONE marked)
| File | Fungsi | Status |
|------|--------|--------|
| `src/hooks/useRecorder.ts` | React hook recording lifecycle | 🔴 HARAM ZONE |
| `src/utils/adaptiveVAD.ts` | Voice Activity Detection | 🔴 HARAM ZONE |
| `src/utils/audioWorkletProcessor.js` | AudioWorklet processor | 🔴 HARAM ZONE |
| `src/utils/wavRecorder.ts` | WAV recording buffer | 🔴 HARAM ZONE |
| `src/utils/audio.ts` | Audio utilities (playSound) | 🔴 HARAM ZONE |
| `electron/modules/recorder.ts` | Main process recording | 🔴 HARAM ZONE |
| `electron/modules/transcriber.ts` | Whisper integration | 🔴 HARAM ZONE |
| `electron/modules/audioConverter.ts` | Format conversion | 🔴 HARAM ZONE |
| `electron/modules/audioPreprocessor.ts` | Audio preprocessing | 🔴 HARAM ZONE |

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
│   ├── snippet.ipc.ts   — Snippet & dictionary IPC
│   └── llm.ipc.ts       — LLM post-processing IPC
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
    ├── levenshtein.ts   — String distance calculation
    └── modelsPath.ts    — Shared path helper untuk models storage
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

Idealnya, model membaca ketiga skill ini secara otomatis di setiap session tanpa diminta.

---

## Aturan File & Folder Baru

### Setiap fitur/komponen baru → file/folder baru

Jangan pernah nempel kode baru ke file existing yang besar kalau bisa dipisah.
Buat file atau folder baru biar proyek tetap terstruktur.

**Contoh baik:**
```
# Fitur baru: auto-punctuation settings tab
src/pages/Settings.tsx  — (jangan diedit)
→ src/components/SettingsPunctuationTab.tsx  — (file baru)

# Fitur baru: export to PDF
src/App.tsx  — (jangan ditambahin)
→ src/utils/exportPdf.ts  — (file baru)
→ src/components/ExportButton.tsx  — (file baru)
```

**Contoh buruk:**
```
# ❌ Nambah 200 line ke App.tsx padahal bisa dipisah
# ❌ Nambah fungsi utility ke file yang udah 500 line
# ❌ Nambah CSS baru di tengah app.css yang 4900 line
```

### Struktur folder yang sudah ada

Jangan membuat folder baru kalau sudah ada folder yang cocok:

| Jenis | Folder | Contoh |
|-------|--------|--------|
| React component | `src/components/` | `src/components/SettingsPunctuationTab.tsx` |
| React page | `src/pages/` | `src/pages/NewFeaturePage.tsx` |
| Utility/logic | `src/utils/` | `src/utils/exportPdf.ts` |
| CSS/styles | `src/styles/` | `src/styles/new-feature.css` |
| React hook | `src/hooks/` | `src/hooks/useNewFeature.ts` |
| Electron main process | `electron/modules/` | `electron/modules/newService.ts` |
| Electron IPC handler | `electron/ipc/` | `electron/ipc/newFeature.ipc.ts` |
| Types | `src/types/` | `src/types/newFeature.d.ts` |
| Icons | `src/utils/icons.tsx` | Tambah icon name baru di file ini |

### Exception — kapan BOLEH edit file existing

- **Bug fix** — langsung edit file yang bersangkutan
- **Refactor kecil** — rename, extract function, type fix
- **Update pipeline** — kalo fitur baru perlu nyambung ke pipeline existing (contoh: tambah post-processor di dictation.ipc.ts)
- **Tambah icon** — edit `src/utils/icons.tsx`
- **Tambah IPC channel** — edit `electron/preload.ts` + `src/types/electron.d.ts`

### Kalau ragu, tanya dulu

Bingung file baru atau edit existing? Tanya user:
> "Ini lebih cocok sebagai komponen terpisah di src/components/ atau nempel di file yang udah ada?"

---

## Prioritas Kode: Sederhana > Canggih

### Kode sederhana lebih baik dari kode "pintar"

**❌ Jangan:**
- Over-engineering (patterns, abstraksi, generic berlapis)
- Zustand/Redux kalau useState cukup
- Custom hooks kalau useEffect biasa cukup
- Builder pattern, factory pattern, observer pattern — kecuali benar-benar diperlukan

**✅ Lakukan:**
- Kode lurus, gampang dibaca, gampang di-debug
- Copy-paste yang jelas lebih baik dari abstraksi prematur
- Function 20 line > function 5 line dengan 3 level callback
- `if/else` jelas > ternary bersarang
- Comment > code golf

### Prinsip:
```
// ❌ Pintar tapi susah dibaca
const r = d.reduce((a,{k,v})=>({...a,[k]:v}),{});

// ✅ Sederhana, jelas
const result: Record<string, any> = {};
for (const item of d) {
  result[item.k] = item.v;
}
```

Kalau ada solusi sederhana dan solusi canggih — **pilih yang sederhana**. Future-proofing yang sebenarnya adalah kode yang mudah diubah nanti.

---

## Struktur Folder — Wajib Rapi & Konsisten

### Aturan utama

1. **Satu fitur → satu file/folder.** Jangan campur 2 fitur beda dalam 1 file.
2. **Jangan biarkan folder berantakan.** File sampah, backup, draft harus dibersihkan.
3. **Pisahkan main process (electron/) dan renderer (src/) dengan jelas.**
4. **Jangan buat file di root project** kecuali konfigurasi build (package.json, tsconfig, vite.config, dll).

### Larangan

| ❌ Jangan | ✅ Ganti dengan |
|-----------|----------------|
| File di root project selain config | Taruh di folder yang sesuai (`src/`, `electron/`) |
| File backup/old/draft (`*_old.ts`, `*-backup.ts`) | Hapus atau taruh di branch |
| File duplikasi (2 file fungsi sama) | Hapus salah satu, import dari 1 file |
| File besar >1000 line tanpa pemisahan | Pecah jadi beberapa file sesuai fungsi |
| Folder kosong | Hapus (kecuali `.gitkeep` yang sengaja) |
| File .env, .pfx, sertifikat, binary | Taruh di `.gitignore`, jangan commit |

### Checklist sebelum commit

Setiap kali mau commit, cek:

```
[ ] Apakah ada file baru di root folder? Pindahkan ke folder yang sesuai.
[ ] Apakah ada file backup/old/draft? Hapus atau git rm.
[ ] Apakah ada file duplikasi? Gabung atau hapus salah satu.
[ ] Apakah file >1000 line yang tidak perlu? Pecah.
[ ] Apakah folder yang tidak dipakai? Hapus.
[ ] Apakah ada file binary rahasia terlanjur di-stage? Unstage + tambah .gitignore.
```

### Kapan merapikan struktur

- **Setiap kali nambah fitur baru** — pastikan file baru ditaruh di folder yang tepat
- **Setelah selesai 1 session** — bersihkan file sampah sebelum commit
- **Kalau lihat folder berantakan** — langsung rapikan, jangan tunda
