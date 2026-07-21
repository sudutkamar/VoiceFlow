# Changelog VoiceFlow

## [1.0.10] - 2026-07-20

### Added
- **VAD Sensitivity Slider (Settings > Recording)** — 3 profiles (Low/Medium/High) + pause timeout selector. User bisa tuning VAD sesuai lingkungan
- **Quick Model Switcher di MiniBar** — click model indicator → dropdown → pilih model langsung. Switch model tanpa buka main window
- **Did You Mean? (Smart Suggestions)** — setelah transcribe, sistem scan kata-kata yang mungkin typo/match dictionary → tampilkan suggestion click-to-fix di HomePage
- **Recording Presets** — 6 built-in presets (Indonesia Casual, Indonesia Formal, English, Coding, Quick Command, Meeting Notes) + save custom presets. Satu klik setting language + mode + VAD + prompt
- **Startup Mode** — pilih: Full Window (default), MiniBar Only, atau Tray Only. Di General Settings
- **Audio Playback History** — recording audio disimpan persisten di `{userData}/recordings/`. Bisa diputar ulang dari History page
- **Audio File Cleanup** — audio file auto-terhapus saat history item dihapus atau clear history

### Fixed
- **Audio playback gagal karena file WAV dihapus sebelum disimpan ke history** — file WAV sekarang disimpan di folder `recordings/` (persisten), bukan temp dir. Tidak dihapus setelah transcribe. Path disimpan di database
- **`clearHistory` SELECT key bukan value** — query salah column, menyebabkan `fs.unlinkSync(undefined)` error. Audio files sekarang benar-benar terhapus
- **Smart suggestions tidak di-reset antar transcript** — suggestion dari transcript sebelumnya muncul sebagai ghost di transcript baru. Sekarang di-reset ke `[]` sebelum fetch suggestion baru
- **Play button di History pakai icon 'text'** — confusing UX, ganti ke icon 'speaker'
- **CSS `btn-active`, `suggestions-box`, `suggestion-*`, `preset-delete`, `preset-loading` missing** — ditambahkan styles

### Fixed
- **Model download tidak auto-refresh UI** — setelah download/switch model, UI tidak update sampai user refresh (CTRL+R):
  - Added `model-changed` IPC event broadcast ke semua window saat model setting berubah
  - Added `onModelChanged` event listener API di preload.ts
  - Models page sekarang auto-refresh saat model berubah dari halaman lain
  - MiniBar (horizontal & vertical) auto-refresh model status saat model berubah

### Changed
- `electron/ipc/settings.ipc.ts` — broadcast `model-changed` event ke semua window saat `model` setting diubah
- `electron/preload.ts` — added `onModelChanged` to ElectronAPI interface + implementation
- `src/types/electron.d.ts` — added `onModelChanged` type definition
- `src/pages/Models.tsx` — added `onModelChanged` listener to refresh models list
- `src/components/MiniBar/MiniBar.tsx` — added `onModelChanged` listener to refresh warmup status
- `src/components/VerticalMiniBar.tsx` — added `onModelChanged` listener to refresh model availability

---

## [1.0.9] - 2026-07-19

### Fixed
- **VAD bug: recording stops while speaking** (P0 CRITICAL) — root cause identified and fixed:
  - Added hangover mechanism (500ms) to prevent false stops during natural pauses between sentences
  - Raised VAD threshold from 0.012 → 0.020 to reduce noise-triggered false positives
  - Added EMA smoothing (alpha=0.3) for stable RMS readings without losing responsiveness
  - Increased emergency timeout from 30s → 45s for long dictation support

### Changed
- `src/hooks/useRecorder.ts` — rewrote `useVad()` with hangover, smoothing, and new threshold; cleaned up debug console.logs
- `src/utils/constants.ts` — added VAD_SPEECH_THRESHOLD, VAD_HANGOVER_MS, VAD_SMOOTHING_ALPHA
- `src/components/MiniBar/MiniBar.tsx` — live dot now reactive to mic level; processing state shows "Processing..." text (fixed width to prevent clipping)
- `src/components/VerticalMiniBar.tsx` — live dot now reactive to mic level; processing state shows "..." text
- `src/styles/minibar-horizontal.css` — live dot uses inline dynamic styles; processing state widened to 120px with smooth transition
- `src/styles/minibar-vertical.css` — live dot uses inline dynamic styles; processing state has text label

### Removed
- `src/utils/adaptiveVAD.ts` — deleted unused dead code (200 lines)

### Files
- `src/hooks/useRecorder.ts` — VAD bug fix
- `src/utils/constants.ts` — new VAD constants
- `src/utils/adaptiveVAD.ts` — deleted

---

## [1.0.8] - 2026-07-17

