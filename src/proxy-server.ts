import express, { Application, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import http from 'http';
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
    target: process.env.PRINT_SERVER_URL || 'http://localhost:3000',
    port: parseInt(process.env.PROXY_PORT || '8080'),
    host: process.env.PROXY_HOST || '0.0.0.0'
  },
  security: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000')
  }
};

console.log('🔧 Proxy Configuration:');
console.log(`   Target: ${config.proxy.target}`);
console.log(`   Listening: ${config.proxy.host}:${config.proxy.port}`);


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
  skip: (req) => req.path.startsWith('/proxy-health') || req.path.startsWith('/status')
});

app.use(limiter);

// Compression
app.use(compression());

// Enhanced logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  const userAgent = req.get('User-Agent') || 'Unknown';
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip} - ${userAgent}`);
  next();
});

// IMPORTANT: Apply routes BEFORE proxy middleware
// These routes use their own body parsing
app.use('/', proxyRoutes);

// Proxy configuration with proper error handling
const proxyOptions: Options = {
  target: config.proxy.target,
  changeOrigin: true,
  
  // Timeout settings
  timeout: 30000,
  proxyTimeout: 30000,
  
  // Preserve original headers
  preserveHeaderKeyCase: true,
  
  on: {
    proxyReq: (proxyReq: http.ClientRequest, req: http.IncomingMessage) => {
      console.log(`🚀 PROXY REQ: ${req.method} ${req.url} → ${config.proxy.target}${req.url}`);
      console.log(`   Content-Length: ${req.headers['content-length'] || 'unknown'}`);
      console.log(`   Content-Type: ${req.headers['content-type'] || 'unknown'}`);
    },
    
    proxyRes: (proxyRes: http.IncomingMessage, req: http.IncomingMessage) => {
      console.log(`✅ PROXY RES: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
      
      // Add CORS headers to proxied responses
      if (proxyRes.headers) {
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization, X-Requested-With';
      }
    },
    
    error: (err: Error, req: http.IncomingMessage, res: http.ServerResponse | any) => {
      console.error(`❌ PROXY ERROR for ${req.method} ${req.url}:`, {
        message: err.message,
        code: (err as any).code,
        target: config.proxy.target
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
          message: `Unable to connect to print server at ${config.proxy.target}`,
          details: err.message,
          code: (err as any).code
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
      req.path === '/status') {
    return next();
  }
  
  // Use proxy for all other routes (especially /api/*)
  return proxy(req, res, next);
});

// Global error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 Unhandled proxy server error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'Proxy server error',
      message: 'An unexpected error occurred in the proxy server.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 404 handler for unmatched routes
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `The requested route ${req.method} ${req.originalUrl} was not found.`
  });
});

// Start the proxy server
const server = app.listen(config.proxy.port, config.proxy.host, () => {
  console.log(`\n🚀 Proxy Server Started Successfully!`);
  console.log(`   Listening on: http://${config.proxy.host}:${config.proxy.port}`);
  console.log(`   Proxying to: ${config.proxy.target}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n📋 Available Endpoints:`);
  console.log(`   GET  /proxy-health     - Proxy server health check`);
  console.log(`   GET  /test-connection  - Test connection to print server`);
  console.log(`   GET  /status          - Detailed server status`);
  console.log(`   *    /api/*           - Proxied to print server`);
  console.log(`\n✅ Proxy server is ready to handle requests`);
});

// Set server timeout slightly higher than proxy timeout
server.timeout = 35000;

// Enhanced graceful shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`\n${signal} received, shutting down proxy server gracefully...`);
  
  server.close((err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
      process.exit(1);
    }
    console.log('✅ Proxy server shut down complete');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.log('⚠️  Force shutting down proxy server');
    process.exit(1);
  }, 10000);
};

// Process event handlers
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