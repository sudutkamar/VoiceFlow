@echo off
echo ========================================
echo VoiceFlow - Download Whisper CLI
echo ========================================
echo.
echo This script will download whisper-cli.exe and required DLLs.
echo.

if not exist "resources\whisper" mkdir "resources\whisper"

echo Checking for existing whisper-cli.exe...
if exist "resources\whisper\whisper-cli.exe" (
    echo whisper-cli.exe already exists!
    echo.
    set /p REINSTALL="Re-download? (y/N): "
    if /i not "%REINSTALL%"=="y" (
        echo Skipping download.
        goto :dlls
    )
)

echo.
echo Downloading whisper-cli.exe...
echo (This may take a moment)
echo.

:: Try downloading from GitHub Releases (whisper.cpp)
:: Latest release: https://github.com/ggerganov/whisper.cpp/releases
echo Please download whisper-cli.exe manually from:
echo.
echo   https://github.com/ggerganov/whisper.cpp/releases
echo.
echo Look for: whisper-cli.exe (or whisper-main.exe)
echo.
echo Also download these DLL files to resources\whisper\:
echo   - whisper.dll
echo   - ggml.dll
echo   - ggml-cpu-*.dll
echo   - ggml-base.dll
echo   - ggml-cuda.dll (if you have NVIDIA GPU)
echo   - cublas64_12.dll (if you have NVIDIA GPU)
echo   - cublasLt64_12.dll (if you have NVIDIA GPU)
echo   - cudart64_12.dll (if you have NVIDIA GPU)
echo.

:dlls
echo ========================================
echo Alternative: Use pre-built package
echo ========================================
echo.
echo You can also download a pre-built package that includes
echo whisper-cli.exe + all DLLs from:
echo.
echo   https://github.com/ggerganov/whisper.cpp/releases
echo.
echo Look for: whisper-*.zip or whisper-bin-*.zip
echo Extract to: resources\whisper\
echo.

echo ========================================
echo Done! 
echo ========================================
echo.
echo After downloading, run: npm run dev
echo.
pause
