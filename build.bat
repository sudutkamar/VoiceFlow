@echo off
setlocal enabledelayedexpansion

set "ARG=%~1"
if "%ARG%"=="" set "ARG=menu"

if "%ARG%"=="help" goto :help
if "%ARG%"=="-h" goto :help
if "%ARG%"=="--help" goto :help

if "%ARG%"=="menu" goto :menu
if "%ARG%"=="build" goto :build
if "%ARG%"=="dev" goto :dev
if "%ARG%"=="setup" goto :setup
if "%ARG%"=="download-whisper" goto :downloadWhisper
if "%ARG%"=="download-model" goto :downloadModel
if "%ARG%"=="release" goto :release
if "%ARG%"=="dist" goto :build

echo Unknown argument: %ARG%
goto :help

:menu
cls
echo ========================================
echo  VoiceFlow - Build ^& Tools
echo ========================================
echo.
echo  1] Build .exe (production)
echo  2] Start dev server
echo  3] First-time setup
echo  4) Download whisper engine
echo  5) Download AI model
echo  6) Create GitHub release
echo  7) Help
echo  0] Exit
echo.
set /p CHOICE="Pilih [0-7]: "

if "%CHOICE%"=="1" goto :build
if "%CHOICE%"=="2" goto :dev
if "%CHOICE%"=="3" goto :setup
if "%CHOICE%"=="4" goto :downloadWhisper
if "%CHOICE%"=="5" goto :downloadModel
if "%CHOICE%"=="6" goto :release
if "%CHOICE%"=="7" goto :help
if "%CHOICE%"=="0" exit /b 0
goto :menu

:build
echo ========================================
echo  BUILD - Windows Installer
echo ========================================
echo.

if not exist "resources\whisper\cpu" mkdir "resources\whisper\cpu"
if not exist "resources\whisper\gpu" mkdir "resources\whisper\gpu"
if not exist "resources\whisper\models" mkdir "resources\whisper\models"

echo [0/3] Copying whisper binaries from resources-whisper-slim...

if exist "resources\whisper\cpu\whisper-cli.exe" goto skip_cpu
if not exist "resources-whisper-slim\whisper-cli.exe" goto warn_cpu
echo   Copying CPU files...
xcopy /Y "resources-whisper-slim\whisper-cli.exe" "resources\whisper\cpu\" >nul
xcopy /Y "resources-whisper-slim\whisper.dll" "resources\whisper\cpu\" >nul
xcopy /Y "resources-whisper-slim\ggml.dll" "resources\whisper\cpu\" >nul
xcopy /Y "resources-whisper-slim\ggml-base.dll" "resources\whisper\cpu\" >nul
xcopy /Y "resources-whisper-slim\ggml-cpu-*.dll" "resources\whisper\cpu\" >nul
echo   CPU OK
goto gpu_check
:warn_cpu
echo   WARNING: resources-whisper-slim not found.
echo   Run: build.bat download-whisper
goto gpu_check
:skip_cpu
echo   CPU already present, skipping.

:gpu_check
if exist "resources\whisper\gpu\ggml-cuda.dll" goto skip_gpu
if not exist "resources-whisper-slim\ggml-cuda.dll" goto warn_gpu
echo   Copying GPU/CUDA files...
xcopy /Y "resources-whisper-slim\ggml-cuda.dll" "resources\whisper\gpu\" >nul
xcopy /Y "resources-whisper-slim\cublas64_12.dll" "resources\whisper\gpu\" >nul
xcopy /Y "resources-whisper-slim\cublasLt64_12.dll" "resources\whisper\gpu\" >nul
xcopy /Y "resources-whisper-slim\cudart64_12.dll" "resources\whisper\gpu\" >nul
echo   GPU OK
goto build_start
:warn_gpu
echo   GPU files not found (CPU mode still works).
goto build_start
:skip_gpu
echo   GPU already present, skipping.

