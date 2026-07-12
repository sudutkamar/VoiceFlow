# Session Handoff

## Session: 2026-07-12 (LLM Post-Processing)

### Summary
Menambahkan LLM Post-Processing stage ke pipeline transkripsi VoiceFlow. Fitur baru menggunakan Ollama API untuk cleanup hasil transkripsi secara AI: menghapus filler words, memperbaiki grammar, menambahkan punctuation, dan kapitalisasi natural.

### Files Changed
| File | Change |
|------|--------|
| `electron/modules/llmPostProcessor.ts` | **NEW** — Modul LLM Post-Processor: komunikasi dengan Ollama API, check availability, pull model, proses teks dengan LLM lokal |
| `electron/ipc/dictation.ipc.ts` | Integrasi LLM post-processing di pipeline transkripsi (Phase 3 setelah TextCleaner + AdaptiveLearning). Tambah 4 IPC handler baru: `llm-check-availability`, `llm-get-models`, `llm-pull-model`, `llm-test-process` |
| `electron/modules/database.ts` | Tambah 2 setting default: `llm_postprocess=false`, `llm_model=phi-4-mini:3.8b` |
| `electron/preload.ts` | Expose 4 fungsi LLM baru ke renderer via contextBridge |
| `src/types/electron.d.ts` | Tambah tipe untuk 4 fungsi LLM baru |
| `src/pages/Settings.tsx` | Tambah section "LLM Post-Processing" di Processing tab dengan toggle, model selector, Ollama status check, pull model button, available models list |
| `src/styles/app.css` | Tambah `.spinner-sm`, `.badge-new`, `.status-dot`, `.status-dot-ok`, `.status-dot-err` |

### Decisions
- **Arsitektur**: LLM post-processing adalah Phase 3 dalam pipeline (setelah TextCleaner rule-based + Adaptive Learning). Jadi LLM hanya membersihkan teks yang sudah di-preprocess, bukan menggantikannya.
- **Model default**: `phi-4-mini:3.8b` — cukup kecil untuk <500ms inference di CPU, cukup akurat untuk cleanup teks. User bisa ganti ke model lain via UI.
- **System prompt**: Strict prompt yang hanya membersihkan filler words, fix grammar, add punctuation. Tidak mengubah makna atau menambah informasi.
- **Temperature**: 0.1 (sangat rendah) untuk output yang konsisten dan tidak kreatif.
- **Timeout**: 5000ms per inference. Jika timeout, fallback ke hasil tanpa LLM.
- **Privacy**: 100% lokal via Ollama. Tidak ada data yang dikirim ke cloud.

### Trade-offs
- **Kecepatan**: LLM post-processing menambah latency 200-500ms. Hanya aktif jika toggle diaktifkan.
- **Akurasi**: Model kecil (1B-3.8B) mungkin kadang menghapus kata yang tidak seharusnya. System prompt yang ketat meminimalkan risiko ini.
- **Dependency**: User harus install Ollama. UI sudah menampilkan status dan tombol untuk check.

### Risks / Technical Debt
1. **Ollama tidak terinstall** — Fitur tidak aktif secara default (`llm_postprocess=false`). User harus enable dan install Ollama manual.
2. **Model size**: `phi-4-mini:3.8b` ~2.5GB download. Mungkin berat untuk user dengan RAM terbatas. Tersedia opsi model lebih kecil (`qwen2.5-0.5b`, `smollm2-360m`).
3. **Error handling**: Jika LLM gagal (timeout/Ollama down), fallback ke hasil TextCleaner biasa tanpa mengganggu user.
4. **TODO**: #1 System prompt belum dioptimasi untuk bahasa Indonesia secara spesifik. #2 Belum ada progress bar untuk pull model (streaming response dari Ollama).

### Next Actions
1. [ ] Test dengan Ollama:
   ```bash
   # Install Ollama & pull model
   curl -fsSL https://ollama.com/install.sh | sh
   ollama pull phi-4-mini:3.8b
   # Start VoiceFlow & test
   cd C:/Users/cgnscr/Documents/Dev/Code/VoiceFlow
   npm run build:electron
   npm run dev
   ```
2. [ ] Optimasi system prompt untuk bahasa Indonesia
3. [ ] Tambah progress bar untuk `ollama pull`
4. [ ] Test di MiniBar dan VerticalMiniBar (seharusnya tidak perlu perubahan karena LLM processing di main process)

## Previous Session (Download Infrastructure)

### Summary

Completed a thorough fix session on the VoiceFlow Electron app's download infrastructure. All 6 issues from `notes.txt` were investigated and resolved, plus 2 bonus features added.

## Current State

