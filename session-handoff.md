# Session Handoff

## Session: 2026-07-12 (LLM Download Pause/Cancel + Tab Switch Resilience)

### Summary
Menambahkan tombol Pause dan Cancel untuk LLM model download. Memperbaiki bug progress hilang saat pindah tab — root cause: component LlmModels di-unmount saat tab switch → listener `onLlmDownloadProgress` dihapus → progress event dari main process tidak tertangkap. Fix dengan dual subscription (`onLlmDownloadProgress` + `onDownloadProgress` filtered by `type: 'llm'`) + restore state via `llmGetDownloadState()` pada mount.

### Files Changed
| File | Change |
|------|--------|
| `electron/modules/llmPostProcessor.ts` | Tambah `pauseDownload()`, `cancelDownload()`, `resumeDownload()`, `getDownloadState()`. Download track state (`downloadCancelled`, `downloadPaused`, `downloadRequest`). Stream data handler check pause/cancel per chunk. |
| `electron/ipc/dictation.ipc.ts` | Tambah 4 IPC handler: `llm-pause-download`, `llm-resume-download`, `llm-cancel-download`, `llm-get-download-state`. Masing-masing broadcast ke `llm-download-progress` + `download-progress` (type: 'llm'). |
| `electron/preload.ts` | Tambah `llmPauseDownload`, `llmResumeDownload`, `llmCancelDownload`, `llmGetDownloadState` ke interface + contextBridge |
| `src/types/electron.d.ts` | Tambah tipe untuk 4 fungsi baru |
| `src/pages/LlmModels.tsx` | **Rewrite**: subscribe ke BOTH `onLlmDownloadProgress` DAN `onDownloadProgress` (filter type:'llm'). Panggil `llmGetDownloadState()` saat mount untuk restore progress setelah tab switch. Tombol Pause + Cancel di progress card. Resume = restart download (tanpa resume support). |

### Decisions
- **Dual subscription**: `onLlmDownloadProgress` untuk real-time saat tab aktif, `onDownloadProgress` filtered by `type:'llm'` untuk catch event saat tab switch. Ini solusi redundancy terbaik.
- **Restore state on mount**: `loadData()` panggil `llmGetDownloadState()` — jika state 'downloading'/'paused', restore UI state. Ini handle kasus tab switch + app restart.
- **Pause = stream pause**: Res API di-pause via `res.pause()`. Karena tanpa HTTP range header support untuk resume, pause hanya freeze stream — data in-transit hilang. Resume = restart download dari awal.
- **Cancel = abort + cleanup**: Destroy request, hapus temp file `.download`, reset state.
- **mountedRef guard**: Cegah setState setelah component unmount.

### Risks / Technical Debt
1. **No HTTP Range resume**: Pause → Resume = restart dari 0%. File partial tetap ada di `.download`. Perlu HTTP Range header + temp file tracking untuk resume sejati.
2. **Pause mid-chunk**: Data yang sudah di-buffer (`res.on('data')`) tidak bisa di-un-read. Partial chunk mungkin terpotong.
3. **Thread safety**: `downloadCancelled`/`downloadPaused` flags dibaca dari callback stream — tidak ada mutex. Risiko race condition minimal karena single-threaded Node.js event loop.
4. **TODO/FIXME**: Belum ada cleanup temp file `.download` jika app crash saat download.

### Next Actions
1. [ ] Test download → Pause → lihat UI freeze → Resume → download restart dari 0
2. [ ] Test download → pindah tab Settings → balik ke LLM → progress masih ada
3. [ ] Test download → Cancel → file temp terhapus
4. [ ] Test download selesai → otomatis aktifkan + notif sukses
5. [ ] Tambah HTTP Range resume support (opsional, future improvement)
6. [ ] Single-instance lock (`app.requestSingleInstanceLock`)

### Open Questions
- Apakah pause benar-benar berguna tanpa resume support? Mungkin lebih baik ganti pause jadi stop (yang cleanup temp file) dan hanya cancel. Untuk sekarang pause = freeze stream.
