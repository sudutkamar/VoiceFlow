# VoiceFlow - Setup Complete! 🎉

## ✅ Status: READY TO USE

Project VoiceFlow telah berhasil dibuat dan siap digunakan.

## 🚀 Cara Menjalankan

### Development Mode (untuk testing):
```bash
cd voiceflow
npm run dev
```

### Build untuk Windows:
```bash
cd voiceflow
npm run dist:win
```

## 📁 Struktur Project

```
voiceflow/
├── electron/                  # Backend Electron
│   ├── main.ts               # Entry point
│   ├── preload.ts            # IPC bridge
│   ├── modules/              # Core modules
│   │   ├── audioConverter.ts # Konversi audio ke WAV
│   │   ├── database.ts       # SQLite database
│   │   ├── hotkeyManager.ts  # Global hotkey
│   │   ├── logger.ts         # Logging
│   │   ├── pasteEngine.ts    # Auto-paste
│   │   ├── recorder.ts       # Audio recording
│   │   ├── textCleaner.ts    # Text cleanup
│   │   └── transcriber.ts    # Whisper transcription
│   └── ipc/                  # IPC handlers
├── src/                       # Frontend React
│   ├── App.tsx               # Main app
│   ├── components/           # UI components
│   └── pages/                # Pages
├── resources/
│   └── whisper/              # Whisper CLI & models
└── dist/ & dist-electron/    # Build output
```

## 🎯 Fitur Utama

1. **Global Hotkey** - Ctrl+Shift+Space
2. **Voice Recording** - MediaRecorder API
3. **Audio Conversion** - ffmpeg-static (webm → WAV 16kHz)
4. **Transcription** - whisper.cpp (lokal)
5. **Text Cleanup** - Rule-based cleanup
6. **Auto-Paste** - Clipboard + Ctrl+V
7. **History** - SQLite database
8. **Settings** - Personal dictionary, model selection

## 🔧 Whisper Setup (Opsional)

VoiceFlow memiliki **mock mode** untuk testing tanpa whisper.

Untuk menggunakan whisper sungguhan:

1. Download `whisper-cli.exe` dari:
   https://github.com/ggerganov/whisper.cpp/releases

2. Download `ggml-base.bin` dari:
   https://huggingface.co/ggerganov/whisper.cpp/tree/main

3. Simpan di:
   ```
   resources/whisper/whisper-cli.exe
   resources/whisper/models/ggml-base.bin
   ```

## 🎨 UI Preview

```
┌─────────────────────────────────┐
│  🎙️ VoiceFlow                   │
├─────────────────────────────────┤
│                                 │
│         ┌─────────┐             │
│         │   🎤    │             │
│         └─────────┘             │
│                                 │
│      00:05                      │
│                                 │
│   Merekam...                    │
│                                 │
│   [Ctrl] [Shift] [Space]       │
│                                 │
│  ┌─────────────────────────┐    │
│  │ Hasil Transkripsi       │    │
│  │                         │    │
│  │ Ini adalah hasil...     │    │
│  └─────────────────────────┘    │
│                                 │
├─────────────────────────────────┤
│  Home | History | Settings      │
└─────────────────────────────────┘
```

## 📝 Commands

```bash
# Development
npm run dev

# Build frontend only
npm run build:renderer

# Build electron only
npm run build:electron

# Build all
npm run build

# Create Windows installer
npm run dist:win
```

## 🔒 Privacy

- ✅ 100% lokal
- ✅ Tidak ada cloud
- ✅ Tidak ada API
- ✅ Tidak ada analytics
- ✅ Database lokal SQLite

## 📞 Troubleshooting

| Error | Solution |
|-------|----------|
| Microphone not found | Check Windows Sound Settings |
| Permission denied | Windows Settings → Privacy → Microphone |
| Whisper not found | Download whisper-cli.exe atau gunakan mock mode |
| Model not found | Download ggml-base.bin atau gunakan mock mode |
| Hotkey conflict | Ganti hotkey di Settings |

## 🎯 Next Steps

1. Jalankan `npm run dev` untuk testing
2. (Opsional) Download whisper-cli.exe untuk transkripsi sungguhan
3. (Opsional) Download ggml-base.bin model
4. Customize settings sesuai kebutuhan
5. Build installer dengan `npm run dist:win`

---

**VoiceFlow v0.1.0** - Local Voice-to-Text for Windows
