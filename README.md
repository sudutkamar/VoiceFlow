# VoiceFlow v1.0.0.0

**Voice-to-text lokal untuk Windows — 100% gratis, 100% privat, tanpa internet.**

VoiceFlow mengubah suara menjadi teks menggunakan AI (Whisper) yang berjalan sepenuhnya di komputer kamu. Tidak ada data yang dikirim ke server manapun.

---

## Tentang VoiceFlow

VoiceFlow adalah aplikasi desktop voice-to-text yang berjalan 100% lokal di komputer Windows kamu. Menggunakan engine whisper.cpp dengan dukungan GPU (NVIDIA CUDA) untuk transkripsi yang cepat dan akurat.

**Kenapa VoiceFlow?**
- **Privat** — Audio tidak pernah keluar dari komputer kamu. Tidak ada cloud, tidak ada API key.
- **Gratis** — Tidak ada biaya berlangganan atau pembelian.
- **Cepat** — GPU acceleration dengan NVIDIA CUDA untuk transkripsi real-time.
- **Mudah** — Install sekali, langsung pakai. Tidak perlu setup ribet.

---

## Fitur Utama

### Voice-to-Text
- **Global Hotkey** — `Ctrl+Shift+Space` untuk mulai/stop recording dari aplikasi apapun
- **Push-to-Talk** — Tahan hotkey untuk rekam, lepas untuk stop (aktifkan di Settings)
- **Auto-Paste** — Hasil transkripsi otomatis ditempel ke aplikasi yang aktif
- **Multi-Language** — Mendukung 100+ bahasa termasuk Indonesia, Inggris, Jepang, Korea, China
- **VAD (Voice Activity Detection)** — Otomatis stop recording saat diam

### Floating UI
- **Mini Window** — Toolbar melayang compact saat recording
- **Tooltip Deskriptif** — Setiap tombol memiliki tooltip yang menjelaskan fungsinya
- **Language Quick Switch** — Ganti bahasa langsung dari floating bar
- **Waveform Visualizer** — Visualisasi audio real-time saat recording

### Text Processing
- **Smart Cleanup** — Hapus filler words (eh, anu, hmm, dll)
- **Voice Commands** — "new paragraph", "bold", "italic", "heading", dll
- **Punctuation** — "koma" → `,`, "titik" → `.`, "tanda tanya" → `?`
- **Auto Capitalize** — Kapitalisasi otomatis di awal kalimat
- **Number Words** — "satu" → `1`, "dua" → `2`
- **Personal Dictionary** — Kustomisasi penggantian kata
- **Snippets** — Shortcut untuk teks yang sering diketik

### History & Management
- **Searchable History** — Cari transkripsi sebelumnya
- **Export to CSV** — Export history ke file CSV
- **Statistics** — Word count, character count, WPM (words per minute)
- **Confidence Score** — Skor kepercayaan untuk setiap transkripsi

### System Integration
- **System Tray** — Berjalan di background, akses dari tray icon
- **Start on Boot** — Auto-start saat Windows startup (opsional)
- **GPU/CPU Selection** — Pilih GPU (NVIDIA CUDA) atau CPU mode
- **Model Management** — Download dan manage model AI dari dalam aplikasi

---

## Install (Installer)

Download installer terbaru dari [GitHub Releases](https://github.com/sudutkamar/VoiceFlow/releases).

1. Download `VoiceFlow Setup.exe`
2. Jalankan installer
3. Ikuti petunjuk install
4. Buka VoiceFlow dari desktop atau start menu

---

## Install dari Source

### Prerequisites

| Software | Versi | Download |
|----------|-------|----------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) (pilih LTS) |

### Setup

```bash
git clone https://github.com/sudutkamar/VoiceFlow.git
cd VoiceFlow
npm install
```

### Download Whisper Engine & Model

#### A. Whisper CLI + DLLs (~1.3 GB)

Jalankan:
```bash
download-whisper.bat
```