:build_start
echo [1/4] Checking default AI model (ggml-base-q5_1.bin)...
if exist "resources\whisper\models\ggml-base-q5_1.bin" (
    echo   Model OK
    goto build_model_ok
)
echo   Default model not found. Downloading automatically (57 MB)...
echo   (Download dari HuggingFace, membutuhkan internet)
curl -L -o "resources\whisper\models\ggml-base-q5_1.bin" ^
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin"
if %errorlevel% equ 0 (
    echo   Model downloaded successfully
) else (
    echo   FAILED: Could not download model.
    echo   The app WILL NOT WORK without a model.
    echo   Run: build.bat download-model
)
:build_model_ok

echo [2/4] Building React frontend...
call npm run build:renderer
if %errorlevel% neq 0 ( echo FAILED & pause & exit /b 1 )
echo OK

echo [3/4] Building Electron backend...
call npm run build:electron
if %errorlevel% neq 0 ( echo FAILED & pause & exit /b 1 )
echo OK

echo [4/4] Creating Windows installer...
call npx electron-builder --win
if %errorlevel% neq 0 ( echo FAILED & pause & exit /b 1 )

echo.
echo BUILD COMPLETE
echo Installer: release\
echo.
pause
exit /b 0

:dev
echo ========================================
echo  DEV - Starting Dev Server
echo ========================================
echo.
echo Pastikan sudah: npm install
echo whisper/model bisa dummy (mock mode available)
echo.
npm run dev
exit /b 0

:setup
echo ========================================
echo  SETUP - First-time Setup
echo ========================================
echo.

echo [1/4] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Install from https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo Node.js: %%i

echo [2/4] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed. Try: npm cache clean --force
    pause & exit /b 1
)
echo OK

echo [3/4] Creating directories...
if not exist "resources\whisper\cpu" mkdir "resources\whisper\cpu"
if not exist "resources\whisper\gpu" mkdir "resources\whisper\gpu"
if not exist "resources\whisper\models" mkdir "resources\whisper\models"
if not exist "data" mkdir "data"
if not exist "logs" mkdir "logs"
echo OK

echo [4/4] Checking files...
if exist "resources\whisper\cpu\whisper-cli.exe" (
    echo   whisper-cli.exe: OK
) else (
    echo   whisper-cli.exe: MISSING - run: build.bat download-whisper
)
if exist "resources\whisper\models\ggml-base-q5_1.bin" (
    echo   model (ggml-base-q5_1.bin): OK
) else if exist "resources\whisper\models\ggml-base.bin" (
    echo   model (ggml-base.bin): OK
) else (
    echo   model: MISSING - run: build.bat download-model (recommended: option 1)
)

echo.
echo SETUP COMPLETE
echo Next: build.bat dev  (dev mode)
echo       build.bat      (production build)
echo.
pause
exit /b 0

:downloadWhisper
echo ========================================
echo  DOWNLOAD - Whisper Engine
echo ========================================
echo.
echo Download dari GitHub Releases:
echo   https://github.com/ggerganov/whisper.cpp/releases
echo.
echo 1. Buka link di atas
echo 2. Cari file whisper-bin-*.zip
echo 3. Extract file ke folder ini:
echo.
if not exist "resources\whisper\cpu" mkdir "resources\whisper\cpu"
if not exist "resources\whisper\gpu" mkdir "resources\whisper\gpu"
echo   resources\whisper\cpu\  - CPU files
echo     - whisper-cli.exe, whisper.dll, ggml.dll
echo     - ggml-base.dll, ggml-cpu-*.dll
echo.
echo   resources\whisper\gpu\  - (optional) GPU files
echo     - ggml-cuda.dll, cublas64_12.dll
echo     - cublasLt64_12.dll, cudart64_12.dll
echo.
pause
exit /b 0

