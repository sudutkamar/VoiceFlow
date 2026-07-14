# Session Handoff

## Session: 2026-07-14 (Session 15 — Models Path Improvement: Documents/VoiceFlow/models/)

### Summary

**Fix path inconsistency + pindahkan default models storage dari `userData/` ke `Documents/VoiceFlow/models/`.**

#### Masalah

1. **Path inconsistency**: `ModelDownloader.getModelsPath()` di production pakai `userData/models/` (tanpa `whisper/`), sementara `Transcriber.getModelsPath()` pakai `userData/whisper/models/` (dengan `whisper/`). Model downloader simpan di folder A, transcriber cari di folder B — model tidak ketemu.

2. **User-unfriendly location**: Model disimpan di `%APPDATA%/VoiceFlow/` yang susah ditemukan user. Tidak intuitif, tidak bisa di-copy/dibackup dengan mudah.

3. **Tidak survive reinstall**: Jika user uninstall (dengan `deleteAppDataOnUninstall: true`), model hilang. Jika di `Documents/`, model tetap aman.

#### Solusi

**Opsi C+D**: Default path pindah ke `Documents/VoiceFlow/models/`, user bisa ganti via Settings.

| Aspek | Sebelum | Sesudah |
|-------|---------|---------|
| Default path (packaged) | `userData/models/` atau `userData/whisper/models/` | `Documents/VoiceFlow/models/` |
| Dev path | `resources/whisper/models/` | Sama (tetap) |
| Custom path | Bisa di-setting via `custom_models_path` | Sama (tetap) |
| Old path migration | ❌ Tidak ada | ✅ Auto-migrate dari `userData/models/` + `userData/whisper/models/` |
| Path consistency | ❌ ModelDownloader vs Transcriber beda | ✅ Keduanya pakai `getDefaultModelsDir()` dari shared helper |

### Files Changed

| File | Perubahan | Risiko Recording |
|------|-----------|-----------------|
| `electron/utils/modelsPath.ts` | **NEW** — Shared helper: `getDefaultModelsDir()`, `getDocumentsVoiceFlowDir()`, `migrateModelsTo()`, `getOldModelsDirs()`, `modelsDirHasContent()` | 🟢 NONE |
| `electron/modules/modelDownloader.ts` | **EDIT** — `getModelsPath()` panggil `getDefaultModelsDir()`. Tambah auto-migration di constructor. `setCustomModelsPath()` panggil `getDefaultModelsDir()` untuk reset. Tambah `getModelsBaseDir()`. | 🟢 NONE |
| `electron/modules/transcriber.ts` | **EDIT** — `getModelsPath()` panggil `getDefaultModelsDir()`. Hapus `getResourcesModelsDir()` (pindah ke shared helper). | 🟢 NONE |
| `electron/main.ts` | **EDIT** — First-run copy bundled model → `Documents/VoiceFlow/models/` (bukan `userData/whisper/models/`). Tambah auto-migration dari old paths. | 🟢 NONE |
| `electron/ipc/model.ipc.ts` | **EDIT** — Tambah IPC handler `get-models-base-dir`. Improve `reset-models-path` logging. | 🟢 NONE |
| `electron/ipc/dictation.ipc.ts` | **EDIT** — Sync Transcriber path dengan `getDefaultModelsDir()` saat startup (bukan cuma custom path). | 🟢 NONE |
| `electron/preload.ts` | **EDIT** — Tambah `getModelsBaseDir` di ElectronAPI. | 🟢 NONE |
| `src/types/electron.d.ts` | **EDIT** — Tambah type `getModelsBaseDir`. | 🟢 NONE |
| `src/pages/Models.tsx` | **EDIT** — Info card "Lokasi Simpan" sekarang lebih informatif (tampilkan status path). Tambah fungsi `getDisplayPath`. | 🟢 NONE |
| `electron/modules/database.ts` | **EDIT** — Tambah default setting `custom_models_path: ''`. | 🟢 NONE |

### Decisions

- **Documents/VoiceFlow/models/** sebagai default: User-friendly, survive reinstall, gampang di-copy/dibackup. Sesuai standar Windows (Documents folder).
- **Auto-migration**: Saat pertama startup dengan path baru, model dari `userData/models/` dan `userData/whisper/models/` di-copy otomatis ke folder baru. Tidak merusak file asli.
- **Shared helper**: Semua path logic di `electron/utils/modelsPath.ts` — single source of truth. Baik Transcriber maupun ModelDownloader panggil fungsi yang sama.
- **Zero risk to recording**: Tidak ada perubahan di `wavRecorder.ts`, `useRecorder.ts`, `adaptiveVAD.ts`, `audioWorkletProcessor.js`, `audio.ts`, `pasteEngine.ts`, MiniBar, VerticalMiniBar, atau `App.tsx`.

### Risks / Technical Debt

- **Migration hanya copy, bukan move**: File asli di old path tetap ada. User bisa hapus manual jika mau. Ini sengaja (safety).
- **`__dirname` di `modelsPath.ts`**: Path `../../resources/whisper/models/` untuk dev mode dihitung dari `electron/utils/` → `resources/`. Sudah diverifikasi sesuai.
- **Windows path length**: `Documents/VoiceFlow/models/` lebih panjang dari `userData/`. Masih dalam batas aman (< 260 char).

### Next Actions

1. [ ] **TEST**: `npm run build:electron && npm run dev` → buka page Models → verify path shows `Documents/VoiceFlow/models/`
2. [ ] **TEST**: Record → verify transcription works (model path baru)
3. [ ] **TEST**: Jika ada model di `userData/models/` atau `userData/whisper/models/` → verify auto-migrate
4. [ ] **TEST**: Klik "Pilih Folder" → pilih folder lain → verify path berubah
5. [ ] **TEST**: Klik "Reset" → verify path balik ke `Documents/VoiceFlow/models/`
6. [ ] **TEST**: `build.bat build` → install → verify first-run copy ke Documents
7. [ ] **TEST**: `npm run build:electron && npm run dev` → verify 0 error di console

### Recording Test Checklist
- [ ] Record 5 detik → teks muncul
- [ ] Record panjang (30+ detik) → tidak crash
- [ ] Cancel recording (Esc) → kembali idle
- [ ] VAD auto-stop → berhenti saat diam
- [ ] Mini bar record → bisa mulai/stop
- [ ] Paste ke Notepad → text muncul
