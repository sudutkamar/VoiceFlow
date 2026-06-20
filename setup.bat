@echo off
echo ========================================
echo VoiceFlow - Setup Script
echo ========================================
echo.
echo This script will help you set up VoiceFlow.
echo.

echo [1/3] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)
echo Node.js found!

echo.
echo [2/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
echo Dependencies installed!

echo.
echo [3/3] Creating necessary directories...
if not exist "resources\whisper\models" mkdir "resources\whisper\models"
if not exist "data" mkdir "data"
if not exist "logs" mkdir "logs"
echo Directories created!

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next steps:
echo.
echo 1. Download whisper-cli.exe from:
echo    https://github.com/ggerganov/whisper.cpp/releases
echo    Place it in: resources\whisper\
echo.
echo 2. Download ggml-base.bin model from:
echo    https://huggingface.co/ggerganov/whisper.cpp/tree/main
echo    Place it in: resources\whisper\models\
echo.
echo 3. Run the app:
echo    npm run dev
echo.
echo Or use the download scripts:
echo    download-whisper.bat
echo    download-model.bat
echo.
pause
