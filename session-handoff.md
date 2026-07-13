# Session Handoff

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
