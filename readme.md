# Print Proxy Server - Windows Service

This guide explains how to install and manage the Print Proxy Server as a Windows service.

## Prerequisites

- **Node.js** (v18 or higher) installed on Windows Server
- **Administrator privileges** to install/manage Windows services
- **Print server** running on `10.0.1.12:3000`

## Installation Methods

### Method 1: Using Batch Scripts (Recommended)

1. **Right-click** on `install-service.bat`
2. **Select "Run as administrator"**
3. The script will:
   - Install dependencies
   - Build the project
   - Install and start the Windows service

### Method 2: Manual Installation

1. **Open Command Prompt as Administrator**
2. **Navigate to the project directory**
3. **Run these commands:**
   ```cmd
   npm install
   npm run build
   npm run service:install
   ```

## Service Management

### Using npm scripts:
```cmd
npm run service:start     # Start the service
npm run service:stop      # Stop the service
npm run service:restart   # Restart the service
npm run service:uninstall # Remove the service
```

### Using the service manager:
```cmd
node service.js start
node service.js stop
node service.js restart
node service.js uninstall
```

### Using Windows Services Manager:
1. **Open Services** (`services.msc`)
2. **Find "PrintProxyServer"**
3. **Right-click** to start/stop/restart

## Service Configuration

- **Service Name:** `PrintProxyServer`
- **Display Name:** `Proxy server for high-performance print server`
- **Port:** `8080`
- **Target:** `http://10.0.1.12:3000`
- **Startup Type:** Automatic

## Log Files

Service logs are automatically created in:
- **Application logs:** Windows Event Viewer
- **Service wrapper logs:** `daemon/` folder (created automatically)

## Troubleshooting

### Service won't start:
1. Check if port 8080 is available
2. Verify Node.js is in system PATH
3. Check Windows Event Viewer for errors
4. Ensure print server at 10.0.1.12:3000 is accessible

### Permission issues:
- Run installation scripts as Administrator
- Check Windows firewall settings
- Verify network connectivity to print server

### Service not responding:
```cmd
npm run service:restart
```

## Uninstallation

### Using batch script:
1. **Right-click** on `uninstall-service.bat`
2. **Select "Run as administrator"**

### Manual uninstallation:
```cmd
npm run service:uninstall
```

## Service Status

Check if the service is running:
- **Services Manager:** Look for "PrintProxyServer"
- **Command Line:** `sc query PrintProxyServer`
- **Browser:** Visit `http://localhost:8080/proxy-health`

## Network Configuration

The proxy server will:
- **Listen on:** `0.0.0.0:8080` (all interfaces)
- **Forward to:** `http://10.0.1.12:3000`
- **Accept from:** Origins configured in `.env` file

Make sure Windows Firewall allows connections on port 8080.