### Added
- **Aggressive model warmup** — pre-caches everything at startup for zero cold-start penalty on first transcription:
  - whisper-cli.exe path validation
  - Model file stat + integrity check (size > 0)
  - GPU/CUDA detection cache
  - Available models list cache
  - whisper-cli directory cache
- **Warmup status IPC** — renderer can query `getWarmupStatus()` to check readiness
- **Warmup complete event** — `onWarmupComplete` callback for UI readiness indicator
- **Warmup timing logs** — measures and logs warmup duration for debugging

### Changed
- `transcriber.ts` — enhanced `warmup()` method with aggressive pre-caching, readiness tracking, and result object
- `main.ts` — improved warmup call with timing, result logging, and renderer notification
- `preload.ts` — added `getWarmupStatus` and `onWarmupComplete` APIs
- `electron.d.ts` — added TypeScript types for warmup APIs

### Files
- `electron/modules/transcriber.ts` — enhanced warmup
- `electron/main.ts` — improved warmup call + IPC handler
- `electron/preload.ts` — new warmup APIs
- `src/types/electron.d.ts` — new types

---

## [1.0.7] - 2026-07-16

### Changed
- **ErrorBoundary** — full rewrite: actionable error UI dengan Reload, Go Home, Copy Error Report, collapsible Technical Details
- **Centralized error handler** — `src/utils/errorHandler.ts`: logError, logWarning, getErrorMessage, safeAsync, safeSync
- **Silent catch blocks replaced** — semua `catch(() => {})` di MiniBar, VerticalMiniBar, Settings, Models, Benchmark, LlmModels sekarang log ke console dengan context

### Files
- `src/components/ErrorBoundary.tsx` — rewrite
- `src/utils/errorHandler.ts` — new
- `src/components/MiniBar/MiniBar.tsx` — update (5 catches)
- `src/components/VerticalMiniBar.tsx` — update (3 catches)
- `src/pages/History.tsx` — update (6 catches)
- `src/pages/Models.tsx` — update (5 catches)
- `src/pages/Benchmark.tsx` — update (1 catch)
- `src/pages/LlmModels.tsx` — update (2 catches)
- `src/pages/Settings/GeneralTab.tsx` — update (4 catches)
- `src/pages/Settings/useSettings.ts` — update (6 catches)

---

## [1.0.6] - 2026-07-16

### Analysis
- **HuggingFace Model Scan** — Complete review of HF for better ASR models than current whisper.cpp large-v3-turbo.
- Found 3 candidates: distil-large-v3.5 (drop-in, 3% better WER, 1.46x faster, EN only), Fun-ASR-MLT-Nano-2512 (GGUF, 31 languages incl. ID, needs transcribe.cpp), Fun-ASR-Nano-2512 (GGUF, CN/EN/JP only).
- **distil-large-v3.5-ggml** is the only drop-in replacement compatible with existing whisper-cli.exe v1.9.1
- **Fun-ASR-MLT-Nano** supports Indonesian but requires separate transcribe.cpp binary integration — major effort.

## [1.0.5] - 2026-07-14

### Changed
- **GPU/CUDA folder management** — user bisa Pilih Folder, Scan, dan Reset path CUDA/GPU engine di Settings > System. Sama seperti Models page
- **UI Engine Paths** — CPU Engine dan GPU/CUDA pakai `.engine-path-display` CSS pattern
- **GPU path customizable** — setting `custom_gpu_path` disimpan di DB, load saat startup
- **Scan GPU** — scan folder untuk cek DLL yang ada/hilang, tampilkan hasil per-DLL
- `cudaDownloader.ts` — tambah `setCudaPath()`, `resetCudaPath()`, `scanCudaFolder()`, `getCudaPathValue()`
- `transcriber.ts` — tambah `detectGpuExternal()` public method untuk re-detect GPU
- `database.ts` — default setting `custom_gpu_path: ''`
- CSS baru: `.engine-path-display`, `.engine-path-icon`, `.engine-path-label`, `.engine-path-sep`, `.engine-path-text`, `.engine-path-badge`, `.badge-ok`, `.badge-warn`, `.badge-info`

## [1.0.4] - 2026-07-14

### Fixed (CRITICAL - Recording Fix)
- **Empty default model bypasses model validation** — Commit `82decc1` changed default model from `'ggml-large-v3-turbo-q5_0.bin'` to `''` (fresh install). `getBestAvailableModel('')` called `fs.existsSync(path.join(modelsDir, ''))` which returns `true` because `path.join(dir, '') === dir`. This returned empty string as valid model, causing whisper to receive a directory path instead of `.bin` file → `failed to initialize whisper context` → no transcription.

### Fixed
- `getBestAvailableModel()` — Skip `preferredModel` if empty string
- `transcriber.transcribe()` — Guard `model && isModelAvailable()` against empty string
- `transcriber.runWhisper()` — Validate `modelPath.endsWith('.bin')` before spawning whisper
- GPU detection in `Transcriber.detectGpu()` — Check CUDA DLL in whisper binary's own directory, not just userData

