# VoiceFlow - Quick Start Guide 🚀

## Install dalam 4 Langkah

### 1. Install Node.js
Download dari [https://nodejs.org](https://nodejs.org) (versi LTS/18+)

### 2. Clone & Install Dependencies
```bash
git clone https://github.com/YOUR_USERNAME/voiceflow.git
cd voiceflow
npm install
```

### 3. Download Whisper Engine & Model
Double-click file ini di File Explorer:
- **`download-whisper.bat`** — Download whisper-cli.exe + DLLs (~1.3 GB)
- **`download-model.bat`** — Download model AI (~142 MB)

Atau download dari dalam app: **Settings > Models**

### 4. Jalankan!
```bash
npm run dev
```

---

## Setelah App Terbuka

1. **Download model** (kalau belum) — Buka **Settings > Models**, pilih model, klik Download
2. **Mulai recording** — Tekan `Ctrl+Shift+Space` dari aplikasi apapun
3. **Bicara** — Hasil transkripsi otomatis ditempel ke aplikasi yang aktif

---

## Shortcut

| Shortcut | Fungsi |
|----------|--------|
| `Ctrl+Shift+Space` | Start / Stop recording |

---

## Troubleshooting Cepat

| Masalah | Solusi |
|---------|--------|
| Node.js tidak ditemukan | Install dari nodejs.org, restart terminal |
| Whisper tidak ditemukan | Jalankan `download-whisper.bat` |
| Model tidak ditemukan | Jalankan `download-model.bat` atau download dari Settings > Models |
| Mic tidak terdeteksi | Cek Windows Settings → Sound → Input |

---

Lihat [README.md](README.md) untuk dokumentasi lengkap.
