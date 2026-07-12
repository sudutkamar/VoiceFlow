# Changelog VoiceFlow

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