### Chore
- Deleted `nul` artifact from `resources/whisper/models/`
- Full audio pipeline audit

---

## [1.0.3] - 2026-07-14

### Fixed
- **GPU detection in `Transcriber.detectGpu()`** — Now checks if `ggml-cuda.dll` exists in the whisper binary's own directory (`resources/whisper/cpu/`), not just in `userData/whisper/gpu/`. Previously, CUDA DLLs in userData caused `hasGpu=true` without `-ng` flag, making whisper try to use GPU with CPU-only binary.

### Chore
- Deleted `nul` artifact file from `resources/whisper/models/`
- Full audio pipeline audit: all components verified working

---

## [1.0.2] - 2026-07-14

### Added
- `src/components/MiniBar/MiniBar.tsx` — Extracted horizontal mini bar component
- `src/components/HomePage/HomePage.tsx` — Extracted home page component
- `src/styles/variables.css` — CSS variables reference file

### Changed
- **App.tsx split** — Reduced from 976 → 219 lines. MiniBar and HomePage now in separate files.
- **Fixed type mismatch** — `sendAudioData` in useRecorder now uses `Array.from()` instead of `as any` cast
- **Added error logging** — Empty catch blocks in MiniBar and MainApp now log warnings

### Technical Debt
- `src/styles/app.css` still 5556 lines — CSS splitting deferred
- `electron/ipc/dictation.ipc.ts` has LLM handlers mixed with dictation — needs splitting

---

## [1.0.1] - 2026-07-14

### Added
- `src/utils/languages.ts` — Shared language definitions (LANGUAGES array, getLanguageByCode, getNextLanguage)
- `src/utils/constants.ts` — Centralized magic numbers for recording, VAD, UI, paste, and queue settings

### Fixed
- **Duplicate IPC handler** — `llm-check-availability` was registered twice in `dictation.ipc.ts`, potentially causing handler conflicts
- **GPU tooltip operator precedence bug** — `!hasModel === false` evaluated to `hasModel === true`, preventing GPU tooltip from showing during loading state

### Changed
- **Root cleanup** — Removed `nul` (Windows artifact), `notes.txt` (stale), `logo.png` (duplicate of src/assets)
- **File relocation** — Moved `paste-keystroke.ps1` to `electron/utils/`, `voiceflow.pfx` to `.build/`
- **Shared code extraction** — MiniBar, VerticalMiniBar, and useRecorder now use shared languages.ts and constants.ts
- `.gitignore` — Added `.build/` directory, removed stale `nul` entry

### Technical Debt
- `src/styles/app.css` still 5556 lines — needs splitting by component
- `electron/ipc/dictation.ipc.ts` has LLM handlers mixed with dictation — needs splitting

---

## [1.0.0] - In Progress

### Added
- Initial project setup
- LLM Post-Processing: pipeline Phase 3 untuk cleanup teks via Ollama/llama.cpp
- Error Boundary di App.tsx untuk mencegah blank screen total
- `onLlmDownloadProgress` IPC channel khusus untuk LLM model download progress

### Changed
- `package.json`: dev script sekarang pre-kill port 5173 sebelum start Vite
- `electron/main.ts`: fallback ke dist/index.html jika loadURL dev gagal
- `vite.config.ts`: `strictPort: true` agar error jelas jika port conflict
- `package.json`: wait-on timeout 15s
- `electron/ipc/dictation.ipc.ts`: LLM download progress sekarang include `downloadedBytes`/`totalBytes`, pakai channel dedicated `llm-download-progress`
- `electron/modules/llmPostProcessor.ts`: rewrite `downloadFileStreaming` dengan redirect chain handling, backpressure, progress throttle, file size validation
- `electron/preload.ts`: tambah `onLlmDownloadProgress` listener
- `src/pages/LlmModels.tsx`: rewrite full — subscribe ke `onLlmDownloadProgress` untuk real-time progress bar, track bytes, handle error/complete states
- `src/types/electron.d.ts`: tambah tipe `onLlmDownloadProgress`

### Fixed
- **UI ngeblank saat npm run dev** — Root cause: port 5173 conflict dari session sebelumnya menyebabkan Vite tidak bisa serve JS modules → halaman kosong. Fix: pre-kill port + fallback + strictPort
- **LLM download progress bar stuck di 0%** — 3 bugs: (1) LlmModels.tsx tidak subscribe ke progress events, (2) progress event tidak include `downloadedBytes`/`totalBytes`, (3) download handler tidak handle redirect chain dari HuggingFace dengan benar

### Known Issues / Technical Debt
- Pre-kill port script Windows-specific
- Multiple electron instances menumpuk setelah Ctrl+C berkali-kali
- Belum ada single-instance lock
