import express, { Application, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Import routes
import proxyRoutes from './routes/proxy';

dotenv.config();

const app: Application = express();

// Configuration
const config = {
  proxy: {
    httpsPort: parseInt(process.env.HTTPS_PORT || '8443'),
    httpPort: parseInt(process.env.HTTP_PORT || '8080'),
    host: process.env.PROXY_HOST || '0.0.0.0'
  },
  target: {
    url: (process.env.PRINT_SERVER_HOST + ':' + process.env.PRINT_SERVER_PORT) || 'http://localhost:3000',
    port: parseInt(process.env.PRINT_SERVER_PORT || '3000'),
    host: process.env.PRINT_SERVER_HOST || '0.0.0.0'
  },
  security: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000')
  }
};

console.log('🔧 Proxy Configuration:');
console.log(`   Target: ${config.target.url}`);
console.log(`   HTTP Port: ${config.proxy.httpPort}`);
console.log(`   HTTPS Port: ${config.proxy.httpsPort}`);
console.log(`   Host: ${config.proxy.host}`);

// Try to load SSL certificates - with PFX support
let sslOptions: https.ServerOptions | null = null;

// Define possible certificate locations with proper typing
interface PfxLocation {
  type: 'PFX';
  pfx: string;
  passphrase: string;
}

interface PemLocation {
  type: 'PEM';
  cert: string;
  key: string;
}

type CertLocation = PfxLocation | PemLocation;

const certLocations: CertLocation[] = [
  {
    type: 'PFX',
    pfx: path.join(process.cwd(), 'certs', 'server.pfx'),
    passphrase: 'printserver'
  },
  {
    type: 'PEM',
    cert: path.join(process.cwd(), 'certs', 'server.crt'),
    key: path.join(process.cwd(), 'certs', 'server.key')
  },
  {
    type: 'PEM',
    cert: path.join(process.cwd(), 'server.crt'),
    key: path.join(process.cwd(), 'server.key')
  },
  {
    type: 'PEM',
    cert: path.join(__dirname, '..', 'certs', 'server.crt'),
    key: path.join(__dirname, '..', 'certs', 'server.key')
  }
];

for (const location of certLocations) {
  try {
    if (location.type === 'PFX') {
      // Try PFX file first (preferred method)
      if (fs.existsSync(location.pfx)) {
        const pfxData = fs.readFileSync(location.pfx);
        sslOptions = {
          pfx: pfxData,
          passphrase: location.passphrase
        };
        console.log(`🔒 SSL certificate loaded from PFX: ${location.pfx}`);
        break;
      }
    } else if (location.type === 'PEM') {
      // Try PEM files as fallback
      if (fs.existsSync(location.cert) && fs.existsSync(location.key)) {
        // Validate that the key file actually contains a private key
        const keyContent = fs.readFileSync(location.key, 'utf8');
        if (keyContent.includes('-----BEGIN PRIVATE KEY-----') || 
            keyContent.includes('-----BEGIN RSA PRIVATE KEY-----')) {
          sslOptions = {
            cert: fs.readFileSync(location.cert),
            key: fs.readFileSync(location.key)
          };
          console.log(`🔒 SSL certificates loaded from PEM: ${path.dirname(location.cert)}`);
          break;
        } else {
          console.log(`⚠️  Invalid private key format in: ${location.key}`);
        }
      }
    }
  } catch (error) {
    console.log(`⚠️  Failed to load certificates from ${location.type}: ${error}`);
  }
}

if (!sslOptions) {
  console.log('⚠️  SSL certificates not found or invalid. HTTPS server will not start.');
  console.log('   Checked locations:');
  certLocations.forEach(loc => {
    if (loc.type === 'PFX' && 'pfx' in loc) {
      console.log(`   - PFX: ${loc.pfx}`);
    } else if (loc.type === 'PEM' && 'cert' in loc && 'key' in loc) {
      console.log(`   - PEM: ${loc.cert} + ${loc.key}`);
    }
  });
  console.log('   Solutions:');
  console.log('   1. Run: .\\minimal-cert.ps1 (creates PFX file)');
  console.log('   2. Or run: .\\generate-cert-fixed.ps1 (creates PEM files)');
}

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// Enhanced CORS middleware for private network requests
app.use((req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin;
  const allowedOrigins = config.security.allowedOrigins;

  // Allow all origins if '*' is specified, otherwise check allowed list
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin || '')) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Forwarded-For');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle private network requests (required for local development)
  if (req.headers['access-control-request-private-network']) {
    res.header('Access-Control-Allow-Private-Network', 'true');
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
});

