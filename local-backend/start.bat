@echo off
echo Starting YTDown Local Backend...
cd /d "%~dp0"

echo Checking if server is already running on port 3001...
netstat -an | find "3001" | find "LISTENING" >nul
if %errorlevel% equ 0 (
    echo WARNING: Port 3001 is already in use!
    echo If YTDown backend is already running, you can close this window.
    echo Otherwise, please stop the service using port 3001.
    echo.
)

echo Starting server at http://localhost:3001
echo Press Ctrl+C to stop the server
echo.

node server.js

echo.
echo Server stopped.
pause