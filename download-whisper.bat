@echo off
echo ========================================
echo VoiceFlow - Download Whisper CLI
echo ========================================
echo.
echo This script will download whisper-cli.exe for VoiceFlow.
echo.
echo Downloading whisper-cli.exe...
echo.

if not exist "resources\whisper" mkdir "resources\whisper"

curl -L -o "resources\whisper\whisper-cli.exe" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/whisper-cli.exe"

if %errorlevel% equ 0 (
    echo.
    echo Whisper CLI downloaded successfully!
    echo Location: resources\whisper\whisper-cli.exe
) else (
    echo.
    echo Failed to download whisper-cli.exe.
    echo.
    echo Please download manually from:
    echo https://github.com/ggerganov/whisper.cpp/releases
    echo.
    echo Or build from source:
    echo 1. git clone https://github.com/ggerganov/whisper.cpp
    echo 2. cd whisper.cpp
    echo 3. cmake -B build
    echo 4. cmake --build build --config Release
    echo 5. Copy build\bin\Release\whisper-cli.exe to resources\whisper\
)

echo.
pause
