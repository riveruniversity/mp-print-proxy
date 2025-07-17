@echo off
echo Installing Print Proxy Server as Windows Service...
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

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorLevel% == 0 (
    echo ✅ Node.js is installed
    node --version
) else (
    echo ❌ Node.js is not installed or not in PATH
    echo Please install Node.js first
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorLevel% == 0 (
    echo ✅ npm is available
    npm --version
) else (
    echo ❌ npm is not available
    pause
    exit /b 1
)

echo.
echo Installing dependencies...
call npm install

echo.
echo Building the project...
call npm run build

echo.
echo Installing Windows service...
node service.js install

echo.
echo ✅ Installation complete!
echo.
echo The Print Proxy Server service has been installed and started.
echo You can manage it through Windows Services or use:
echo   node service.js start    - Start the service
echo   node service.js stop     - Stop the service
echo   node service.js restart  - Restart the service
echo   node service.js uninstall - Remove the service
echo.
pause