:downloadModel
echo ========================================
echo  DOWNLOAD - Whisper Model
echo ========================================
echo.
echo Pilih model:
echo   1] ggml-base-q5_1.bin (57 MB) - DEFAULT, paling kecil, recommended
echo   2] ggml-base.bin (142 MB) - akurasi lebih baik
echo   3] ggml-tiny.bin (75 MB) - cepat, PC lama
echo   4] ggml-small.bin (466 MB) - akurasi tinggi
echo.
set /p MODEL="Pilih [1-4]: "

if "%MODEL%"=="1" set "MODEL_NAME=ggml-base-q5_1.bin"
if "%MODEL%"=="2" set "MODEL_NAME=ggml-base.bin"
if "%MODEL%"=="3" set "MODEL_NAME=ggml-tiny.bin"
if "%MODEL%"=="4" set "MODEL_NAME=ggml-small.bin"
if "%MODEL_NAME%"=="" (
    echo Pilihan tidak valid & pause & exit /b 1
)

if not exist "resources\whisper\models" mkdir "resources\whisper\models"

echo Downloading %MODEL_NAME%...
curl -L -o "resources\whisper\models\%MODEL_NAME%" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/%MODEL_NAME%"

if %errorlevel% equ 0 (
    echo OK - saved to resources\whisper\models\%MODEL_NAME%
) else (
    echo FAILED. Download manual: https://huggingface.co/ggerganov/whisper.cpp/tree/main
)
pause
exit /b 0

:release
echo ========================================
echo  RELEASE - Create GitHub Release
echo ========================================
echo.

where gh >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: GitHub CLI not found. Install: winget install GitHub.cli
    pause & exit /b 1
)

gh release create v1.0.0 ^
  --title "VoiceFlow v1.0.0" ^
  --notes "## VoiceFlow v1.0.0 - Voice to Text for Windows

Voice-to-text lokal untuk Windows. 100%% gratis, 100%% privat, tanpa internet.

### Install

1. Download source code: Code > Download ZIP
2. Extract dan jalankan: build.bat setup
3. Download whisper-cpu.zip di bawah, extract ke resources/whisper/cpu/
4. (Optional) Download whisper-cuda.zip di bawah, extract ke resources/whisper/gpu/
5. Download whisper-model-base.zip di bawah, extract ke resources/whisper/models/
6. Jalankan: build.bat dev

### Downloads

| File | Size | Keterangan |
|------|------|------------|
| whisper-cpu.zip | 3.3 MB | Whisper engine (CPU) - wajib |
| whisper-cuda.zip | 620 MB | Whisper engine + NVIDIA GPU |
| whisper-model-base.zip | 128 MB | Model AI - recommended |
| whisper-model-tiny.zip | 55 MB | Model AI - cepat, PC lama |
| whisper-model-large-turbo.zip | 509 MB | Model AI - akurasi tinggi |

### System Requirements

- Windows 10/11
- Node.js 18+
- Microphone
- (Optional) NVIDIA GPU + CUDA" ^
  release-assets/whisper-cpu.zip ^
  release-assets/whisper-cuda.zip ^
  release-assets/whisper-model-tiny.zip ^
  release-assets/whisper-model-base.zip ^
  release-assets/whisper-model-large-turbo.zip

if %errorlevel% equ 0 (
    echo RELEASE CREATED
    gh release view v1.0.0 --web
) else (
    echo FAILED. Pastikan sudah login: gh auth login
)
pause
exit /b 0

:help
echo ========================================
echo  VoiceFlow - Build ^& Tools
echo ========================================
echo.
echo Usage:  build.bat [command]
echo.
echo Commands:
echo   (menu)       Show menu (default)
echo   build        Build Windows installer
echo   dev          Start dev server
echo   setup        First-time setup
echo   download-whisper  Download whisper engine
echo   download-model    Download AI model
echo   release      Create GitHub release
echo.
echo Examples:
echo   build.bat          - show menu
echo   build.bat dev      - start development
echo   build.bat build    - build .exe
echo.
pause
exit /b 0