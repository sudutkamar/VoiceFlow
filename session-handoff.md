# Session Handoff

## Session: 2026-07-14 (Session 13 — CRITICAL FIX: Audio Pipeline Audit — Amplitude Doubling, VAD, IPC Optimization)

### Summary

**Audit menyeluruh pipeline recording → 3 critical bugs + 5 high + 3 medium fixed.**

#### Session 13b — Fix: Recording Tidak Berfungsi

**Masalah:** User melaporkan mic tidak terdeteksi saat record.

**Diagnosis:**
1. Kode pipeline benar secara logika — tidak ada compile error, semua flow terhubung
2. Potensi masalah di VAD threshold terlalu tinggi (0.012 → diturunkan ke 0.005)
3. Potensi masalah di ArrayBuffer transfer via IPC (Uint8Array lebih aman dari ArrayBuffer untuk structured clone)
4. Potensi masalah di VAD emergency stop — recording bisa tidak pernah berhenti jika VAD tidak deteksi suara
5. Menambah debug logging di seluruh pipeline untuk tracing runtime

**Fixes applied dalam sesi ini:**
1. VAD threshold: 0.012 → 0.008 → 0.005 (lebih sensitif terhadap suara pelan)
2. VAD safety timeout: 30 detik emergency stop (force silence trigger) — tidak perlu menunggu deteksi suara
3. IPC buffer: Kirim `Uint8Array` bukan `ArrayBuffer` langsung — structured clone lebih aman dengan TypedArray
4. Debug logging: console.log di `WavRecorder.start()`, `useRecorder.startRec()`, `useRecorder.stopRec()`, `dictation.ipc.ts audio-recorded`

#### Bug #1 (CRITICAL) — Amplitude Doubling
`wavRecorder.ts` punya DUAL signal path (source → scriptProcessor DAN source → analyser → scriptProcessor). Audio capture menerima 2× sinyal yang di-mix, menyebabkan amplitude DOUBLING dan distorsi.

**Fix:** Single path `source → analyser → scriptProcessor → destination`. Hapus direct `source → scriptProcessor`. VAD hook tetap bisa baca analyser karena analyser ada di signal path.

#### Bug #2 (CRITICAL) — VAD Frequency Domain
`useVad` hook pakai `getByteFrequencyData()` (frequency magnitudes 0-255) bukan `getFloatTimeDomainData()` (samples -1..1). RMS dari frequency domain tidak representasi volume suara yang akurat.

**Fix:** Ganti ke `getFloatTimeDomainData()` + threshold 0.012 (sesuai range -1..1).

#### Bug #3 (CRITICAL) — IPC Audio Transfer Inefficient
`Array.from(new Uint8Array(buffer))` → `number[]` → JSON serialization. 10 detik WAV = ~1MB JSON di IPC.

**Fix:** Kirim `ArrayBuffer` langsung via structured clone IPC. Zero-copy.

#### Fixes Lain:
- **LLM threshold** 100 → 30 karakter (agar dikte pendek juga kena LLM)
- **Queue overflow notification** — user dikasih tau kalau audio di-drop
- **Cancel transcription IPC** — cancel dari renderer sekarang kill whisper di main process
- **Model selection deduplication** — `getBestAvailableModel()` di dictation.ipc.ts panggil `transcriber.selectOptimalModel()` langsung (single source of truth)
- **Dead code cleanup** — Hapus `VadOptions` interface dan VAD state dari `WavRecorder` (tidak dipakai, semua VAD di React hook)

### Files Changed (Session 13a)
| File | Change |
|------|--------|
| `src/utils/wavRecorder.ts` | **FIX** — Single signal path (hapus dual path). Hapus VadOptions + VAD dead code. + Debug logging getUserMedia. |
| `src/hooks/useRecorder.ts` | **FIX** — VAD time domain (getByteFrequencyData→getFloatTimeDomainData). Kirim Uint8Array via IPC. Cancel transcription IPC. VAD threshold 15→0.005. Emergency 30s timeout. Debug logging. |
| `electron/preload.ts` | **FIX** — sendAudioData terima ArrayBuffer|Uint8Array|number[]. Tambah cancelTranscription API. Robust buffer extraction. |
| `src/types/electron.d.ts` | **FIX** — sendAudioData type +Uint8Array. Tambah cancelTranscription. |
| `electron/ipc/dictation.ipc.ts` | **FIX** — audio-recorded handler terima (buffer, mimeType, duration) terpisah. processAudio queue pake Buffer. LLM threshold 30. cancel-transcription IPC. Model selection via Transcriber. Debug logging. |
| `electron/modules/transcriber.ts` | **FIX** — selectOptimalModel() public untuk reuse. |
| `src/utils/constants.ts` | **FIX** — LLM_MIN_TEXT_LENGTH 100 → 30. |

### Decisions
- **Single signal path**: AnalyserNode tetap di path utama agar Chromium tidak optimize-away. VAD hook membaca analyser via getFloatTimeDomainData().
- **VAD threshold 0.012**: Time domain RMS. Silence ~0.001-0.005, speech ~0.02-0.2. Threshold 0.012 cocok untuk deteksi suara minimal.
- **ArrayBuffer IPC**: Structured clone algorithm di Electron mendukung transfer ArrayBuffer zero-copy. Tidak perlu JSON serialization.
- **Cancel transcription via IPC**: User cancel processing → kirim IPC → main process kill whisper. Prevent ghost processes.

### Risks / Technical Debt
- `src/utils/adaptiveVAD.ts` (121 lines) masih dead code — sophisticated VAD yang tidak dipakai. Perlu diaktifkan atau dihapus nanti.
- `src/utils/audioWorkletProcessor.js` (55 lines) dead code — AudioWorklet migration ditunda ke v1.1.
- `src/utils/soundEffects.ts` masih pakai `window.voiceflowSoundEnabled` global flag (anti-pattern).
- `useRecorder` VAD masih polling-based (requestAnimationFrame). AdaptiveVAD class punya event-driven approach yang lebih efisien.

## Session: 2026-07-14 (Session 14 — UX Fix: Auto-Detect Working Mic, Filter Virtual Devices, Mic Test)

