@echo off
echo ========================================
echo VoiceFlow - Create GitHub Release
echo ========================================
echo.
echo This script will create a GitHub Release v1.0.0
echo with all required binary files (Whisper engine + AI models).
echo.

:: Check if gh is installed
where gh >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: GitHub CLI not found!
    echo.
    echo Install with: winget install GitHub.cli
    echo.
    pause
    exit /b 1
)

:: Check if logged in
gh auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo Please login to GitHub first:
    echo.
    gh auth login
    echo.
)

echo Creating release v1.0.0...
echo.

gh release create v1.0.0 ^
  --title "VoiceFlow v1.0.0" ^
  --notes "## VoiceFlow v1.0.0 - Voice to Text for Windows

Voice-to-text lokal untuk Windows. 100%% gratis, 100%% privat, tanpa internet.

### Install

1. Download source code: Code > Download ZIP
2. Extract dan jalankan `setup.bat`
3. Download **whisper-cpu.zip** di bawah, extract ke `resources/whisper/`
4. Download **whisper-model-base.zip** di bawah, extract ke `resources/whisper/models/`
5. Jalankan: `npm run dev`

### Downloads

| File | Size | Keterangan |
|------|------|------------|
| **whisper-cpu.zip** | 3.3 MB | Whisper engine (CPU) - **wajib** |
| whisper-cuda.zip | 620 MB | Whisper engine + NVIDIA GPU |
| **whisper-model-base.zip** | 128 MB | Model AI - **recommended** |
| whisper-model-tiny.zip | 55 MB | Model AI - cepat, PC lama |
| whisper-model-large-turbo.zip | 509 MB | Model AI - akurasi tinggi |

### System Requirements

- Windows 10/11
- Node.js 18+ ([download](https://nodejs.org))
- Microphone
- (Optional) NVIDIA GPU + CUDA

### Hotkey

`Ctrl+Shift+Space` - Start/Stop recording

### Features

- Voice-to-text lokal (Whisper AI)
- Auto-paste ke aplikasi aktif
- Voice commands (Indonesia & English)
- History & search
- Personal dictionary & snippets
- 100%% lokal, no cloud/API

[Full Documentation](https://github.com/sudutkamar/VoiceFlow/blob/master/README.md)" ^
  release-assets/whisper-cpu.zip ^
  release-assets/whisper-cuda.zip ^
  release-assets/whisper-model-tiny.zip ^
  release-assets/whisper-model-base.zip ^
  release-assets/whisper-model-large-turbo.zip

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo SUCCESS! Release v1.0.0 created!
    echo ========================================
    echo.
    gh release view v1.0.0 --web
) else (
    echo.
    echo Failed. Make sure you are logged in: gh auth login
)

pause
