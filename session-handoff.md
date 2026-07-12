# Session Handoff

## Session: 2026-07-12 (Fix LLM Download Progress)

### Summary
Memperbaiki LLM model download yang progress bar-nya stuck di 0%. Root cause: 3 bugs yang saling terkait — LlmModels.tsx tidak subscribe ke progress events, progress event format mismatch, dan download handler tidak handle redirect chain HuggingFace dengan benar.

### Files Changed
| File | Change |
|------|--------|
| `electron/ipc/dictation.ipc.ts` | Fix progress event: include `downloadedBytes`/`totalBytes`, gunakan channel dedicated `llm-download-progress`, kirim completed/error event setelah download selesai |
| `electron/modules/llmPostProcessor.ts` | Rewrite `downloadFileStreaming`: fix `this` context via `self` capture, handle HuggingFace redirect chain (max 5), backpressure via stream drain, throttle progress updates, validasi file size minimal 1KB, User-Agent Mozilla |
| `electron/preload.ts` | Tambah `onLlmDownloadProgress` ke ElectronAPI interface + contextBridge |
| `src/types/electron.d.ts` | Tambah `onLlmDownloadProgress` type |
| `src/pages/LlmModels.tsx` | **Rewrite total**: subscribe ke `onLlmDownloadProgress` via useEffect, track `downloadedBytes`/`totalBytes` state, handle error/complete states, format speed display, progress bar animasi |
| `electron/ipc/dictation.ipc.ts` | Import `AVAILABLE_LLM_MODELS` dari `llmPostProcessor` untuk dapat sizeBytes model |

### Decisions
- **Dedicated channel**: LLM download pake `llm-download-progress` channel, bukan `download-progress` (whisper channel). Biar tidak conflict dan datanya bisa beda format.
- **Self capture**: Di Node.js `http.get` callback, `this` tidak指向 class instance. Fix dengan `const self = this` di top-level Promise.
- **Redirect chain**: HuggingFace sering redirect CDN (cloudfront, etc). Handler now follows up to 5 redirects secara rekursif.
- **Backpressure**: `res.pause()`/`res.resume()` via `drain` event mencegah memory leak saat download file besar.
- **Progress throttle**: Hanya update state kalau progress% berubah, tidak setiap chunk (mencegah flooding IPC).
- **User-Agent**: `Mozilla/5.0` + `VoiceFlow/1.0` — beberapa CDN block request tanpa User-Agent browser.
- **Accept-Encoding: identity**: Mencegah gzip/compress agar content-length akurat.

### Risks / Technical Debt
1. **HuggingFace rate limiting**: Jika user download multiple models sekaligus, HuggingFace mungkin rate-limit. Saat ini hanya 1 download at a time.
2. **No download resume**: Download di-cancel setengah jalan, harus ulang dari awal. Belum ada resume support.
3. **No pause/cancel for LLM**: Tidak seperti whisper downloader, LLM download tidak punya tombol pause/cancel. Perlu ditambahkan.
4. **Type safety**: `LlmModels.tsx` masih pakai `any[]` untuk beberapa state. Belum ada interface terpisah.
5. **Memory**: File download stream ke disk via `fs.createWriteStream`, jadi memory safe. Tapi file temp `.download` tidak di-cleanup jika app crash.

### Next Actions
1. [ ] Test download LLM model via UI — verifikasi progress bar berjalan 0% → 100%
2. [ ] Test download dengan jaringan lambat / intermittent (simulasi throttle)
3. [ ] Test cancel mid-download → restart app → download lagi (verifikasi temp file cleanup)
4. [ ] Tambah pause/cancel button untuk LLM download di UI
5. [ ] Tambah single-instance lock (app.requestSingleInstanceLock)

### Open Questions
- Apakah perlu resume support untuk LLM download (model bisa >600MB)?
- Apakah perlu validasi SHA256 untuk LLM model seperti whisper?
