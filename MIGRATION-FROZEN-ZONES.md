# Migration Frozen Zones — Apa yang TIDAK BOLEH BERUBAH

**Context:** Saat migrasi Electron → Tauri, beberapa bagian SUDAH BAIK dan tidak perlu diubah. Document ini menetapkan "frozen zones" — bagian yang WAJIB dipertahankan identik (atau hampir identik) di v2.0.

---

## 🧊 FROZEN ZONES — JANGAN DIUBAH

### Zone 1: Floating UI (MiniBar) — FULLY FROZEN

> **"Floating UI itu udah bagus. Kalau emang ada yang lebih baik, ya sementara ini masih oke."**

MiniBar adalah fitur UNIK VoiceFlow yang sudah user suka. **Jangan ubah apapun** di sini kecuali ada bug verified.

#### ✅ JANGAN UBAH — MiniBar Layout

```
MiniBar (horizontal):
┌─────────────────────────────────────────────────────┐
│ [Lang] [🔴 Mic] [═══Waveform═══] [✕] [📋] [⚙]    │
└─────────────────────────────────────────────────────┘

VerticalMiniBar:
┌──────┐
│ [Lang]│
│  🔴  │
│ ═══  │
│  ✕   │
│  📋  │
│  ⚙  │
└──────┘
```

| Elemen | File CSS | Status |
|--------|----------|--------|
| MiniBar layout | `minibar-horizontal.css` | 🧊 FROZEN |
| VerticalMiniBar layout | `minibar-vertical.css` | 🧊 FROZEN |
| MiniBar positioning (bottom center) | `minibar-horizontal.css` | 🧊 FROZEN |
| Zoom/scale behavior | `MiniBar.tsx` | 🧊 FROZEN |
| Resize behavior | `MiniBar.tsx` | 🧊 FROZEN |
| Waveform canvas | `MiniBar.tsx` | 🧊 FROZEN |
| Language cycling | `MiniBar.tsx` | 🧊 FROZEN |
| Recording state transitions | `useRecorder.ts` | 🧊 FROZEN |

#### ✅ JANGAN UBAH — Visual Design

