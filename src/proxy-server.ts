import express, { Application, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import http from 'http';
import https from 'https';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
// routes
import proxyRoutes from './routes/proxy';
// modules
import { config } from './config';
import { sslOptions } from './config/ssl';
import { corsConfig } from './middleware/cors';
import { logging } from './middleware/logging';
import { proxyOptions } from './config/proxy';


const app: Application = express();



// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// Enhanced CORS middleware for private network requests
app.use(corsConfig);

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
app.use(logging);

// Apply routes BEFORE proxy middleware
app.use('/', proxyRoutes);



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