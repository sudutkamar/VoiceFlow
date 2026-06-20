@echo off
echo ========================================
echo Starting VoiceFlow in Development Mode
echo ========================================
echo.
echo Make sure you have:
echo 1. Installed dependencies (npm install)
echo 2. Downloaded whisper-cli.exe (optional - mock mode available)
echo 3. Downloaded ggml-base.bin model (optional - mock mode available)
echo.
echo Starting development server...
echo.

npm run dev
