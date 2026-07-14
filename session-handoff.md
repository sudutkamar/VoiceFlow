# Session Handoff

## Session: 2026-07-14 (Session 16 — Engine Path UI + GPU Folder Management)

### Summary

**Engine path UI + GPU/CUDA folder management (Pilih Folder, Scan, Reset).**

#### Perubahan Utama

1. **GPU/CUDA folder management** — user bisa Pilih Folder, Scan, Reset path CUDA/GPU di Settings > System
2. **Engine path display** — `.engine-path-display` CSS pattern: icon + label + separator + monospace path + status badge
3. **GPU path customizable** — `custom_gpu_path` setting disimpan di DB, load saat startup
4. **Scan GPU** — cek DLL present/missing, tampilkan hasil per-DLL
5. **Models folder display** — info card Models page pakai `.engine-path-display` pattern

#### Architecture

```
CPU engine:   resources/whisper/cpu/     (bundled via extraResources)
GPU/CUDA:     userData/whisper/gpu/      (downloaded user, customizable)
Models:       Documents/VoiceFlow/models/ (user-friendly, survives reinstall)
```

### Files Changed

| File | Perubahan | Risiko Recording |
|------|-----------|-----------------|
| `electron/ipc/engine.ipc.ts` | **NEW** — IPC handlers: get-gpu-path, choose-gpu-folder, scan-gpu-folder, reset-gpu-path | 🟢 NONE |
| `electron/modules/cudaDownloader.ts` | **NEW** — `setCudaPath()`, `resetCudaPath()`, `scanCudaFolder()`, `getCudaPathValue()` | 🟢 NONE |
| `electron/modules/transcriber.ts` | **NEW** — `detectGpuExternal()` public method | 🟢 NONE |
| `electron/modules/database.ts` | **NEW** — default setting `custom_gpu_path: ''` | 🟢 NONE |
| `electron/main.ts` | **NEW** — registerEngineIpc + load custom_gpu_path on startup | 🟢 NONE |
| `electron/preload.ts` | **NEW** — getGpuPath, chooseGpuFolder, scanGpuFolder, resetGpuPath | 🟢 NONE |
| `src/types/electron.d.ts` | **NEW** — GPU folder management types | 🟢 NONE |
| `src/pages/Settings/GeneralTab.tsx` | **NEW** — GPU folder controls (Pilih/Scan/Reset/Hapus) + scan results display | 🟢 NONE |
| `src/pages/Models.tsx` | **NEW** — Models folder pakai `.engine-path-display` CSS | 🟢 NONE |
| `src/pages/Settings/types.ts` | **NEW** — `GpuStatus` type ditambah `whisperDir`, `cpuDir`, `gpuDir` | 🟢 NONE |
| `src/styles/components.css` | **NEW** — `.engine-path-display` + badge variants | 🟢 NONE |
| `electron/utils/modelsPath.ts` | **DELETE** — `getGpuDir()` dead code | 🟢 NONE |

### Decisions

- **GPU tetap di userData/whisper/gpu/** — extraResources tidak copy GPU, user download → harus writable
- **CPU tetap di resources/whisper/cpu/** — bundled via extraResources, read-only OK
- **`.engine-path-display` pattern** — reusable CSS component, dipake di Settings + Models
- **GPU path customizable** — tapi default tetap userData (bukan resources)

### Next Actions

1. [ ] **TEST**: Settings > System → verify CPU/GPU path display dengan engine-path-display
2. [ ] **TEST**: Klik "Pilih" di GPU → pilih folder lain → verify path berubah
3. [ ] **TEST**: Klik "Scan" → verify DLL present/missing ditampilkan
4. [ ] **TEST**: Klik "Reset" → verify path balik ke default
5. [ ] **TEST**: Models page → verify folder path display
6. [ ] **TEST**: Record → verify transcription works (tidak ada perubahan recording)

### Recording Test Checklist
- [ ] Record 5 detik → teks muncul
- [ ] Record panjang (30+ detik) → tidak crash
- [ ] Cancel recording (Esc) → kembali idle
- [ ] VAD auto-stop → berhenti saat diam
- [ ] Mini bar record → bisa mulai/stop
- [ ] Paste ke Notepad → text muncul