| Elemen | Status | Alasan |
|--------|--------|--------|
| Glassmorphism effect | 🧊 FROZEN | Sudah polished, user suka |
| Dark/Light theme | 🧊 FROZEN | Sudah working |
| Color scheme (accent #4a9eff) | 🧊 FROZEN | Brand identity |
| Border radius | 🧊 FROZEN | Consistent design |
| Shadow/glow effects | 🧊 FROZEN | Aesthetic |
| Font (system default) | 🧊 FROZEN | Native feel |

#### ✅ JANGAN UBAH — UX Behavior

| Behavior | Status | Alasan |
|----------|--------|--------|
| Always-on-top (screen-saver level) | 🧊 FROZEN | Core feature |
| Skip taskbar | 🧊 FROZEN | Floating bar behavior |
| Position persistence | 🧊 FROZEN | User expects same position |
| Size persistence | 🧊 FROZEN | User expects same size |
| Blur → stay visible | 🧊 FROZEN | Don't hide when clicking outside |
| Drag to move | 🧊 FROZEN | Standard behavior |
| Result tooltip (4s delay) | 🧊 FROZEN | Working well |
| Error tooltip | 🧊 FROZEN | Working well |

---

### Zone 2: CSS Design System — FROZEN

> **CSS variables dan glassmorphism design SUDAH BAGUS. Pertahankan.**

#### ✅ JANGAN UBAH — CSS Variables

```css
/* variables.css — JANGAN UBAH nilai ini */
:root {
  --bg: #0a0a12;
  --bg-card: rgba(18, 18, 30, 0.7);
  --accent: #4a9eff;
  --accent-hover: #6bb3ff;
  --accent-glow: rgba(74, 158, 255, 0.3);
  --text: #f1f5f9;
  --radius: 12px;
  /* ... semua variables ... */
}
```

| File | Status | Alasan |
|------|--------|--------|
| `variables.css` | 🧊 FROZEN | Design system foundation |
| `base.css` | 🧊 FROZEN | Reset & base styles |
| `components.css` | 🧊 FROZEN | Shared component styles |
| `interactions.css` | 🧊 FROZEN | Animations & transitions |
| `utilities.css` | 🧊 FROZEN | Utility classes |
| `minibar-horizontal.css` | 🧊 FROZEN | MiniBar styles |
| `minibar-vertical.css` | 🧊 FROZEN | VerticalMiniBar styles |
| `pages.css` | 🧊 FROZEN | Page layouts |
| `app.css` | 🧊 FROZEN | Entry point (just imports) |

---

### Zone 3: Audio Recording Pipeline — MOSTLY FROZEN

> **Recording pipeline SUDAH WORKING. Jangan rusak.**

```
Mic → getUserMedia → ScriptProcessorNode → WAV Buffer → IPC → Whisper
```

| Komponen | File | Status | Catatan |
|----------|------|--------|---------|
| WAV Recording | `wavRecorder.ts` | 🧊 FROZEN | ScriptProcessorNode working fine |
| AudioWorklet Processor | `audioWorkletProcessor.js` | 🧊 FROZEN | Audio capture |
| Audio Utilities | `audio.ts` | 🧊 FROZEN | Sound effects |
| Sound Effects | `soundEffects.ts` | 🧊 FROZEN | UI feedback |
| Mic Detection | `micDetector.ts` | 🧊 FROZEN | Auto-select mic |

#### ⚠️ BOLEH UBAH — VAD System

| Komponen | File | Status | Catatan |
|----------|------|--------|---------|
| useVad() inline | `useRecorder.ts` | ✅ UBAH | **P0: Fix hangover + threshold** |
| AdaptiveVAD class | `adaptiveVAD.ts` | ✅ UBAH | **Integrate atau delete** |

**VAD adalah SATU-SATUNYA bagian audio yang PERLU diubah.** Sisanya frozen.

---

### Zone 4: Main Window Structure — FROZEN

> **Layout dan navigasi SUDAH BAGUS. Pertahankan.**

```
Main Window:
┌─────────────────────────────────────────────────┐
│ TitleBar (custom, drag-able)                    │
├────┬────────────────────────────────────────────┤
│    │                                            │
│ S  │           Content Area                     │
│ I  │                                            │
│ D  │  HomePage | Models | History | Benchmark   │
│ E  │           | Settings                      │
│ B  │                                            │
│ A  │                                            │
│ R  │                                            │
├────┴────────────────────────────────────────────┤
│ Status Bar (optional)                           │
└─────────────────────────────────────────────────┘
```

| Elemen | File | Status | Alasan |
|--------|------|--------|--------|
| Sidebar navigation | `MainApp.tsx` | 🧊 FROZEN | Clean, intuitive |
| Content area routing | `AppContent.tsx` | 🧊 FROZEN | Working well |
| TitleBar (custom) | `MainApp.tsx` | 🧊 FROZEN | Branded look |
| Page structure | All pages | 🧊 FROZEN | Consistent layout |
| Sidebar icons | `icons.tsx` | 🧊 FROZEN | Consistent iconography |

---

### Zone 5: Feature Set — FROZEN

> **Semua fitur yang sudah ada WAJIB ada di v2.0. Tidak boleh ada fitur yang hilang.**

#### Core Features (Must Have)

| Fitur | Status | Notes |
|-------|--------|-------|
| Voice recording | 🧊 FROZEN | Core feature |
| Whisper transcription | 🧊 FROZEN | Core feature |
| Auto-paste to active window | 🧊 FROZEN | Core feature |
| Floating mini bar | 🧊 FROZEN | Core feature |
| Global hotkey | 🧊 FROZEN | Core feature |
| Multi-language (ID/EN/JA/KO/ZH) | 🧊 FROZEN | Must support all 5 |
| Dark/Light theme | 🧊 FROZEN | User preference |

#### Advanced Features (Must Have)

| Fitur | Status | Notes |
|-------|--------|-------|
| Model management (download/delete) | 🧊 FROZEN | Critical for UX |
| CUDA/GPU acceleration | 🧊 FROZEN | Performance |
| History with search | 🧊 FROZEN | User data |
| Dictionary/fuzzy matching | 🧊 FROZEN | Accuracy |
| Adaptive learning | 🧊 FROZEN | Personalization |
| LLM post-processing | 🧊 FROZEN | Grammar fix |
| Text snippets | 🧊 FROZEN | Productivity |
| Benchmark | 🧊 FROZEN | Model comparison |
| Auto-update | 🧊 FROZEN | Keep current |
| Clipboard copy/paste | 🧊 FROZEN | Core interaction |

---

## 🔧 YANG BOLEH/PERLU DIUBAH

### 1. Backend (FULL REWRITE)

```
electron/ → src-tauri/src/
├── Node.js → Rust (full rewrite)
├── better-sqlite3 → rusqlite
├── child_process → std::process
├── IPC handlers → Tauri commands
└── All modules → Rust equivalents
```

### 2. IPC Layer (FULL REWRITE)

```
preload.ts (500 lines) → (DELETED)
electronAPI → invoke() from @tauri-apps/api
ipcRenderer.invoke() → invoke('command_name')
ipcRenderer.on() → tauri.event.listen()
```

### 3. Frontend IPC Calls (ADAPT)

```typescript
// BEFORE (Electron):
const settings = await window.electronAPI.getSettings();
window.electronAPI.onTranscriptReady((d) => { ... });

// AFTER (Tauri):
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
const settings = await invoke('get_settings');
listen('transcript-ready', (event) => { ... });
```

**Files yang perlu diadapt (hanya IPC calls):**
- `useRecorder.ts`
- `MiniBar.tsx`
- `VerticalMiniBar.tsx`
- `Models.tsx`
- `History.tsx`
- `Settings/*.tsx`
- `Benchmark.tsx`
- `LlmModels.tsx`

### 4. State Management (ADD)

```
Tambah Zustand untuk:
├── Settings cache (reduce IPC calls)
├── Recording state
└── UI state
```

### 5. VAD System (FIX)

```
useVad() → Proper implementation:
├── Add hangover mechanism (500ms)
├── Raise threshold to 0.020
├── Add RMS smoothing (EMA)
└── Or integrate AdaptiveVAD class
```

### 6. Routing (OPTIONAL UPGRADE)

```
Hash routing → React Router v6 (optional)
├── Better code splitting
├── Lazy loading pages
└── URL-based navigation
```

---

## Summary: What to Keep vs Change

```
KEEP (Frozen):
├── 🧊 MiniBar layout & behavior
├── 🧊 VerticalMiniBar layout & behavior
├── 🧊 Glassmorphism design system
├── 🧊 CSS variables & themes
├── 🧊 Main window structure
├── 🧊 Sidebar navigation
├── 🧊 Audio recording pipeline (except VAD)
├── 🧊 All existing features
├── 🧊 Color scheme & typography
├── 🧊 UX patterns & interactions
└── 🧊 Waveform visualization

CHANGE (Adapt/Rewrite):
├── 🔧 Backend (Node.js → Rust)
├── 🔧 IPC layer (Electron → Tauri)
├── 🔧 Frontend IPC calls (adapt)
├── 🔧 State management (add Zustand)
├── 🔧 VAD system (fix bugs)
└── 🔧 Config files (Tauri config)
```

### Golden Rule

> **"Kalau sudah working dan user suka, JANGAN UBAH. Fokus ke backend migration, bukan UI redesign."**

---

*Generated by audit session 2026-07-19*
