# Session Handoff

## Session: 2026-07-12 (Fix UI Blank Screen)

### Summary
Memperbaiki masalah UI ngeblank saat `npm run dev`. Root cause: port conflict (port 5173 masih dipakai session sebelumnya) menyebabkan Vite tidak bisa serve file dengan benar, sehingga Electron menerima HTML tanpa JavaScript yang berfungsi → blank screen.

### Files Changed
| File | Change |
|------|--------|
| `package.json` | Added pre-kill port 5173 logic in `dev` and `dev:first-run` scripts, added `?timeout=15000` to `wait-on` |
| `vite.config.ts` | `strictPort: true` (kembali ke semula) |
| `electron/main.ts` | Added `.catch()` fallback to `dist/index.html` when dev URL fails; added console logs for debugging |
| `src/App.tsx` | Added `ErrorBoundary` class component to catch React errors and display them instead of blank screen; added console logs at init |
| `src/styles/app.css` | Removed debug overlay |

### Decisions
- **Pre-kill port 5173**: Simple `node -e` script sebelum `concurrently` untuk matikan proses yang masih hold port 5173. Solusi portabel tanpa dependensi tambahan.
- **Fallback di loadURL**: Jika Vite tidak available di port 5173 (misal pindah port karena conflict), Electron fallback ke production build `dist/index.html`. Ini memastikan UI tetap muncul meski dev server bermasalah.
- **Error Boundary**: Mencegah React crash total. Jika ada error, tampilkan error message alih-alih layar putih.
- **wait-on timeout 15s**: Mencegah `wait-on` stuck selamanya jika port tidak kunjung available.

### Risks / Technical Debt
1. **Pre-kill script Windows-specific**: `netstat -ano | findstr :5173` hanya work di Windows. Untuk cross-platform perlu conditional.
2. **ErrorBoundary hanya di App level**: Jika error terjadi di komponen yang di-lazy load (Settings, Models, dll), ErrorBoundary akan menampilkan fallback. Ini OK tapi perlu dipastikan fallback tidak mengganggu UX.
3. **Multiple electron instances**: Pada pengujian, terlihat banyak instance electron menumpuk setelah beberapa kali `Ctrl+C`. Perlu mekanisme single-instance lock.
4. **Belum ada automated test**: UI blank issue hanya bisa dideteksi secara manual. Perlu screenshot/E2E test.

### Next Actions
1. [ ] Test `npm run dev` untuk memastikan UI muncul dengan benar
2. [ ] Test dengan kondisi port 5173 sudah dipake (simulasi dengan `npx serve` di port 5173)
3. [ ] Tambah single-instance lock di Electron (app.requestSingleInstanceLock)
4. [ ] Hapus konsol log debugging yang sudah tidak diperlukan

### Open Questions
- Apakah perlu menggunakan port random (0) + komunikasi port via stdout untuk menghindari port conflict sama sekali?
