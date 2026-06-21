# VoiceFlow v1.0.0

**Voice-to-text lokal untuk Windows — 100% gratis, 100% privat, tanpa internet.**

VoiceFlow mengubah suara menjadi teks menggunakan AI (Whisper) yang berjalan sepenuhnya di komputer kamu. Tidak ada data yang dikirim ke server manapun.

---

## ⚡ Install Cepat (3 Langkah)

### Langkah 1: Install Prerequisites

| Software | Versi | Download |
|----------|-------|----------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) (pilih LTS) |

> 💡 Setelah install Node.js, restart terminal/command prompt.

### Langkah 2: Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/voiceflow.git
cd voiceflow
npm install
```

Atau kalau sudah download ZIP dari GitHub:
```bash
cd voiceflow
npm install
```

### Langkah 3: Download Whisper Engine & Model

#### A. Download Whisper CLI + DLLs (~1.3 GB)

Download dari **GitHub Releases**:
1. Buka: https://github.com/ggerganov/whisper.cpp/releases
2. Cari file `whisper-*.zip` atau `whisper-bin-*.zip`
3. Extract ke folder `resources/whisper/`

Atau jalankan `download-whisper.bat` untuk petunjuk lebih detail.

#### B. Download Model AI

Jalankan script yang sudah disediakan:
```bash
download-model.bat
```

**Atau** download dari dalam aplikasi: buka menu **Settings > Models** setelah app berjalan.

### Jalankan Aplikasi

```bash
npm run dev
```

Selesai! Aplikasi akan terbuka dan siap dipakai. 🎉

---

## 📦 Apa yang Perlu Di-Download?

Setelah clone/download dari GitHub, ada komponen tambahan yang **wajib** di-download karena terlalu besar untuk disimpan di Git:

| Komponen | Ukuran | Lokasi | Cara Download |
|----------|--------|--------|---------------|
| **whisper-cli.exe** | ~500 KB | `resources/whisper/` | `download-whisper.bat` |
| **whisper DLLs** | ~1.3 GB | `resources/whisper/` | `download-whisper.bat` |
| **Model AI** | 75 MB - 3 GB | `resources/whisper/models/` | `download-model.bat` atau dari app |

> ⚠️ Tanpa komponen ini, aplikasi tidak bisa melakukan transkripsi. Tapi ada **mock mode** untuk testing UI tanpa whisper.

### Rekomendasi Model

| Model | Ukuran | Kecepatan | Akurasi | Cocok Untuk |
|-------|--------|-----------|---------|-------------|
| `ggml-tiny.bin` | 75 MB | ⚡ Sangat cepat | Rendah | Testing, PC lama |
| `ggml-base.bin` | 142 MB | ✅ Cepat | Sedang | **Harian (recommended)** |
| `ggml-small.bin` | 466 MB | 🐢 Sedang | Tinggi | Bahasa campuran |
| `ggml-medium.bin` | 1.5 GB | 🐌 Lambat | Sangat tinggi | Akurasi maksimal |
| `ggml-large-v3-turbo.bin` | 1.5 GB | ✅ Cepat | ⭐ Tertinggi | **Best quality (recommended)** |

> 💡 Untuk pemakaian sehari-hari, gunakan `ggml-base.bin`. Kalau mau akurasi tinggi, gunakan `ggml-large-v3-turbo.bin`.

---

## 🎯 Fitur

### 🎤 Voice-to-Text
- **Global Hotkey** — `Ctrl+Shift+Space` untuk mulai/stop recording dari aplikasi apapun
- **Auto-Paste** — Hasil transkripsi otomatis ditempel ke aplikasi yang aktif
- **Multi-Language** — Mendukung Bahasa Indonesia, Inggris, dan bahasa lainnya

### ✨ Text Processing
- **Smart Cleanup** — Hapus filler words (eh, anu, hmm, dll)
- **Voice Commands** — "new paragraph", "bold", "italic", "heading", dll
- **Punctuation** — "koma" → `,`, "titik" → `.`, "tanda tanya" → `?`
- **Auto Capitalize** — Kapitalisasi otomatis di awal kalimat
- **Number Words** — "satu" → `1`, "dua" → `2`
- **Personal Dictionary** — Kustomisasi penggantian kata
- **Snippets** — Shortcut untuk teks yang sering diketik

### 📚 History & Management
- **Searchable History** — Cari transkripsi sebelumnya
- **Export to CSV** — Export history ke file CSV
- **Statistics** — Word count, character count, WPM (words per minute)

### 🖥️ System Integration
- **System Tray** — Berjalan di background, akses dari tray icon
- **Start on Boot** — Auto-start saat Windows startup (opsional)
- **Mini Window** — Popup kecil saat recording
- **GPU Support** — Otomatis deteksi NVIDIA GPU untuk transkripsi lebih cepat

---

## ⌨️ Hotkey & Commands

### Hotkey
| Shortcut | Fungsi |
|----------|--------|
| `Ctrl+Shift+Space` | Start / Stop recording |

### Voice Commands (Bahasa Indonesia)
| Ucapkan | Output |
|---------|--------|
| "paragraf baru" | Enter 2x |
| "baris baru" | Enter |
| "koma" | `,` |
| "titik" | `.` |
| "tanda tanya" | `?` |
| "tanda seru" | `!` |
| "titik dua" | `:` |
| "titik koma" | `;` |

### Voice Commands (English)
| Say | Output |
|-----|--------|
| "new paragraph" | Enter 2x |
| "new line" | Enter |
| "period" / "full stop" | `.` |
| "comma" | `,` |
| "question mark" | `?` |
| "exclamation mark" | `!` |
| "bold" | **text** |
| "italic" | *text* |
| "heading" | # text |
| "bullet" | - text |
| "quote" | > text |

---

## 🔧 Development

### Commands

```bash
# Jalankan dalam development mode
npm run dev

