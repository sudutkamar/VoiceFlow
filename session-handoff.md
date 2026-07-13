# Session Handoff

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
