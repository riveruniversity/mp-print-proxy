const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'PrintProxyServer',
  description: 'Proxy server for high-performance print server',
  script: path.join(__dirname, 'dist', 'proxy-server.js'),
  nodeOptions: [
    '--max-old-space-size=4096'
  ],
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    },
    {
      name: "PROXY_PORT",
      value: "8080"
    },
    {
      name: "PRINT_SERVER_PORT",
      value: 3000
    },
    {
      name: "PRINT_SERVER_HOST",
      value: 'http://10.0.1.12'
    },
    {
      name: "PRINT_SERVER_URL",
      value: "http://10.0.1.12:3000"
    }
  ],
  workingDirectory: __dirname,
  allowServiceLogon: true
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install', function() {
  console.log('✅ Print Proxy Server service installed successfully!');
  console.log('Starting service...');
  svc.start();
});

svc.on('start', function() {
  console.log('🚀 Print Proxy Server service started successfully!');
  console.log('Service is now running on port 8080');
});

svc.on('stop', function() {
  console.log('⏹️ Print Proxy Server service stopped');
});

svc.on('uninstall', function() {
  console.log('🗑️ Print Proxy Server service uninstalled');
});

svc.on('error', function(err) {
  console.error('❌ Service error:', err);
});

// Check command line arguments
const command = process.argv[2];

switch (command) {
  case 'install':
    console.log('📦 Installing Print Proxy Server service...');
    svc.install();
    break;
    
  case 'uninstall':
    console.log('🗑️ Uninstalling Print Proxy Server service...');
    svc.uninstall();
    break;
    
  case 'start':
    console.log('▶️ Starting Print Proxy Server service...');
    svc.start();
    break;
    
  case 'stop':
    console.log('⏹️ Stopping Print Proxy Server service...');
    svc.stop();
    break;
    
  case 'restart':
    console.log('🔄 Restarting Print Proxy Server service...');
    svc.restart();
    break;
    
  default:
    console.log('Print Proxy Server Service Manager');
    console.log('Usage: node service.js [command]');
    console.log('');
    console.log('Commands:');
    console.log('  install   - Install the service');
    console.log('  uninstall - Uninstall the service');
    console.log('  start     - Start the service');
    console.log('  stop      - Stop the service');
    console.log('  restart   - Restart the service');
    break;
}