# Build frontend (React/Vite)
npm run build:renderer

# Build backend (Electron/TypeScript)
npm run build:electron

# Build semua
npm run build

# Buat installer Windows (.exe)
npm run dist:win
```

### Struktur Project

```
voiceflow/
├── electron/                    # Backend (Electron + TypeScript)
│   ├── main.ts                 # Entry point
│   ├── preload.ts              # IPC bridge (frontend ↔ backend)
│   └── modules/
│       ├── recorder.ts         # Audio recording dari mic
│       ├── audioConverter.ts   # Konversi audio ke WAV 16kHz
│       ├── audioPreprocessor.ts # Noise reduction & normalisasi
│       ├── transcriber.ts      # Whisper transcription engine
│       ├── textCleaner.ts      # Text processing & voice commands
│       ├── pasteEngine.ts      # Auto-paste ke aplikasi aktif
│       ├── hotkeyManager.ts    # Global hotkey registration
│       ├── modelDownloader.ts  # Download model dari HuggingFace
│       ├── database.ts         # SQLite database (history)
│       ├── fuzzyMatcher.ts     # Fuzzy matching untuk dictionary
│       ├── confidenceScorer.ts # Confidence score hasil transkripsi
│       └── logger.ts           # Logging system
│
├── src/                         # Frontend (React + TypeScript)
│   ├── App.tsx                 # Main app component
│   ├── components/
│   │   └── MiniWindow.tsx      # Compact popup saat recording
│   └── pages/
│       ├── Home.tsx            # Halaman utama
│       ├── History.tsx         # History transkripsi
│       ├── Models.tsx          # Download & manage models
│       └── Settings.tsx        # Settings, dictionary, snippets
│
├── resources/
│   └── whisper/                # Whisper engine & models
│       ├── whisper-cli.exe     # ← Download via download-whisper.bat
│       ├── *.dll               # ← Download via download-whisper.bat
│       └── models/
│           └── ggml-*.bin      # ← Download via download-model.bat
│
├── data/                       # SQLite database (auto-created)
├── logs/                       # Log files (auto-created)
│
├── setup.bat                   # Setup script (install dependencies)
├── download-whisper.bat        # Download whisper-cli.exe + DLLs
├── download-model.bat          # Download default model
├── start-dev.bat               # Start development mode
└── build.bat                   # Build untuk distribusi
```

---

## 🛠️ Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `Node.js not found` | Install Node.js 18+ dari [nodejs.org](https://nodejs.org), restart terminal |
| `npm install` gagal | Coba `npm cache clean --force` lalu `npm install` lagi |
| Microphone tidak terdeteksi | Cek **Windows Settings → Sound → Input** |
| Izin mic ditolak | **Windows Settings → Privacy → Microphone** → Aktifkan izin |
| `whisper-cli.exe tidak ditemukan` | Jalankan `download-whisper.bat` atau download manual |
| `Model belum diunduh` | Jalankan `download-model.bat` atau download dari **Settings > Models** di app |
| Transkripsi kosong | Bicara lebih jelas & lebih lama, atau gunakan model yang lebih besar |
| Hotkey tidak berfungsi | Mungkin dipakai app lain, ganti hotkey di Settings |
| App lambat | Gunakan model `ggml-tiny.bin` atau `ggml-base.bin` |
| GPU tidak terdeteksi | Install [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) untuk NVIDIA GPU |

---

## 🔒 Privacy & Security

VoiceFlow didesain dengan privacy sebagai prioritas utama:

- ✅ **100% Lokal** — Semua proses terjadi di komputer kamu
- ✅ **Tidak ada Cloud** — Tidak ada data yang dikirim ke server manapun
- ✅ **Tidak ada API Key** — Tidak perlu daftar atau berlangganan
- ✅ **Tidak ada Analytics/Telemetry** — Tidak ada tracking
- ✅ **Audio Auto-Delete** — File audio sementara otomatis dihapus setelah transkripsi
- ✅ **Database Lokal** — History disimpan di SQLite di komputer kamu
- ✅ **Open Source** — Kode bisa diperiksa dan dimodifikasi

---

## 📦 Build Installer

Untuk membuat installer Windows (.exe) yang bisa dibagikan:

```bash
npm run dist:win
```

Installer akan muncul di folder `release/`. File ini bisa di-share ke orang lain untuk install tanpa perlu Node.js atau npm.

---

## 🙏 Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — Speech-to-text engine oleh Georgi Gerganov
- [OpenAI Whisper](https://github.com/openai/whisper) — Model AI speech recognition
- [Electron](https://www.electronjs.org/) — Desktop app framework
- [React](https://react.dev/) — UI framework
- [Vite](https://vitejs.dev/) — Build tool
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite database

---

## 📄 License

MIT

---

<div align="center">

**VoiceFlow** — Voice to Text yang 100% Lokal, 100% Gratis, 100% Privat

Made with ❤️ for Indonesian users

</div>
