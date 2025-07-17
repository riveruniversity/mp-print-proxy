@echo off
echo Uninstalling Print Proxy Server Windows Service...
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo ✅ Running with administrator privileges
) else (
    echo ❌ This script must be run as Administrator
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo Stopping and uninstalling the service...
node service.js uninstall

echo.
echo ✅ Print Proxy Server service has been uninstalled
echo.
pause