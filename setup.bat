@echo off
echo ========================================
echo VoiceFlow - Setup Script
echo ========================================
echo.

echo [1/4] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Node.js not found!
    echo.
    echo Please install Node.js 18+ from: https://nodejs.org
    echo After installing, restart this terminal and run setup.bat again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo Node.js found: %%i

echo.
echo [2/4] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies
    echo Try running: npm cache clean --force
    echo Then run setup.bat again.
    echo.
    pause
    exit /b 1
)
echo Dependencies installed!

echo.
echo [3/4] Creating necessary directories...
if not exist "resources-whisper-clean\models" mkdir "resources-whisper-clean\models"
if not exist "data" mkdir "data"
if not exist "logs" mkdir "logs"
echo Directories created!

echo.
echo [4/4] Checking Whisper...
if exist "resources-whisper-clean\whisper-cli.exe" (
    echo whisper-cli.exe found!
) else (
    echo whisper-cli.exe NOT found.
    echo Please run download-whisper.bat to download it.
)

if exist "resources-whisper-clean\models\ggml-base.bin" (
    echo ggml-base.bin model found!
) else (
    echo Model NOT found.
    echo Please run download-model.bat to download it.
)

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next steps:
echo.
echo 1. Run download-whisper.bat  (if whisper not installed yet)
echo 2. Run download-model.bat    (if model not downloaded yet)
echo 3. Run: npm run dev          (to start the app)
echo.
pause