// Rate limiting - skip for health checks
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMax,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/proxy-health') || 
                  req.path.startsWith('/status') ||
                  req.path.startsWith('/test-connection') ||
                  req.path.startsWith('/download-cert') ||
                  req.path.startsWith('/cert-info')
});

app.use(limiter);

// Compression
app.use(compression());

// Enhanced logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  const protocol = req.secure ? 'HTTPS' : 'HTTP';
  const userAgent = req.get('User-Agent') || 'Unknown';
  console.log(`[${timestamp}] ${protocol} ${req.method} ${req.path} - ${req.ip} - ${userAgent.substring(0, 50)}`);
  next();
});

// Apply routes BEFORE proxy middleware
app.use('/', proxyRoutes);

// Proxy configuration with proper error handling
const proxyOptions: Options = {
  target: config.target.url,
  changeOrigin: true,
  
  // Timeout settings
  timeout: 30000,
  proxyTimeout: 30000,
  
  // Preserve original headers
  preserveHeaderKeyCase: true,
  
  on: {
    proxyReq: (proxyReq: http.ClientRequest, req: http.IncomingMessage) => {
      const protocol = (req.socket as any).encrypted ? 'HTTPS' : 'HTTP';
      console.log(`🚀 ${protocol} PROXY REQ: ${req.method} ${req.url} → ${config.target.url}${req.url}`);
    },
    
    proxyRes: (proxyRes: http.IncomingMessage, req: http.IncomingMessage) => {
      const protocol = (req.socket as any).encrypted ? 'HTTPS' : 'HTTP';
      console.log(`✅ ${protocol} PROXY RES: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
      
      // Add CORS headers to proxied responses
      if (proxyRes.headers) {
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization, X-Requested-With';
      }
    },
    
    error: (err: Error, req: http.IncomingMessage, res: http.ServerResponse | any) => {
      const protocol = (req.socket as any)?.encrypted ? 'HTTPS' : 'HTTP';
      console.error(`❌ ${protocol} PROXY ERROR for ${req.method} ${req.url}:`, {
        message: err.message,
        code: (err as any).code,
        target: config.target.url
      });
      
      // Type guard and error response
      if ('writeHead' in res && 'end' in res && res.writable && !res.headersSent) {
        res.writeHead(502, { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          success: false,
          error: 'Print server unavailable',
          message: `Unable to connect to print server at ${config.target.url}`,
          details: err.message,
          code: (err as any).code,
          protocol: protocol
        }));
      }
    }
  }
};

// Create proxy middleware
const proxy = createProxyMiddleware(proxyOptions);

// Apply proxy to all routes except those handled by proxyRoutes
app.use((req: Request, res: Response, next: NextFunction) => {
  // Skip proxy for routes handled by proxyRoutes
  if (req.path === '/proxy-health' || 
      req.path === '/test-connection' || 
      req.path === '/status' ||
      req.path === '/download-cert' ||
      req.path === '/cert-info') {
    return next();
  }
  
  // Use proxy for all other routes (especially /api/*)
  return proxy(req, res, next);
});

// Global error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const protocol = req.secure ? 'HTTPS' : 'HTTP';
  console.error(`💥 ${protocol} Unhandled proxy server error:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method
  });
  
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'Proxy server error',
      message: 'An unexpected error occurred in the proxy server.',
      protocol: protocol,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 404 handler for unmatched routes
app.use('*', (req: Request, res: Response) => {
  const protocol = req.secure ? 'HTTPS' : 'HTTP';
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `The requested route ${req.method} ${req.originalUrl} was not found.`,
    protocol: protocol
  });
});