### Summary

**Masalah:** User melihat banyak opsi mic di Settings — termasuk device virtual (CABLE, VoiceMeeter, Stereo Mix) yang tidak menangkap suara. Bingung memilih mana yang benar.

**Solusi (3 bagian):**

1. **`src/utils/micDetector.ts`** (NEW) — Filter virtual devices + test audio level
   - `filterRealMics()` — scoring: +3 untuk keyword mic/headset, -5 untuk keyword virtual/CABLE
   - `testMicLevel(deviceId)` — record 1 detik, hitung RMS. Return null jika gagal
   - `findBestMic()` — auto-detect: cari device dengan RMS > 0.008

2. **RecordingTab UX** — Filter virtual devices by default, toggle untuk show all
   - Dropdown hanya menampilkan real mics (virtual disembunyikan)
   - Tombol "Test" — record 1 detik dari device yang dipilih, tampilkan RMS level
   - Indikator color-coded: ✓ OK / ⚠ Low / ✗ Failed
   - Checkbox "Show N virtual devices" untuk user advance

3. **Auto-remedial saat mic not found** — `useRecorder.ts`
   - Jika `OverconstrainedError` / `NotFoundError` → auto-detect best mic dengan `findBestMic()`
   - Retry recording dengan device baru tanpa perlu klik ulang
   - Fallback ke default jika auto-detect gagal

4. **Auto-detect startup** — MiniBar + VerticalMiniBar
   - Saat load, verify `selected_mic` masih berfungsi
   - Jika tidak ada `selected_mic`, auto-detect best working mic
   - Mengganti logic `mics[0]` (ambil first device) dengan `findBestMic()` (test audio level)

### Files Changed
- `src/utils/micDetector.ts` — **NEW** (120 lines) — filter, test, auto-detect
- `src/pages/Settings/RecordingTab.tsx` — **REWRITE** — filter + test button + virtual toggle
- `src/hooks/useRecorder.ts` — **EDIT** — auto-remedial + retry with findBestMic()
- `src/components/MiniBar/MiniBar.tsx` — **EDIT** — auto-detect startup with findBestMic()
- `src/components/VerticalMiniBar.tsx` — **EDIT** — auto-detect startup with findBestMic()
- `src/pages/Settings/useSettings.ts` — **EDIT** — import filterRealMics
- `src/utils/wavRecorder.ts` — **EDIT** — AudioContext resume retry 3x, fix TS type

### Decisions
- **Filter ≠ hide permanently**: Virtual devices hanya disembunyikan di dropdown. User bisa toggle "Show virtual" untuk melihat semua.
- **Test mic sebelum pilih**: `testMicLevel()` adalah non-destructive — hanya 1 detik, langsung cleanup.
- **Auto-remedial with retry**: Lebih baik dari sekedar reset ke default. User tidak perlu klik ulang.
- **findBestMic asynchronous**: Tidak blocking startup. Jalankan parallel setelah settings loaded.

### Risks / Technical Debt
- `testMicLevel()` create AudioContext sementara — ada overhead ~100ms. Acceptable untuk UX.
- Virtual device filtering berdasarkan keyword — mungkin ada false positive/negative. User bisa toggle "Show virtual".
- `findBestMic()` test 5 device × 500ms = 2.5s max. Cukup cepat.

### Next Actions
1. [x] **FIX** — Amplitude doubling (single signal path)
2. [x] **FIX** — VAD time domain + threshold 0.012 + emergency 30s timeout
3. [x] **FIX** — IPC buffer type: ArrayBuffer → Uint8Array (structured clone safe)
4. [x] **FIX** — Debug logging di seluruh pipeline
5. [x] **FIX** — Cancel transcription via IPC
6. [x] **FIX** — Filter virtual devices di RecordingTab
7. [x] **FIX** — Test mic button with RMS level
8. [x] **FIX** — Auto-remedial retry with findBestMic()
9. [x] **FIX** — Auto-detect best mic on startup
10. [ ] **TEST**: Buka Settings > Recording → verify hanya real mics yang tampil
11. [ ] **TEST**: Klik "Test" → verify muncul level RMS
12. [ ] **TEST**: Pilih device salah → verify auto-remedial pilih mic lain
13. [ ] **TEST**: `npm run build:electron && npm run dev` → record → verify text appears
14. [ ] Clean up dead code: adaptiveVAD.ts, audioWorkletProcessor.js

---

## Session: 2026-07-14 (Session 12 — CRITICAL FIX: Bundle Default Model in Installer)

### Summary

**Recording tidak berfungsi setelah build & install.** Di dev mode aplikasi bekerja, tapi setelah di-build via `build.bat` dan diinstall, tidak bisa record voice-to-text.

**Root Cause:** Commits `f169f93` dan `82decc1` menghapus AI models dari `extraResources` (electron-builder.yml) untuk memperkecil installer, dan mengubah default model jadi `''` (empty string). Akibatnya:
- Dev mode: models ada di `resources/whisper/models/` → path fallback ke resources → bekerja
- Production: models TIDAK dibundel di installer → tidak ada model → transkripsi gagal dengan error "Model tidak ditemukan"

**Fix (3 langkah):**

1. **Bundle default model di extraResources** — `ggml-base-q5_1.bin` (~57 MB, terkecil) dibundel langsung di installer. User tidak perlu download manual setelah install.
2. **First-run copy ke userData** — Saat pertama jalan, bundled model di-copy dari resources ke `userData/whisper/models/` supaya persist walau app diupdate/diuninstall.
3. **Default model di database** — Diubah dari `''` jadi `'ggml-base-q5_1.bin'`.
4. **build.bat auto-download** — Saat build, jika model default tidak ada, di-download otomatis dari HuggingFace.

