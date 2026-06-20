# VoiceFlow - Voice to Text for Windows

VoiceFlow adalah aplikasi voice-to-text lokal untuk Windows yang **100% gratis** dan **100% lokal** tanpa memerlukan API atau koneksi internet.

## ✨ Fitur Lengkap (Seperti Wispr Flow)

### 🎤 Core Features
- **Global Hotkey** - Ctrl+Shift+Space untuk mulai/stop recording
- **Voice Recording** - Record audio dari microphone
- **Audio Conversion** - Konversi ke WAV 16kHz (menggunakan ffmpeg)
- **Local Transcription** - Menggunakan whisper.cpp secara lokal
- **Auto-Paste** - Teks otomatis ditempel ke aplikasi aktif
- **System Tray** - App berjalan di background

### ✨ Text Processing
- **Smart Cleanup** - Hapus filler words (eh, anu, hmm, dll)
- **Voice Commands** - "new paragraph", "bold", "italic", dll
- **Punctuation Commands** - "koma" → ",", "titik" → "."
- **Auto Capitalize** - Kapitalisasi otomatis
- **Personal Dictionary** - Kustomisasi penggantian kata
- **Snippets** - Shortcut untuk teks yang sering diketik
- **Number Words** - "satu" → "1", "dua" → "2"

### 📚 History & Management
- **Searchable History** - Cari transkripsi sebelumnya
- **Export History** - Export ke CSV
- **Statistics** - Word count, character count, WPM

### 🖥️ System Integration
- **Start on Boot** - Auto-start saat Windows startup
- **Minimize to Tray** - Sembunyikan ke system tray
- **Compact Mini Window** - Popup kecil saat recording
- **WPM Display** - Words per minute indicator

### 📦 Model Management
- **Model Downloader** - Download model langsung dari app
- **Multiple Models** - Tiny, Base, Small, Medium
- **Model Selection** - Pilih model sesuai kebutuhan

## 🚀 Quick Start

### Prerequisites
- Windows 10/11
- Node.js 18+ (download dari https://nodejs.org)
- Microphone

### Installation

```bash
cd voiceflow
npm install
npm run dev
```

### Download Whisper Model

Buka **Settings > Models** di aplikasi untuk mengunduh model.

## ⌨️ Hotkey & Voice Commands

### Hotkey
| Hotkey | Fungsi |
|--------|--------|
| `Ctrl+Shift+Space` | Start/Stop recording |

### Voice Commands
| Command | Output |
|---------|--------|
| "new paragraph" | Enter 2x |
| "new line" | Enter |
| "period" | . |
| "comma" | , |
| "question mark" | ? |
| "exclamation mark" | ! |
| "bold" | **text** |
| "italic" | *text* |
| "heading" | # text |
| "bullet" | - text |
| "quote" | > text |

### Punctuation (Indonesian)
| Voice | Output |
|-------|--------|
| "koma" | , |
| "titik" | . |
| "tanda tanya" | ? |
| "tanda seru" | ! |
| "baris baru" | newline |
| "paragraf baru" | 2x newline |

## 📁 Project Structure

```
voiceflow/
├── electron/                    # Backend (Electron)
│   ├── main.ts                 # Entry point
│   ├── preload.ts              # IPC bridge
│   ├── modules/
│   │   ├── audioConverter.ts   # Audio → WAV
│   │   ├── database.ts         # SQLite
│   │   ├── hotkeyManager.ts    # Global hotkey
│   │   ├── logger.ts           # Logging
│   │   ├── modelDownloader.ts  # Model download
│   │   ├── pasteEngine.ts      # Auto-paste
│   │   ├── recorder.ts         # Audio recording
│   │   ├── textCleaner.ts      # Text processing
│   │   └── transcriber.ts      # Whisper STT
│   └── ipc/
│       ├── dictation.ipc.ts    # Recording & transcription
│       ├── model.ipc.ts        # Model management
│       ├── settings.ipc.ts     # Settings & dictionary
│       └── snippet.ipc.ts      # Snippets
├── src/                         # Frontend (React)
│   ├── App.tsx
│   ├── components/
│   │   └── MiniWindow.tsx      # Compact popup
│   └── pages/
│       ├── Home.tsx            # Main page
│       ├── History.tsx         # History with search
│       ├── Models.tsx          # Model downloader
│       └── Settings.tsx        # Settings, dictionary, snippets
└── resources/
    └── whisper/
        └── models/             # Whisper models
```

## 🎯 Fitur vs Wispr Flow

| Fitur | Wispr Flow | VoiceFlow |
|-------|------------|-----------|
| Voice-to-text lokal | ✅ | ✅ |
| Global hotkey | ✅ | ✅ |
| Auto-paste | ✅ | ✅ |
| Whisper-based | ✅ | ✅ |
| System tray | ✅ | ✅ |
| Start on boot | ✅ | ✅ |
| Voice commands | ✅ | ✅ |
| Text cleanup | ✅ | ✅ |
| History | ✅ | ✅ |
| Search history | ✅ | ✅ |
| Export history | ✅ | ✅ |
| Personal dictionary | ✅ | ✅ |
| Snippets | ✅ | ✅ |
| Model downloader | ✅ | ✅ |
| Multiple models | ✅ | ✅ |
| WPM display | ✅ | ✅ |
| Word count | ✅ | ✅ |
| Mini window | ✅ | ✅ |
| Auto capitalize | ✅ | ✅ |
| **Harga** | **$12/bulan** | **GRATIS** |
| **Cloud/API** | **Ya** | **Tidak** |
| **Privacy** | **Mixed** | **100% Lokal** |

## 🔧 Development Commands

```bash
# Development mode
npm run dev

# Build frontend
npm run build:renderer

# Build backend
npm run build:electron

# Build all
npm run build

# Create Windows installer
npm run dist:win
```

## 🔒 Privacy

VoiceFlow dirancang dengan privacy sebagai prioritas utama:

- ✅ **100% Lokal** - Semua proses terjadi di komputer Anda
- ✅ **Tidak ada Cloud** - Tidak ada data yang dikirim ke server manapun
- ✅ **Tidak ada API** - Tidak memerlukan API key atau subscription
- ✅ **Tidak ada Analytics** - Tidak ada tracking atau telemetry
- ✅ **Audio Auto-Delete** - File audio sementara otomatis dihapus
- ✅ **Database Lokal** - SQLite disimpan di komputer Anda
- ✅ **Open Source** - Kode bisa diperiksa

## 🛠️ Troubleshooting

### Microphone Issues
- Pastikan microphone terhubung
- Cek Windows Settings → Sound
- Berikan izin microphone

### Whisper Issues
- Download model dari Settings > Models
- Pastikan whisper-cli.exe ada di resources/whisper/

### Hotkey Issues
- Pastikan hotkey tidak dipakai aplikasi lain
- Ganti hotkey di Settings

## 📦 Build untuk Distribusi

```bash
npm run dist:win
```

Installer akan dibuat di folder `release/`.

## 🙏 Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - Speech-to-text engine
- [Electron](https://www.electronjs.org/) - Desktop framework
- [React](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite database

## 📄 License

MIT

---

**VoiceFlow** - Voice to Text yang 100% Lokal, 100% Gratis, 100% Private
