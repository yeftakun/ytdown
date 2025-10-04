@echo off
echo ====================================
echo YTDown Local Backend Setup
echo ====================================
echo.

echo Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js: OK

echo.
echo Checking yt-dlp...
yt-dlp --version >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: yt-dlp is not installed or not in PATH!
    echo.
    echo Installing yt-dlp via pip...
    pip install yt-dlp
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install yt-dlp via pip
        echo Please install yt-dlp manually:
        echo 1. pip install yt-dlp
        echo 2. Or download from https://github.com/yt-dlp/yt-dlp/releases
        pause
        exit /b 1
    )
)
echo yt-dlp: OK

echo.
echo Installing Node.js dependencies...
cd /d "%~dp0"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ====================================
echo Setup completed successfully!
echo ====================================
echo.
echo To start the server, run:
echo   npm start
echo.
echo The server will be available at:
echo   http://localhost:3001
echo.
echo Configure your YTDown extension to use:
echo   http://localhost:3001/api/v1/streams/{videoId}
echo.
pause