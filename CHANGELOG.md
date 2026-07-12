# Changelog VoiceFlow

## [1.0.0] - In Progress

### Added
- Initial project setup
- LLM Post-Processing: pipeline Phase 3 untuk cleanup teks via Ollama/llama.cpp
- Error Boundary di App.tsx untuk mencegah blank screen total

### Changed
- `package.json`: dev script sekarang pre-kill port 5173 sebelum start Vite
- `electron/main.ts`: fallback ke dist/index.html jika loadURL dev gagal
- `vite.config.ts`: `strictPort: true` agar error jelas jika port conflict
- `package.json`: wait-on timeout 15s

### Fixed
- **UI ngeblank saat npm run dev** — Root cause: port 5173 conflict dari session sebelumnya menyebabkan Vite tidak bisa serve JS modules → halaman kosong. Fix: pre-kill port + fallback + strictPort

### Known Issues / Technical Debt
- Pre-kill port script Windows-specific
- Multiple electron instances menumpuk setelah Ctrl+C berkali-kali
- Belum ada single-instance lock