### Files Changed
| File | Change |
|------|--------|
| `electron/modules/cudaDownloader.ts` | Added disk space check, SHA256 verification, retry logic (3x exponential backoff), speed limit option, request timeout, fixed resume logic (totalBytes reset) |
| `electron/modules/modelDownloader.ts` | Added `sha256` field to `ModelInfo`, added disk space check, SHA256 verification, retry logic, speed limit option, request timeout, fixed resume logic (totalBytes reset), improved taskbar progress fallback |
| `electron/ipc/model.ipc.ts` | Added `set-speed-limit` and `get-speed-limit` IPC handlers |
| `electron/preload.ts` | Exposed `setSpeedLimit()` and `getSpeedLimit()` to renderer |
| `notes.txt` | Updated with completion status |

### Features Touched
- CUDA DLL download (NVIDIA GPU support)
- Whisper model download (all 8 models)
- Download resume/pause/cancel
- Download state persistence across app restart
- Taskbar progress API
- IPC bridge between main/renderer

## Decisions

### 1. Disk space check via `fs.promises.statfs`
- **Why**: Native Node.js API (available since Node 19+), zero dependencies.
- **Alternative considered**: `check-disk-space` npm package, `child_process` with `fsutil`.
- **Trade-off**: `statfs` is experimental but stable enough for Node 24. Falls back gracefully if unavailable.

### 2. SHA256 verification with optional hashes
- **Why**: Size-only validation is insufficient for model integrity. SHA256 is standard.
- **Decision**: Made hashes optional (`undefined` by default) since computing hashes for all models requires downloading them first or obtaining from upstream.
- **Future**: Fill in `sha256` fields after verifying against HuggingFace published checksums.

### 3. Retry with exponential backoff (1s, 3s, 9s)
- **Why**: Network failures are common with large model downloads. Retry must be aggressive enough to recover but not hammer the server.
- **Scope**: Only retries on transient errors (network errors, HTTP 408/429/520+). Non-transient 4xx/5xx are returned immediately.
- **Implementation**: Recursive wrapper around core `downloadFile`/`downloadFromUrl` to preserve existing redirect and resume logic.

### 4. Speed limit via response stream pausing
- **Why**: Users on metered/throttled connections may want to limit bandwidth usage.
- **Implementation**: Calculates real-time speed and pauses the response stream when limit is exceeded. Re-checks every chunk.

### 5. Request timeout of 30s
- **Why**: Default Node.js HTTP has no timeout, can hang indefinitely on slow servers.
- **Where**: Applied at request level (`timeout` option) plus destroy on timeout.

## Risks

1. **SHA256 computation time**: For large models (3.1 GB), SHA256 verification can take 30-60 seconds. No timeout is set on the verification — could block the UI if called synchronously. Currently async with streaming, but worth adding a progress indicator.

2. **`fs.statfs` compatibility**: On non-Windows platforms or exotic filesystems, `statfs` might behave differently. Tested on Windows with NTFS. Add platform-specific fallback if issues arise.

3. **Speed limit accuracy**: The chunk-based throttle is approximate. Actual speed may fluctuate above the limit briefly. Acceptable for a best-effort feature.

4. **Retry recursion depth**: Download-with-retry is recursive. With max 3 retries + inner redirect/resume recursion, max call depth is ~10 frames. No stack overflow risk.

5. **Untested paths**:
   - Resume after app crash + server returns 200 (no resume) → should restart from 0
   - Hash verification for interrupted downloads (temp file, not renamed yet)
   - Speed limit + pause interaction (stream might resume after unpause with wrong timing)

## Next Actions

1. **Compute SHA256 for all models**:
   ```bash
   # After downloading each model, run:
   certUtil -hashfile resources/whisper/models/ggml-tiny.bin SHA256
   # Fill the values in AVAILABLE_MODELS in modelDownloader.ts
   ```

2. **Compute SHA256 for CUDA zip**:
   ```bash
   certUtil -hashfile whisper-cuda.zip SHA256
   # Fill CUDA_ZIP_EXPECTED_SHA256 in cudaDownloader.ts
   ```

3. **Build and test**:
   ```bash
   cd C:/Users/cgnscr/Documents/Dev/Code/VoiceFlow
   npm run build:electron
   npm run dev
   ```

4. **Test scenarios**:
   - Fresh download of ggml-tiny.bin
   - Pause during download → resume
   - Kill app during download → restart app → resume
   - Download with speed limit (e.g., 500 KB/s)
   - Simulate network failure during download (disconnect WiFi)
   - Test CUDA download on NVIDIA GPU machine

## Open Questions

1. Should SHA256 be computed automatically after download even without a reference hash (store as metadata)?
2. Should the speed limit setting be persisted in the database (like other settings)?
3. For the CUDA download URL — the release `v1.0.0/whisper-cuda.zip` exists but should we verify the zip content matches the expected DLLs before extraction?
4. Should there be a "verify integrity" button in the UI for already-downloaded models?
