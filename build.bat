@echo off
echo ========================================
echo VoiceFlow - Full Build
echo ========================================
echo.
echo Building for Windows...
echo.

echo [1/3] Building React frontend...
call npm run build:renderer
if %errorlevel% neq 0 (
    echo ERROR: Frontend build failed
    pause
    exit /b 1
)
echo Frontend build complete!

echo.
echo [2/3] Building Electron backend...
call npm run build:electron
if %errorlevel% neq 0 (
    echo ERROR: Electron build failed
    pause
    exit /b 1
)
echo Electron build complete!

echo.
echo [3/3] Creating Windows installer...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo ERROR: Installer creation failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Installer location: release\
echo.
pause