// Start HTTP server (always available)
const httpServer = http.createServer(app);
httpServer.listen(config.proxy.httpPort, config.proxy.host, () => {
  console.log(`\n🌐 HTTP Proxy Server:`);
  console.log(`   Listening on: http://${config.proxy.host}:${config.proxy.httpPort}`);
  console.log(`   Proxying to: ${config.target.url}`);
  console.log(`   Status: ✅ Ready (no certificate required)`);
});

// Start HTTPS server (if certificates available)
let httpsServer: https.Server | null = null;
if (sslOptions) {
  try {
    httpsServer = https.createServer(sslOptions, app);
    httpsServer.listen(config.proxy.httpsPort, config.proxy.host, () => {
      console.log(`\n🔒 HTTPS Proxy Server:`);
      console.log(`   Listening on: https://${config.proxy.host}:${config.proxy.httpsPort}`);
      console.log(`   Proxying to: ${config.target.url}`);
      console.log(`   Status: ✅ Ready (certificate loaded successfully)`);
    });
    
    // Set timeout for HTTPS server
    httpsServer.timeout = 35000;
    
    // Handle HTTPS server errors
    httpsServer.on('error', (error: any) => {
      console.error('❌ HTTPS Server Error:', error.message);
      if (error.code === 'EADDRINUSE') {
        console.log(`⚠️  Port ${config.proxy.httpsPort} is already in use`);
      } else if (error.code === 'EACCES') {
        console.log(`⚠️  Permission denied on port ${config.proxy.httpsPort}`);
      }
    });
    
  } catch (error: any) {
    console.error('❌ Failed to start HTTPS server:', error.message);
    httpsServer = null;
  }
} else {
  console.log(`\n🔒 HTTPS Proxy Server: ❌ Disabled (no valid certificates)`);
  console.log(`   To enable HTTPS:`);
  console.log(`   1. Run: .\\minimal-cert.ps1 (recommended - creates PFX)`);
  console.log(`   2. Or run: .\\generate-cert-fixed.ps1 (creates separate files)`);
  console.log(`   3. Restart this server`);
}

// Set timeout for HTTP server
httpServer.timeout = 35000;

console.log(`\n📋 Available Endpoints:`);
console.log(`   HTTP Proxy:   http://10.0.1.16:${config.proxy.httpPort}/api/print/metrics`);
console.log(`   HTTP Health:  http://10.0.1.16:${config.proxy.httpPort}/proxy-health`);
console.log(`   HTTP Test:    http://10.0.1.16:${config.proxy.httpPort}/test-connection`);

if (httpsServer) {
  console.log(`   HTTPS Proxy:  https://10.0.1.16:${config.proxy.httpsPort}/api/print/metrics`);
  console.log(`   HTTPS Health: https://10.0.1.16:${config.proxy.httpsPort}/proxy-health`);
  console.log(`   HTTPS Test:   https://10.0.1.16:${config.proxy.httpsPort}/test-connection`);
  console.log(`   Download Cert: http://10.0.1.16:${config.proxy.httpPort}/download-cert`);
  console.log(`   Cert Info:    http://10.0.1.16:${config.proxy.httpPort}/cert-info`);
}

console.log(`\n💡 Usage Tips:`);
console.log(`   - Use HTTP endpoints for quick testing without certificates`);
console.log(`   - Use HTTPS endpoints for secure production access`);
if (!httpsServer) {
  console.log(`   - Run .\\minimal-cert.ps1 to create certificates and enable HTTPS`);
}

// Enhanced graceful shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`\n${signal} received, shutting down proxy servers gracefully...`);
  
  const closePromises: Promise<void>[] = [
    new Promise<void>((resolve) => httpServer.close(() => resolve()))
  ];
  
  if (httpsServer) {
    closePromises.push(
      new Promise<void>((resolve) => httpsServer!.close(() => resolve()))
    );
  }
  
  Promise.all(closePromises).then(() => {
    console.log('✅ All proxy servers shut down complete');
    process.exit(0);
  }).catch((err) => {
    console.error('❌ Error during server shutdown:', err);
    process.exit(1);
  });
  
  setTimeout(() => {
    console.log('⚠️  Force shutting down proxy servers');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error: Error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;