# VoiceFlow v1.0.0

![Floating UI Preview](resources/icons/preview/floating-ui.png)

**Aplikasi Voice-to-Text lokal untuk Windows — 100% gratis, 100% privat, tanpa internet.**

VoiceFlow adalah aplikasi desktop yang mengubah suara kamu menjadi teks secara real-time menggunakan AI (OpenAI Whisper) yang berjalan **sepenuhnya di komputer kamu**. Cocok untuk menulis dokumen, coding, content creation, dan kebutuhan mengetik lainnya tanpa harus menyentuh keyboard.

---

## Daftar Isi

- [Untuk Siapa VoiceFlow?](#untuk-siapa-voiceflow)
- [Fitur Utama](#fitur-utama)
- [Cara Kerja](#cara-kerja)
- [Install](#install)
- [Panduan Penggunaan](#panduan-penggunaan)
- [Model AI](#model-ai)
- [Hotkey](#hotkey)
- [Voice Commands](#voice-commands)
- [Pengaturan](#pengaturan)
- [Troubleshooting](#troubleshooting)
- [Privasi & Keamanan](#privasi--keamanan)
- [Build dari Source](#build-dari-source)
- [Credits](#credits)
- [Lisensi](#lisensi)

---

## Untuk Siapa VoiceFlow?

| Pengguna | Manfaat |
|----------|---------|
| **Programmer / Developer** | Ngetik kode, dokumentasi, commit message, code review pakai suara |
| **Penulis / Content Creator** | Nulis artikel, script video, caption, konten sosial media |
| **Mahasiswa / Akademisi** | Nulis makalah, catatan kuliah, transkrip wawancara |
| **Karyawan Kantoran** | Ngetik laporan, email, meeting notes, proposal |
| **Pengguna dengan RSI / Cedera Tangan** | Alternatif mengetik tanpa keyboard |
| **Siapa pun yang ingin multitasking** | Ngetik sambil ngapa-ngapain |

VoiceFlow dirancang khusus untuk **pengguna Indonesia** dengan dukungan penuh bahasa Indonesia, voice commands dalam Bahasa Indonesia, dan dokumentasi berbahasa Indonesia.

---

## Fitur Utama

### 🎙️ Voice-to-Text Core

| Fitur | Deskripsi |
|-------|-----------|
| **Global Hotkey** | `Ctrl+Shift+Space` untuk mulai/stop recording dari aplikasi apapun |
| **Push-to-Talk** | Tahan hotkey untuk merekam, lepas untuk stop (aktifkan di Settings) |
| **Auto-Paste** | Hasil transkripsi otomatis ditempel ke aplikasi yang sedang aktif |
| **Multi-Language** | Mendukung 100+ bahasa — Indonesia, Inggris, Jepang, Korea, China, dll |
| **VAD (Voice Activity Detection)** | Otomatis berhenti merekam saat kamu diam — gak perlu pencet tombol stop |
| **Real-time Audio Level** | Indikator level suara + clipping detection biar mic gak pecah |

### 🌊 Floating Mini Window

Saat merekam, VoiceFlow menampilkan **floating toolbar** transparan di bagian bawah layar:

```
┌─────────────────────────────────────────────────────┐
│  [ID]  [🔴  ~~~~~~~~~~~~ 0:23]  [✕]  [📋]  [📄]  │
└─────────────────────────────────────────────────────┘
```

| Tombol | Fungsi |
|--------|--------|
| **Bahasa** | Ganti bahasa langsung (ID/EN/JA/KO/ZH/Auto) |
| **Mic** | Mulai / Stop recording (klik) atau status rekaman |
| **Cancel (✕)** | Batalkan rekaman (atau tekan `Esc`) |
| **Spark (🔧)** | Salin hasil / Buka Settings |
| **Note (📄)** | Tempel hasil / Buka History |

Floating window ini:
- Selalu di atas semua aplikasi
- Bisa diklik tanpa mengambil fokus dari aplikasi yang sedang kamu pakai
- Waveform visualizer real-time
- Timer recording
- Tooltip informatif di setiap tombol

### 📝 Text Processing

| Fitur | Contoh |
|-------|--------|
| **Smart Cleanup** | "anu saya eh mau koma ngomong sesuatu" → "saya mau ngomong sesuatu," |
| **Voice Commands** | "paragraf baru", "bold", "italic", "heading" |
| **Punctuation** | "koma" → `,`, "titik" → `.`, "tanda tanya" → `?` |
| **Auto Capitalize** | Kapital otomatis di awal kalimat |
| **Number Words** | "seratus dua puluh tiga" → `123` |
| **Fuzzy Matching** | Koreksi otomatis kata yang mirip, bisa dikustom lewat Dictionary |
| **Personal Dictionary** | Kamus pribadi — ganti "voiceflow" → "VoiceFlow", "react" → "React" |
| **Snippets** | Shortcut — ucapkan "tanda tangan" → output teks panjang |

### 📚 History & Data

| Fitur | Deskripsi |
|-------|-----------|
| **Riwayat Transkripsi** | Semua hasil transkripsi tersimpan dengan timestamp |
| **Search History** | Cari teks dalam riwayat |
| **Export CSV** | Export riwayat ke file CSV |
| **Diff View** | Lihat perbedaan antara output raw Whisper vs hasil cleaning |
| **Confidence Score** | Skor kepercayaan untuk setiap transkripsi |
| **WPM (Words Per Minute)** | Kecepatan bicara kamu |

### 🖥️ System Integration

| Fitur | Deskripsi |
|-------|-----------|
| **System Tray** | Berjalan di background, akses cepat dari tray icon |
| **Auto Start** | Jalankan otomatis saat Windows startup (opsional) |
| **GPU / CPU Selection** | Pilih mode GPU (NVIDIA CUDA) atau CPU |
| **Model Management** | Download, ganti, dan hapus model AI dari dalam aplikasi |
| **Adaptive Learning** | Belajar dari koreksi yang kamu lakukan secara otomatis |

---

## Cara Kerja

```
┌──────────┐     ┌─────────────┐     ┌──────────┐     ┌──────────┐
│  Mic     │────▶│  Audio      │────▶│  Whisper │────▶│  Text    │
│  Input   │     │  Processing │     │  AI      │     │  Output  │
└──────────┘     └─────────────┘     └──────────┘     └──────────┘
                       │                                      │
                       ▼                                      ▼
                ┌──────────────┐                    ┌────────────────┐
                │ Noise Gate   │                    │ Smart Cleanup  │
                │ Compressor   │                    │ Voice Commands │
                │ Normalizer   │                    │ Dictionary     │
                │ HPF + LPF    │                    │ Snippets       │
                └──────────────┘                    └────────────────┘
                                                           │
                                                           ▼
                                                    ┌──────────────┐
                                                    │  Auto-Paste  │
                                                    │  ke Aplikasi │
                                                    └──────────────┘
```

1. **Record** — Suara kamu direkam via microphone (16kHz mono)
2. **Process** — Audio diproses (noise reduction, normalisasi, dll) — opsional
3. **Transcribe** — Whisper AI mengubah audio menjadi teks
4. **Clean** — Teks dibersihkan, dikapitalisasi, voice commands dieksekusi
5. **Paste** — Hasil otomatis ditempel ke aplikasi yang aktif

Semua proses terjadi secara lokal di komputer kamu. **Tidak ada data yang dikirim ke internet.**

---

## Install

### Pakai Installer (Rekomendasi)

Download installer terbaru dari [GitHub Releases](https://github.com/sudutkamar/VoiceFlow/releases).

1. Download `VoiceFlow.Setup.1.0.0.exe`
2. Jalankan installer
3. Ikuti petunjuk instalasi
4. Buka VoiceFlow dari shortcut desktop atau Start Menu

**Setelah install:**
1. Buka tab **Models** di aplikasi
2. Download model AI (recommended: `ggml-base-q5_1.bin` — 57 MB)
3. Jika punya GPU NVIDIA, buka Settings → GPU → Download CUDA
4. Siap digunakan! Tekan `Ctrl+Shift+Space` untuk mulai merekam

### Pakai Whisper Engine Terpisah

Jika installer sudah include whisper engine, kamu bisa langsung pakai. Jika belum:

1. Download `whisper-cpu.zip` atau `whisper-cuda.zip` dari [Releases](https://github.com/sudutkamar/VoiceFlow/releases)
2. Extract ke folder instalasi VoiceFlow → `resources/whisper/`
3. Download model AI dari tab **Models** di aplikasi

### Install dari Source

#### Prerequisites

| Software | Versi | Download |
|----------|-------|----------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) (pilih LTS) |

#### Setup

```bash
git clone https://github.com/sudutkamar/VoiceFlow.git
cd VoiceFlow
npm install
```

#### Download Whisper Engine & Model

```bash
# Download whisper engine (CLI + DLLs)
download-whisper.bat

# Download model AI
download-model.bat
```

Atau download model langsung dari dalam aplikasi: **tab Models**.

#### Jalankan

```bash
npm run dev
```

---

## Panduan Penggunaan

### Pertama Kali Pakai

1. Buka VoiceFlow
2. Download model AI di tab **Models** (recommended: `ggml-base-q5_1.bin`)
3. Cek mic berfungsi di **Settings → Recording → Test Mic**
4. Tekan `Ctrl+Shift+Space` untuk mulai merekam
5. Bicara dengan jelas
6. Tekan `Ctrl+Shift+Space` lagi untuk stop
7. Hasil transkripsi otomatis muncul dan/atau ter-paste ke aplikasi aktif

### Tips Biar Akurat

| Tips | Penjelasan |
|------|------------|
| **Posisi mic** | Jaga jarak mic 10-20 cm dari mulut |
| **Bicara natural** | Gak perlu terlalu lambat atau terlalu keras |
| **Lingkungan** | Usahakan ruangan tidak terlalu bising |
| **Model besar** | Untuk akurasi maksimal, pakai model `ggml-large-v3-turbo` |
| **VAD timeout** | Atur di Settings jika terlalu cepat/slow stop |
| **Dictionary** | Tambahkan kata-kata khusus yang sering kamu pakai |

### Mode Penggunaan

| Mode | Cara | Cocok Untuk |
|------|------|-------------|
| **Toggle** | Tekan hotkey → rekam → tekan lagi → stop | Ngetik paragraf panjang |
| **Push-to-Talk** | Tahan hotkey → rekam → lepas → stop | Ngetik pendek-pendek, coding |
| **VAD Auto-Stop** | Rekam → diam → otomatis stop | Hands-free, transkrip panjang |

---

## Model AI

| Model | Ukuran | Kecepatan | Akurasi | Cocok Untuk |
|-------|--------|-----------|---------|-------------|
| `ggml-tiny.bin` | 75 MB | ⚡ Sangat cepat | Rendah | Testing, PC spek rendah |
| `ggml-base-q5_1.bin` | 57 MB | ⚡ Cepat | Sedang | ⭐ Recommended untuk daily use |
| `ggml-base.bin` | 142 MB | ✅ Cepat | Sedang | Daily use, akurasi lebih baik |
| `ggml-small.bin` | 466 MB | 🐢 Sedang | Tinggi | Bahasa campuran |

### Model Large (butuh RAM 8GB+)

| Model | Ukuran | Kecepatan | Akurasi |
|-------|--------|-----------|---------|
| `ggml-medium.bin` | 1.5 GB | 🐌 Lambat | Sangat tinggi |
| `ggml-large-v3-turbo-q5_0.bin` | 548 MB | ✅ Cepat | ⭐ Tertinggi (recommended) |
| `ggml-large-v3-turbo.bin` | 1.5 GB | ✅ Cepat | ⭐ Tertinggi |
| `ggml-large-v3.bin` | 3.1 GB | 🐌 Lambat | ⭐ Tertinggi |

**Rekomendasi:**
- **PC 4GB RAM** → `ggml-base-q5_1.bin` atau `ggml-tiny.bin`
- **PC 8GB RAM** → `ggml-base.bin` atau `ggml-large-v3-turbo-q5_0.bin`
- **PC 16GB+ RAM** → `ggml-large-v3-turbo.bin`
- **Prioritas kecepatan** → `ggml-base-q5_1.bin`
- **Prioritas akurasi** → `ggml-large-v3-turbo-q5_0.bin`

---

## Hotkey

| Shortcut | Fungsi |
|----------|--------|
| `Ctrl+Shift+Space` | Start / Stop recording (toggle mode) |
| `Ctrl+Shift+Space` (hold) | Push-to-talk (aktifkan di Settings) |
| `Esc` | Batalkan recording |
| `Ctrl+Shift+F9` | Hotkey alternatif (fallback) |

Semua hotkey bisa dikustomisasi di Settings → Hotkey.

---

## Voice Commands

Voice commands adalah perintah yang bisa kamu ucapkan saat merekam untuk memformat teks secara otomatis.

### Bahasa Indonesia

| Ucapkan | Output |
|---------|--------|
| "paragraf baru" | Enter 2x (new paragraph) |
| "baris baru" | Enter (new line) |
| "koma" | `,` |
| "titik" | `.` |
| "tanda tanya" | `?` |
| "tanda seru" | `!` |
| "titik dua" | `:` |
| "titik koma" | `;` |
| "kurung buka" | `(` |
| "kurung tutup" | `)` |
| "petik dua" | `"` |
| "strip" | `-` |

### English

| Say | Output |
|-----|--------|
| "new paragraph" | Enter 2x |
| "new line" | Enter |
| "period" / "full stop" | `.` |
| "comma" | `,` |
| "question mark" | `?` |
| "exclamation mark" | `!` |
| "colon" | `:` |
| "semicolon" | `;` |
| "open paren" | `(` |
| "close paren" | `)` |
| "bold" | **text** |
| "italic" | *text* |
| "heading" | # text |
| "bullet" | - text |
| "quote" | > text |
| "open bracket" | `[` |
| "close bracket" | `]` |
| "open brace" | `{` |
| "close brace" | `}` |

Voice commands bisa dimatikan di Settings → Processing.

---

## Pengaturan

### General
| Setting | Deskripsi | Default |
|---------|-----------|---------|
| Theme | Dark / Light mode | Dark |
| Start on Boot | Auto-start saat Windows startup | Off |
| Sound Effects | Suara feedback start/stop/done | On |

### Recording
| Setting | Deskripsi | Default |
|---------|-----------|---------|
| Microphone | Pilih input device | Default system |
| VAD | Voice Activity Detection | On |
| VAD Silence Timeout | Berapa lama diam sebelum auto-stop | 1500ms |
| Audio Preprocessing | Noise reduction + normalisasi | Off |

### Processing
| Setting | Deskripsi | Default |
|---------|-----------|---------|
| Output Mode | Raw / Natural / Clean | Natural |
| Verbatim Mode | Skip semua processing | Off |
| Voice Commands | Aktifkan perintah suara | On |
| Fuzzy Matching | Koreksi otomatis kata mirip | On |
| Initial Prompt | Hint untuk Whisper (kosongkan untuk auto) | (kosong) |

### Hotkey
| Setting | Deskripsi | Default |
|---------|-----------|---------|
| Recording Hotkey | Shortcut untuk start/stop | Ctrl+Shift+Space |
| Push-to-Talk | Mode tahan untuk rekam | Off |

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| **Mic tidak terdeteksi** | Cek **Windows Settings → Sound → Input**. Pastikan mic terhubung dan aktif |
| **Mic access denied** | Buka **Windows Settings → Privacy & Security → Microphone** → Izinkan VoiceFlow |
| **Tidak ada suara** | Cek mic di Settings → Recording (lihat level input). Jika 0, mic mungkin tidak terpilih |
| **Recording auto-stop terus** | Naikkan VAD Silence Timeout di Settings, atau matikan VAD |
| **Transkripsi kosong** | Bicara lebih jelas, atau gunakan model yang lebih besar |
| **Transkripsi tidak akurat** | Ganti ke model lebih besar (large-v3-turbo), atau tambahkan initial prompt |
| **Hotkey tidak berfungsi** | Mungkin dipakai aplikasi lain. Ganti hotkey di Settings |
| **GPU tidak terdeteksi** | Pastikan NVIDIA GPU + driver terinstall. Download CUDA dari Settings |
| **App lambat** | Gunakan model lebih kecil (tiny/base), atau aktifkan CPU mode |
| **Error "whisper-cli.exe not found"** | Download whisper engine dari Releases, extract ke folder instalasi |
| **NotEnoughMemory** | Model terlalu besar untuk RAM kamu. Gunakan model yang lebih kecil |
| **Floating UI tidak muncul** | Pastikan "Show Mini Window" aktif di Settings |
| **Hasil tidak ter-paste** | Cek "Auto Paste" di Settings, atau paste manual |

---

## Privasi & Keamanan

| Aspek | Detail |
|-------|--------|
| **100% Lokal** | Semua proses terjadi di komputer kamu. Tidak ada data yang dikirim ke server manapun |
| **Tidak ada Cloud** | Tidak ada API key, tidak ada akun, tidak ada cloud service |
| **Tidak ada Tracking** | Tidak ada analytics, telemetry, atau data collection |
| **Audio Auto-Delete** | File audio sementara otomatis dihapus setelah transkripsi |
| **Database Lokal** | Semua history disimpan di SQLite di komputer kamu sendiri |
| **Open Source** | Kode sumber bisa diperiksa, diaudit, dan dimodifikasi oleh siapapun |
| **No Internet Required** | Aplikasi berfungsi penuh tanpa koneksi internet (kecuali download model pertama kali) |

---

## Build dari Source

### Build Installer

```bash
npm run dist:win
```

Installer akan muncul di folder `release/`.

### Build Manual (tanpa installer)

```bash
npm run build:renderer   # Build frontend (Vite/React)
npm run build:electron   # Build backend (TypeScript)
```

---

## Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — Speech-to-text engine by ggerganov
- [OpenAI Whisper](https://github.com/openai/whisper) — AI speech recognition model
- [Electron](https://www.electronjs.org/) — Desktop application framework
- [React](https://react.dev/) — UI framework
- [Vite](https://vitejs.dev/) — Build tool
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite database driver
- [uiohook-napi](https://github.com/nicollasricas/uiohook-napi) — Global keyboard hook (push-to-talk)

---

## Lisensi

MIT License — Silakan digunakan, dimodifikasi, dan didistribusikan.

---

<div align="center">

**VoiceFlow** — Voice to Text yang 100% Lokal, 100% Gratis, 100% Privat

Made with ❤️ for Indonesian users 🇮🇩

[GitHub](https://github.com/sudutkamar/VoiceFlow) · [Releases](https://github.com/sudutkamar/VoiceFlow/releases) · [Report Issue](https://github.com/sudutkamar/VoiceFlow/issues)

</div>