Atau download manual dari [whisper.cpp releases](https://github.com/ggerganov/whisper.cpp/releases) dan extract ke `resources/whisper/`.

#### B. Model AI

Jalankan:
```bash
download-model.bat
```

Atau download dari dalam aplikasi: **Settings > Models**.

### Jalankan

```bash
npm run dev
```

---

## Model AI

| Model | Ukuran | Kecepatan | Akurasi | Cocok Untuk |
|-------|--------|-----------|---------|-------------|
| `ggml-tiny.bin` | 75 MB | ⚡ Sangat cepat | Rendah | Testing, PC lama |
| `ggml-base.bin` | 142 MB | ✅ Cepat | Sedang | Harian (recommended) |
| `ggml-small.bin` | 466 MB | 🐢 Sedang | Tinggi | Bahasa campuran |
| `ggml-medium.bin` | 1.5 GB | 🐌 Lambat | Sangat tinggi | Akurasi maksimal |
| `ggml-large-v3-turbo.bin` | 1.5 GB | ✅ Cepat | ⭐ Tertinggi | Best quality |

---

## Hotkey

| Shortcut | Fungsi |
|----------|--------|
| `Ctrl+Shift+Space` | Start / Stop recording (toggle) |
| `Ctrl+Shift+Space` (hold) | Push-to-talk (aktifkan di Settings) |
| `Esc` | Batalkan recording |

---

## Voice Commands

### Bahasa Indonesia

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

### English

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

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `Node.js not found` | Install Node.js 18+ dari [nodejs.org](https://nodejs.org), restart terminal |
| Microphone tidak terdeteksi | Cek **Windows Settings → Sound → Input** |
| Izin mic ditolak | **Windows Settings → Privacy → Microphone** → Aktifkan izin |
| `whisper-cli.exe tidak ditemukan` | Jalankan `download-whisper.bat` atau download manual |
| Model belum diunduh | Jalankan `download-model.bat` atau download dari **Settings > Models** |
| Transkripsi kosong | Bicara lebih jelas & lebih lama, atau gunakan model yang lebih besar |
| Hotkey tidak berfungsi | Mungkin dipakai app lain, ganti hotkey di Settings |
| Push-to-talk tidak work | Aktifkan Push to Talk di Settings → Hotkey |
| App lambat | Gunakan model `ggml-tiny.bin` atau `ggml-base.bin` |
| GPU tidak terdeteksi | Install [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) |
| GPU cache error | Normal, tidak mempengaruhi fungsi aplikasi |

---

## Privacy & Security

- ✅ **100% Lokal** — Semua proses terjadi di komputer kamu
- ✅ **Tidak ada Cloud** — Tidak ada data yang dikirim ke server manapun
- ✅ **Tidak ada API Key** — Tidak perlu daftar atau berlangganan
- ✅ **Tidak ada Analytics/Telemetry** — Tidak ada tracking
- ✅ **Audio Auto-Delete** — File audio sementara otomatis dihapus setelah transkripsi
- ✅ **Database Lokal** — History disimpan di SQLite di komputer kamu
- ✅ **Open Source** — Kode bisa diperiksa dan dimodifikasi

---

## Build Installer

```bash
npm run dist:win
```

Installer akan muncul di folder `release/`.

---

## Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — Speech-to-text engine
- [OpenAI Whisper](https://github.com/openai/whisper) — Model AI speech recognition
- [Electron](https://www.electronjs.org/) — Desktop app framework
- [React](https://react.dev/) — UI framework
- [Vite](https://vitejs.dev/) — Build tool
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite database
- [uiohook-napi](https://github.com/nicollasricas/uiohook-napi) — Global key detection for push-to-talk

---

## License

MIT

---

<div align="center">

**VoiceFlow** — Voice to Text yang 100% Lokal, 100% Gratis, 100% Privat

Made with ❤️ for Indonesian users

</div>