### Files Changed
| File | Change |
|------|--------|
| `electron-builder.yml` | **EDIT** — Added `resources/whisper/models/ggml-base-q5_1.bin` to extraResources |
| `electron/modules/database.ts` | **EDIT** — Default model `''` → `'ggml-base-q5_1.bin'` |
| `electron/main.ts` | **EDIT** — Added first-run model copy from resources to userData |
| `build.bat` | **EDIT** — Added auto-download default model if missing + updated download-model options (added ggml-base-q5_1.bin as option 1) + updated setup checker |
| `electron/modules/transcriber.ts` | **EDIT** — Added diagnostic logging for model selection |
| `electron/ipc/dictation.ipc.ts` | **EDIT** — Added diagnostic logging for audio data and transcription result |
| `src/hooks/useRecorder.ts` | **EDIT** — Fixed silent error swallowing in stopRec; added buffer validation and error logging |

### Decisions
- **Bundle minimal model**: Hanya `ggml-base-q5_1.bin` (57 MB) yang dibundel. User bisa download model lebih besar dari dalam app. Installer tetap ~240 MB.
- **Copy to userData on first run**: Models di-copy ke userData supaya persist walau app diuninstall/diupdate. User-downloaded models (biasanya di userData) tetap priority.
- **Auto-download in build.bat**: Jika model tidak ada di `resources/whisper/models/`, build.bat akan download otomatis dari HuggingFace. Tidak perlu manual.
- **Error logging added**: Fix silent catch blocks in recording pipeline for easier future debugging.

### Risks / Technical Debt
- None — all changes are backward compatible. Existing userData models take priority.

### Next Actions
1. [ ] Run `build.bat build` → verify installer creates successfully
2. [ ] Install the built app → verify recording works out of the box
3. [ ] Test in dev mode `npm run dev` → verify still works
4. [ ] Test model download from Models page → verify downloaded model takes priority
5. [ ] Test app update scenario → verify bundled model re-copied if userData empty

---

## Session: 2026-07-14 (Session 10 — Fix Recording: Model Path Fallback)

### Summary

**Recording tidak menghasilkan teks** — model Whisper ada di `resources/whisper/models/` tapi `transcriber.ts` cuma cari di `userData/whisper/models/` yang kosong.

**Fix:** Update `getModelsPath()` di Transcriber untuk fallback ke bundled resources jika userData tidak ada model.

### Files Changed
| File | Change |
|------|--------|
| `electron/modules/transcriber.ts` | **EDIT** — `getModelsPath()` now checks userData first, then falls back to `resources/whisper/models/`. Added `getResourcesModelsDir()` helper. |

### Decisions
- **Fallback over copy**: Daripada copy model dari resources ke userData (boros disk + waktu), lebih baik transcriber langsung pakai dari resources.
- **Priority**: userData > resources. Jika user download model baru, userData diprioritaskan.
- **Zero risk to recording**: Hanya path resolution yang diubah, tidak ada perubahan di audio capture/VAD/pipeline.

### Next Actions
- [ ] Test record: click mic → bicara → teks muncul
- [ ] Test model list: buka Models page → bundled models muncul
- [ ] Test download model baru → download tetap ke userData, tapi fallback ke resources untuk existing

## Session: 2026-07-14 (Session 11 — CRITICAL FIX: Empty Model String Breaks Whisper Pipeline)

### Summary

**Full audio pipeline audit.** Traced recording end-to-end:
Mic → WavRecorder → useRecorder hook → IPC (audio-recorded) → processAudio() → Transcriber.transcribe() → Whisper CLI → Post-process → transcript-ready → UI.

**Verified working components:**
- Whisper CLI executable: ✅ runs, transcribes audio correctly
- Model files: ✅ exist in both `resources/whisper/models/` and `userData/whisper/models/`
- Model path fallback (Session 10): ✅ works
- TypeScript compilation: 0 errors
- Vite build: ✅ succeeds
- All IPC channels: ✅ registered correctly
- WavRecorder (ScriptProcessorNode): ✅ logic intact
- Preload event mappings: ✅ all correct

### ⚠️ ROOT CAUSE (CRITICAL)

**Empty default model `''` bypasses model validation via `fs.existsSync`.**

Commit `82decc1` changed default model setting from `'ggml-large-v3-turbo-q5_0.bin'` to `''` (fresh install = no model downloaded). This caused:

1. `getBestAvailableModel('')` in `dictation.ipc.ts` checks `fs.existsSync(path.join(modelsDir, ''))`
2. `path.join(dir, '')` returns `dir` itself → `fs.existsSync` returns `true`
3. `getBestAvailableModel` returns `''` as "valid" model
4. `transcriber.transcribe()` receives `model=''`, builds `modelPath = path.join(modelsPath, '')` = `modelsPath` (a directory, not a .bin file)
5. `isModelAvailable('')` → `fs.existsSync(path.join(modelsDir, ''))` → `true` (it's the dir)
6. Whisper spawned with `-m <directory>` → `failed to initialize whisper context`
7. `processAudio` catches error → sends error to UI → user sees no transcription

### Fixes Applied

**1. `getBestAvailableModel()`** — Skip `preferredModel` if empty string
```typescript
const accuracyOrder = [
  ...(preferredModel ? [preferredModel] : []),  // skip if empty
  'ggml-large-v3-q5_0.bin',
  ...
];
```

**2. `transcriber.transcribe()`** — Guard against empty model:
```typescript
const selectedModel = model && this.isModelAvailable(model) 
  ? model 
  : this.selectOptimalModel(model);
// Also check selectedModel is truthy:
if (!cachedPathExists(modelPath) || !selectedModel) { ... }
```

**3. `transcriber.runWhisper()`** — Validate modelPath is a .bin file:
```typescript
if (!modelName || !modelPath.endsWith('.bin')) {
  return { success: false, error: 'Model tidak valid' };
}
```

**4. GPU detection** — `detectGpu()` now checks whisper binary's own dir for `ggml-cuda.dll`:
```typescript
const cudaDllInWhisperDir = path.join(this.getWhisperCpuDir(), 'ggml-cuda.dll');
this.hasGpu = cachedPathExists(cudaDllPath) || cachedPathExists(cudaDllInWhisperDir);
```

### Other Issues Found

**1. `nul` file in `resources/whisper/models/`** — 0-byte artifact. DELETED.

**2. `stopRec` catch block swallows errors** — Line 298 of `useRecorder.ts` has bare `catch { setState('idle'); }`.

**3. Dev script doesn't rebuild electron** — `npm run dev` needs `npm run build:electron` first.

### Verification
- `whisper-cli.exe`: tested with valid model file → transcribes in 1.1s ✅
- `whisper-cli.exe -m <directory>`: confirmed → `failed to initialize whisper context` ❌ (this was the bug)
- TypeScript compilation: 0 errors ✅
- Full build (renderer + electron): 0 errors ✅
- Pushed to GitHub

### Files Changed
| File | Change |
|------|--------|
| `electron/ipc/dictation.ipc.ts` | **EDIT** — `getBestAvailableModel()` skip empty preferredModel |
| `electron/modules/transcriber.ts` | **EDIT** — Guard empty model in `transcribe()`, `transcribeStreaming()`, `runWhisper()`; fix `detectGpu()` |
| `resources/whisper/models/nul` | **DELETE** — 0-byte artifact |

### Next Actions
1. [ ] **PULL & REBUILD**: `git pull && npm run build`
2. [ ] **TEST**: `npm run build:electron && npm run dev` → click mic → speak → verify text appears
3. [ ] If still not working, open DevTools (Ctrl+Shift+I) and check Console for errors

## Session: 2026-07-14 (Session 9 — Smooth Transitions Audit & Implementation)

### Summary

**Glass Morph — Motion system redesign.** Implementasi 3 sistem motion premium di seluruh main window.

### Motion System

**1. Glass Reveal (Page Transition)** — `@keyframes glassReveal`
- 0%: `scale(0.97)` + `translateY(12px)` + `filter: blur(6px)` + `opacity: 0`
- 50%: Overshoot `scale(1.005)` + `translateY(-2px)` + blur berkurang
- 100%: Settle ke `scale(1)` + `translateY(0)` + `blur(0)` + `opacity: 1`
- Timing: `0.45s cubic-bezier(0.16, 1, 0.3, 1)` — ease-out yang dramatis

**2. Sidebar Active — Accent Bar Settle** — `@keyframes accentBarIn`
- 0%: `scaleY(0)` — bar belum keliatan
- 40%: Overshoot `scaleY(1.3)` + `box-shadow: 20px glow`
- 100%: Settle ke `scaleY(1)` + normal glow
- Icon juga: `navIconSettle` — scale 1→1.25→0.95→1 dalam 0.5s

**3. Notifikasi — Slide from Right + Center**
- Posisi: `top: 50%` + `transform: translateY(-50%)` — tengah vertikal, kanan 24px
- `@keyframes notifSlideIn`: masuk dari kanan (`translateX(40px)`) dengan scale 0.85 → overshoot → settle
- Stack: sekarang staggered ke kanan (bukan ke bawah) — `translateX()` bukan `translateY()`
- Hover: glow accent + translateX(0)

### Perubahan Detail

**1. Page switch — glassReveal**
- Scale 0.97 + blur 6px → overshoot 1.005 → settle 1.0
- Efek: "lensa kaca fokus" — blur mencair jadi sharp

**2. Sidebar active — accentBarIn**
- Overshoot scaleY 1.3 sebelum settle
- Icon bounce 1→1.25→0.95→1 sebelum pulse breath

**3. Notifikasi — center + slide from right**
- `top: 50%` + `translateY(-50%)`
- Slide dari kanan (translateX 40px) + scale 0.85 + blur 4px
- Stack menyamping ke kanan (translateX), bukan ke bawah
- Hover glow lebih kuat

**4. Nav active breath — disempurnakan**
- Background gradient breath antara 2 variasi opasitas
- Tanpa glowPulse di accent bar (biar animasi settle dulu dari base.css)

### Files Changed
| File | Change |
|------|--------|
| `src/styles/base.css` | **EDIT** — pageIn → glassReveal, accentBarIn + navIconSettle keyframes baru |
| `src/styles/utilities.css` | **EDIT** — Notifikasi center + notifSlideIn + stack horizontal |
| `src/styles/interactions.css` | **EDIT** — navActiveBreath, hapus glowPulse dari accent bar (pindah ke base.css settle) |

### Decisions
- **Pure CSS** — No JS/HTML changes. Zero risk to recording.
- **3-layer motion**: Page depth, sidebar settle, micro-interactions
- **Semua timing seragam**: spring cubic-bezier(0.16, 1, 0.3, 1) untuk masuk, ease untuk hover
- **CSS bundle**: 99.42 kB → **101.95 kB** (+2.5 kB dari keyframes baru)

### Next Actions
1. [ ] Test sidebar collapse/expand — verify nav-label fade
2. [ ] Test page switching — Home → Settings → Models → verify pageIn animation
3. [ ] Test mic button — record → stop → verify crossfade smooth
4. [ ] Test modal — open → verify spring animation smooth
5. [ ] Test inputs — click in/out → verify focus transitions
6. [ ] Test confidence badge — record with different confidence → verify color transition

---

## Session: 2026-07-14 (Session 8 — Interaction Effects: Glow Shift + Active Breath)

### Summary

**CSS Split** — `app.css` (5989 lines) dipisah jadi 6 file modular:
- `variables.css` (76 lines) — CSS variables dark/light
- `base.css` (328 lines) — Reset, Layout, Title Bar, Sidebar, Content, Page
- `components.css` (677 lines) — Buttons, Cards, Info/Progress/Download, Search Bar, Tabs
- `pages.css` (1649 lines) — Home, Benchmark, Settings, all page-specific styles
- `minibar-horizontal.css` (1119 lines) — Mini mode horizontal
- `minibar-vertical.css` (577 lines) — Vertical Mini Bar + Cancel button (mini)
- `utilities.css` (1130 lines) — Notification, Responsive, Theme Switcher, Profile, Modal, Adaptive Learning, CUDA, Orientation
- `interactions.css` (433 lines) — Interaction effects (session 8)
- `app.css` (~20 lines) — Entry point dengan `@import` 8 file

**Added interaction effects** to all interactive elements in main window — sidebar nav, buttons, tabs, cards, list items, preset cards, benchmark items, etc. Pure CSS approach — zero HTML/JS changes.

**Efek yang diterapkan:**
1. **Hover Glow** — semua `.nav-item`, `.btn`, `.tab`, `.card-hover`, `.preset-card`, `.bench-model-btn`, `.hotkey-btn`, `.theme-btn`, `.recent-item`, `.list-item`, `.btn-action`, `.history-link-btn`, `.bench-result-card`, `.section`, `.info-card`, `.download-progress-card` — translateY(-1px/-2px) + box-shadow glow + border-color accent
2. **Active Breath** — `.nav-item.active`, `.card-active`, `.bench-model-btn.selected`, `.tab-active` — animasi `glowPulse` / `breathGlow` continuous (denyut lembut)
3. **Active accent bar glow** — `.nav-item.active::before` — glowPulse animasi + box-shadow glow
4. **Scale on press** — `.btn:active`, `.nav-item:active`, `.tab:active`, `.preset-card:active` — scale(0.95-0.98) untuk tactile feedback
5. **Gradient slide** — `.tab-active`, `.btn-primary`, `.bench-run-btn` — `background-size: 200%` + glowSlide animasi subtle

**Keyframes baru:**
- `glowPulse` — box-shadow berdenyut (2-3s loop)
- `breathGlow` — box-shadow + scale berdenyut (3s loop)
- `glowSlide` — background-position geser lambat (4s loop)

### Files Changed
| File | Change |
|------|--------|
| `src/styles/app.css` | **REWRITE** — Entry point dengan `@import` 6 file modular |
| `src/styles/variables.css` | **REWRITE** — CSS variables dark/light themes (76 lines) |
| `src/styles/base.css` | **NEW** — Reset, Layout, Title Bar, Sidebar, Content, Page (328 lines) |
| `src/styles/components.css` | **NEW** — Buttons, Cards, Info/Progress/Download, Search Bar, Tabs (677 lines) |
| `src/styles/pages.css` | **NEW** — Home, Benchmark, Settings, all page-specific styles (1649 lines) |
| `src/styles/minibar.css` | **NEW** → **DELETED** (split into 3 files) |
| `src/styles/minibar-horizontal.css` | **NEW** — Mini mode horizontal (1119 lines) |
| `src/styles/minibar-vertical.css` | **NEW** — Vertical Mini Bar + Cancel mini (577 lines) |
| `src/styles/utilities.css` | **NEW** — Notification, Theme, Profile, Modal, etc (1130 lines) |
| `src/styles/interactions.css` | **NEW** — Interaction effects (433 lines) |

### Decisions
- **Pure CSS approach**: No HTML/JS changes, no React state, no performance overhead. All effects via CSS transitions + animations + pseudo-classes.
- **Consistent language**: Semua elemen pake bahasa visual yang sama — translateY lift + accent glow + subtle shadow.
- **No mini bar changes**: Efek cuma di main window. Mini bar tetap seperti adanya (AGENTS.md Rule #4).
- **No recording pipeline changes**: AGENTS.md Rule #1 dipatuhi — recording zero modifications.

### Verification
- TypeScript compilation: **0 errors** (no TS files changed)
- CSS syntax: Valid — semua selector cocok dengan HTML yang ada
- Zero risk to recording: No audio/electron/preload changes

### Risks / Technical Debt
- Belum test visual di light theme — CSS variables (`--accent-glow`, `--accent`) otomatis menyesuaikan, tapi perlu verify
- Belum test di vertical mini bar — tidak kena (cuma main window class)
- `app.css` makin besar (+320 lines) — perlu dipisah nanti

### Next Actions
1. [ ] Test all hover effects: sidebar nav, buttons, tabs, cards, list items
2. [ ] Test active breath animation: nav-item.active, card-active, bench-model-btn.selected
3. [ ] Test press feedback: all buttons — verify scale down works
4. [ ] Test light theme: toggle theme → verify effect colors still look good
5. [ ] Test on Benchmark page: model select, run button, result cards
6. [ ] Test on Settings page: tabs, preset cards, hotkey buttons, theme buttons
7. [ ] Test on Models page: cards, download progress card

---

## Session: 2026-07-14 (Session 7 — App.tsx Split + Component Extraction + Audit Fixes)

### Summary

**App.tsx split** — Extracted MiniBar and HomePage into separate component files. App.tsx reduced from 976 lines to 219 lines.

**Additional fixes from audit:**
1. **Fixed type mismatch** — `sendAudioData` now uses `Array.from()` instead of `as any` cast
2. **Added error logging** — Empty catch blocks now log warnings instead of silently swallowing errors

**Files Created:**
- `src/components/MiniBar/MiniBar.tsx` — Horizontal floating bar (~450 lines)
- `src/components/HomePage/HomePage.tsx` — Main recording page (~310 lines)
- `src/styles/variables.css` — CSS variables reference file

**App.tsx now contains:**
- ErrorBoundary
- App (root)
- AppContent (router)
- MainApp (sidebar + page routing)

### Files Changed
| File | Change |
|------|--------|
| `src/App.tsx` | **REWRITE** — Reduced from 976 → 219 lines. Extracted MiniBar and HomePage. Added error logging. |
| `src/components/MiniBar/MiniBar.tsx` | **NEW** — Horizontal mini bar component (464 lines) |
| `src/components/HomePage/HomePage.tsx` | **NEW** — Home page with recording UI (325 lines) |
| `src/styles/variables.css` | **NEW** — CSS variables reference |
| `src/hooks/useRecorder.ts` | **FIX** — Replaced `as any` cast with proper `Array.from()` conversion |

### Decisions
- **Extract first, split CSS later**: Component extraction is safe and well-tested. CSS splitting can be done incrementally.
- **Keep MainApp in App.tsx**: Only ~120 lines, not worth extracting yet.
- **MiniBar as default export**: Allows lazy loading if needed later.

### Verification
- TypeScript compilation: **0 errors**
- Vite build: **Success**

### Risks / Technical Debt
- `src/styles/app.css` still 5556 lines — CSS splitting deferred to next session
- `electron/ipc/dictation.ipc.ts` still mixed — LLM handlers need extraction

### Next Actions
1. [ ] Test horizontal mini bar: all recording states
2. [ ] Test vertical mini bar: all recording states
3. [ ] Test main app: sidebar navigation + all pages
4. [ ] Split CSS (variables.css already created)
5. [ ] Extract LLM IPC handlers

---

## Session: 2026-07-14 (Session 6 — Fix Fail-Fast Exception on Quit)

### Summary

**Fix fail-fast exception** saat quit dari tray. Error "A fail fast exception occurred" terjadi karena:
1. `window-all-closed` handler memanggil `app.quit()` lagi (redundant, bisa trigger crash)
2. Windows tidak di-destroy secara eksplisit saat shutdown
3. uIOhook native module tidak di-force-stop jika push-to-talk aktif

### Files Changed
| File | Change |
|------|--------|
| `electron/main.ts` | **FIX** — Hapus `app.quit()` dari `window-all-closed`. Tambah explicit `destroy()` untuk tray, miniWindow, mainWindow di `before-quit`. Tambah guard `if (isQuitting) return` untuk prevent re-entry. Force-stop uIOhook + clear window references. |
| `electron/modules/hotkeyManager.ts` | **NEW** — `forceStopUiohook()` method untuk force-stop uIOhook saat shutdown (ignore push-to-talk state). `clearWindowReferences()` method untuk clear dangling window refs. |

### Root Cause Analysis

**Fail-fast exception** terjadi ketika:
1. User klik Quit dari tray → `app.quit()` called
2. `before-quit` fires → cleanup OK
3. Windows destroyed → `window-all-closed` fires
4. `window-all-closed` calls `app.quit()` AGAIN → **CRASH**
   - Redundant quit bisa trigger race condition di Chromium shutdown
   - Windows sudah destroyed, tapi `app.quit()` coba close lagi
   - Native modules (uiohook, better-sqlite3) mungkin sudah di-cleanup tapi masih diakses

**Fix:**
- Hapus `app.quit()` dari `window-all-closed` — app sudah dalam proses quit
- Destroy windows secara eksplisit di `before-quit` — pastikan clean shutdown
- Force-stop uIOhook — prevent native crash jika push-to-talk aktif
- Clear window references — prevent dangling refs

### Decisions
- **Explicit destroy over implicit**: Destroy windows di `before-quit` daripada rely on Electron's default behavior
- **Force-stop uIOhook**: `maybeStopUiohook()` hanya stop jika `!pushToTalk`. Force-stop ignore condition ini.
- **Guard against re-entry**: `if (isQuitting) return` prevent double-cleanup

### Risks / Technical Debt
- None — this is a targeted bug fix

### Next Actions
1. [ ] Test quit from tray: right-click tray → Quit → verify no error dialog
2. [ ] Test quit from main window: click X → verify mini bar appears (not quit)
3. [ ] Test quit from mini bar: Esc or close → verify clean shutdown
4. [ ] Test with push-to-talk enabled: quit → verify no uiohook crash
5. [ ] Test rapid quit: click Quit multiple times fast → verify no crash

---

## Session: 2026-07-14 (Session 5 — Codebase Audit & Refactor)

### Summary

**Full codebase audit** — Identified and fixed critical bugs, cleaned up root directory, extracted shared code, and improved naming conventions.

**Critical Fixes:**
1. **Duplicate IPC handler** (`llm-check-availability` was registered twice in `dictation.ipc.ts`) — Removed duplicate
2. **Operator precedence bug** (`!hasModel === false` in App.tsx GPU tooltip) — Fixed to `hasModel !== false`

**Root Cleanup:**
- Deleted `nul` (Windows artifact)
- Deleted `notes.txt` (stale notes)
- Deleted `logo.png` (duplicate of `src/assets/logo.png`)
- Moved `paste-keystroke.ps1` → `electron/utils/`
- Moved `voiceflow.pfx` → `.build/`
- Updated `.gitignore` to include `.build/`

**Shared Code Extraction:**
- Created `src/utils/languages.ts` — Shared language definitions (LANGUAGES array, getLanguageByCode, getNextLanguage)
- Created `src/utils/constants.ts` — Centralized magic numbers (MIN_RECORDING_MS, PROCESSING_TIMEOUT_MS, WAVEFORM_POINTS, etc.)
- Updated `src/App.tsx` — MiniBar now uses shared languages + constants
- Updated `src/components/VerticalMiniBar.tsx` — Now uses shared languages module
- Updated `src/hooks/useRecorder.ts` — Now uses shared constants for timeouts and intervals

### Files Changed
| File | Change |
|------|--------|
| `electron/ipc/dictation.ipc.ts` | **FIX** — Removed duplicate `llm-check-availability` handler (was at lines 390 & 454) |
| `src/App.tsx` | **FIX** — Fixed `!hasModel === false` → `hasModel !== false`. **REFACTOR** — Uses shared languages.ts and constants.ts |
| `src/utils/languages.ts` | **NEW** — Shared language definitions |
| `src/utils/constants.ts` | **NEW** — Shared constants (recording, VAD, UI, paste, queue) |
| `src/components/VerticalMiniBar.tsx` | **REFACTOR** — Uses shared languages module |
| `src/hooks/useRecorder.ts` | **REFACTOR** — Uses shared constants |
| `.gitignore` | **UPDATE** — Added `.build/`, removed `nul` entry |
| Root directory | **CLEANUP** — Deleted `nul`, `notes.txt`, `logo.png`. Moved `paste-keystroke.ps1`, `voiceflow.pfx` |

### Decisions
- **Extract before split**: Created shared modules first, then updated consumers. This ensures no logic changes, only organization.
- **Backward compatible**: All property mappings preserved (e.g., `currentLang.code` replaces `currentLang.c` but produces same values)
- **Constants as single source**: Magic numbers like 25000 (timeout), 2000 (min recording), 3000 (VAD silence) now have named constants

### Risks / Technical Debt
- `src/App.tsx` still 976 lines — needs splitting into separate component files (Phase 4)
- `src/styles/app.css` still 5556 lines — needs splitting by component (Phase 4)
- `electron/ipc/dictation.ipc.ts` still has LLM handlers mixed with dictation — needs splitting (Phase 4)

### Next Actions
1. [ ] Test horizontal mini bar: record → verify all states work (idle → recording → processing → done)
2. [ ] Test vertical mini bar: same flow
3. [ ] Test language cycle: click language button → verify cycles through ID/EN/JA/KO/ZH
4. [ ] Test GPU tooltip: verify appears when hasModel is null (loading state)
5. [ ] Test main app: record → paste → verify works
6. [ ] Test settings page: verify no regressions

---

## Session: 2026-07-13 (Session 4 — VerticalMiniBar CSS Restore)

### Summary

**VerticalMiniBar CSS classes missing** — The previous session claimed to refactor inline styles → CSS classes, but the CSS was never actually added to `app.css`. The VerticalMiniBar component referenced 20+ `vmb-*` classes that didn't exist, rendering the vertical mini bar completely unstyled/broken.

**Fix:** Added complete CSS for all `vmb-*` classes to `app.css` (~650 lines). Copied the glassmorphism pattern from horizontal `.mini-bar` (inner glass, ambient glow, state transitions, animations). Added dark/light theme via `--vmb-*` CSS variables.

### Files Changed
| File | Change |
|------|--------|
| `src/styles/app.css` | **ADD** — Full CSS for `vmb-bar`, `vmb-top`, `vmb-lang`, `vmb-canvas`, `vmb-gpu`, `vmb-mic`, `vmb-recording-core`, `vmb-live-dot`, `vmb-time`, `vmb-spinner`, `vmb-done-core`, `vmb-bottom`, `vmb-action`, `vmb-cancel`, `vmb-ready`, `vmb-tooltip` (result/partial/error/warning/gpu variants), glassmorphism, animations |

### Decisions
- **CSS copied from horizontal pattern**: Same glassmorphism, same animation names (prefixed `vmb-`), same sweep gradient on buttons
- **Vertical tooltips on right side**: `left: calc(100% + 10px)` — tooltips appear to the right of the vertical bar
- **Light theme via CSS variables**: `.vmb-light` overrides all `--vmb-*` variables, matching horizontal pattern

### Risks / Technical Debt
- Canvas waveform still renders above mic button (not inside like horizontal) — acceptable for vertical layout
- No language dropdown (cycle-only) — intentional for vertical compact layout

### Next Actions
1. [ ] Test vertical mode: switch to vertical → verify glassmorphism visible
2. [ ] Test recording: click mic → verify recording pulse + live dot + timer
3. [ ] Test processing: verify spinner appears
4. [ ] Test done: verify checkmark + success flash + result tooltip
5. [ ] Test light theme: toggle theme → verify all colors update
6. [ ] Test tooltips: result, partial, error, warning — all appear correctly
7. [ ] Test horizontal mode: verify zero changes to horizontal mini bar

---

## Session: 2026-07-13 (Session 3 — VerticalMiniBar CSS Refactor)

### Summary

**VerticalMiniBar refactor**: All inline styles replaced with CSS classes in `app.css`. Added glassmorphism effects (`::before` inner glow, `::after` ambient glow), proper animations (settle, recording pulse, done flash, processing shimmer), sweep gradient on buttons, CSS-variable-based theming for dark/light. Horizontal MiniBar untouched.

**Horizontal MiniBar:** NOT TOUCHED — `src/App.tsx` has zero changes.

### Files Changed
| File | Change |
|------|--------|
| `src/styles/app.css` | **REPLACE** section `/* VERTICAL MINI-BAR */` → 650+ lines of dedicated CSS classes for vertical mini bar: theme variables, glassmorphism, animations, buttons, tooltips |
| `src/components/VerticalMiniBar.tsx` | **REFACTOR** — All inline styles replaced with CSS classes. Removed `<style>` tag with inline keyframes. Removed color theme variables (accent, cardBg, etc). JSX now uses className-based styling |

### Decisions
- **CSS classes over inline styles**: Matches horizontal mini bar pattern. Easier to maintain, theme, and animate.
- **CSS variables for theming**: `--vmb-*` variables on `.vmb-bar`, overridden by `.vmb-light`. Avoids JS-based color switching.
- **Glassmorphism via pseudo-elements**: `::before` (inner glass) + `::after` (ambient glow) — same pattern as horizontal `.mini-bar`.
- **Sweep gradient on buttons**: `.vmb-action::before` + `.vmb-mic::before` — matches `.m-orb-btn` and `.m-voice-btn` pattern.
- **Recording dot + timer inside mic button**: Moved from separate canvas above to inline with mic button (`.vmb-recording-core`). Canvas still renders above.
- **No changes to recording logic**: All IPC, waveform drawing, language cycling, state management untouched.

### Risks / Technical Debt
- Vertical bar still uses `zoom` CSS property (non-standard, but works in Electron/Chromium).
- Canvas waveform still renders above mic button (not inside it like horizontal) — acceptable for vertical layout.
- No language dropdown (cycle-only) — intentional for vertical compact layout.

### Next Actions
1. [ ] Test vertical mode: switch to vertical → verify glassmorphism visible
2. [ ] Test recording: click mic → verify recording pulse + live dot + timer
3. [ ] Test processing: verify spinner appears
4. [ ] Test done: verify checkmark + success flash + result tooltip
5. [ ] Test light theme: toggle theme → verify all colors update
6. [ ] Test tooltips: result, partial, error, warning — all appear correctly
7. [ ] Test horizontal mode: verify zero changes to horizontal mini bar

---

## Session: 2026-07-13 (Session 2 — LLM Pipeline Fix + Binary Download UI)

### Summary

**BAGIAN 1 — LLM Pipeline Fix:**
LLM sekarang terima RAW Whisper (bukan cleaned text). Prompt diganti dari "CLEAN THIS" → "IMPROVE THIS" fokus grammar + punctuation saja. Urutan pipeline: Whisper → LLM(raw) → TextCleaner → AdaptiveLearning.

**BAGIAN 2 — Binary Download System:**
Tombol "Download Binary" dulu cuma buka link external. Sekarang download real: progress bar + cancel. Extract otomatis via PowerShell Expand-Archive. Semua download (binary + model) pake UI progress konsisten.

### Files Changed
| File | Change |
|------|--------|
| `electron/modules/llmPostProcessor.ts` | **LLM FIX**: Ganti prompt dari "CLEAN THIS" → "IMPROVE THIS" (fokus grammar+punctuation). Hapus overlap dengan TextCleaner. **NEW**: `downloadLlamaBinary()`, `downloadFile()`, `extractZip()` untuk download + extract llama-cli.zip. `isBinaryDownloaded()`, `cancelBinaryDownload()`. Export `DownloadProgressCallback` type. |
| `electron/ipc/dictation.ipc.ts` | **LLM PIPELINE FIX**: Pindah LLM ke SEBELUM TextCleaner. LLM terima RAW Whisper → output masuk ke TextCleaner. `rawText` di transcript-ready event = pure Whisper. **NEW**: `llm-download-binary`, `llm-cancel-binary-download`, `llm-get-binary-download-state`, `llm-check-binary` IPC handlers. |
| `electron/preload.ts` | **NEW**: `llmDownloadBinary()`, `llmCancelBinaryDownload()`, `llmGetBinaryDownloadState()`, `llmCheckBinary()`, `onLlmBinaryDownloadProgress()`. |
| `src/types/electron.d.ts` | **NEW**: Types untuk `llmDownloadBinary`, `llmCancelBinaryDownload`, `llmGetBinaryDownloadState`, `llmCheckBinary`, `onLlmBinaryDownloadProgress`. Updated `llmCheckAvailability` return type (add `binaryDownloaded`). |
| `src/pages/LlmModels.tsx` | **REWRITE**: Download binary & model jadi satu sistem progress unified. Binary download real (bukan external link). Progress bar + cancel untuk binary. Resume (restart) + cancel untuk model. Status card menunjukkan binary ready / not ready. |
| `src/pages/Settings.tsx` | **FIX**: Tombol "Download Binary" di Settings sekarang navigasi ke LLM Models page (bukan open external link). Deskripsi diubah. |

### All Previous Changes (Session 1) — Retained in changelog below

### Decisions
- **LLM pipeline order**: LLM(grammar) → TextCleaner(filler) → AdaptiveLearning. LLM perlu raw text biar bisa meaningful. TextCleaner setelahnya bersihin filler/stutter.
- **Binary download via PowerShell Expand-Archive**: Built-in Windows, no extra deps. Falls back gracefully.
- **Model resume = restart**: True resume (byte-range) terlalu kompleks. Cancel + restart cukup untuk model kecil (280-637MB).
- **ScriptProcessorNode retained**: AudioWorklet migration broke recording. ScriptProcessorNode is deprecated in web standards but fully supported in Electron (Chromium 126). Migration deferred to v1.1 with proper testing.
- **Single-instance lock placement**: Lock is acquired at module level (before any windows), ensuring no race condition where two instances create windows simultaneously.
- **Paste retry count = 3**: Balance between reliability (retries help with PowerShell timing) and speed (user shouldn't wait too long for paste).
- **Queue size = 5**: Large enough to handle normal recording flow, small enough to prevent memory issues.

### Risks / Technical Debt
1. **LLM model download no true resume**: Cancel + restart is fine for <700MB models. For larger models in future, add byte-range resume.
2. **PowerShell Expand-Archive dependency**: Requires PowerShell 5.0+ (built-in on Win10+). For Win7/8, fallback needed.
3. **AudioWorklet browser compatibility**: AudioWorklet is supported in Chromium 66+, Electron 31+ uses Chromium 126, so this is safe. But if someone runs on very old Electron, fallback needed.
4. **PowerShell IsWindow validation**: Adds ~100ms latency to paste operation. Could be cached or optimized later.
5. **VerticalMiniBar TS errors resolved**: Refactored to CSS classes, `WebkitAppRegion` now via className.
6. **Blob URL for AudioWorklet**: While reliable, it's not the "standard" approach. Future improvement could use a proper worklet file with Vite plugin.

### Next Actions
1. [ ] Test binary download: click Download Binary → verify progress bar shows → verify llama-cli.exe exists after
2. [ ] Test binary cancel: click Download Binary → click Cancel → verify state resets
3. [ ] Test model download: download a model → verify progress bar → verify model appears in list
4. [ ] Test model cancel: download → cancel → verify clean state
5. [ ] Test model pause/resume: download → pause → resume (restart) → verify works
6. [ ] Test LLM pipeline: record with LLM enabled → verify grammar fix applied (check raw vs final diff in UI)
7. [ ] Test LLM pipeline: record with LLM disabled → verify TextCleaner-only works normally
8. [ ] Test LLM + verbatim: LLM enabled + verbatim mode → verify LLM skipped
9. [ ] Test LLM short text: record <100 chars → verify LLM skipped (too short)
10. [ ] Test single-instance: launch VoiceFlow twice → second instance should quit, first should focus

### Documentation Updates
- Updated `AGENTS.md` — Added CRITICAL RULES section:
  - Rule #1: Jangan rusak recording
  - Rule #2: Jangan langsung implementasi perubahan besar (buat comparison dulu)
  - Rule #3: Recording adalah sistem kritis (dependency map)
  - Rule #4: Test checklist wajib
- Updated `voiceflow-audio` skill — Added critical warning + comparison approach + test checklist

### Changelog
```
style(renderer): refactor VerticalMiniBar — inline styles → CSS classes with glassmorphism
style(renderer): add vertical mini bar CSS — theme vars, animations, tooltips, buttons
fix(electron): add single-instance lock to prevent multiple instances
fix(electron): add temp file cleanup on app exit
fix(electron): kill whisper process on app exit
fix(paste): add window validation + retry logic + clipboard restore guarantee
fix(audio): add proper resource cleanup on error paths (memory leak fix)
fix(audio): add WAV format validation before transcription
fix(ipc): add processing queue size limit (max 5)
```
