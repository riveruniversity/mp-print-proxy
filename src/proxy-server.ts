import express, { Application, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app: Application = express();

// Configuration
const config = {
  proxy: {
    target: process.env.PRINT_SERVER_URL || 'http://10.0.1.12:3000',
    port: parseInt(process.env.PROXY_PORT || '8080'),
    host: process.env.PROXY_HOST || '0.0.0.0'
  },
  security: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000')
  }
};

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
// app.use(cors({
//   origin: config.security.allowedOrigins,
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
// }));

// middleware to handle private network requests
app.use((req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin;
  const allowedOrigins = config.security.allowedOrigins;

  if (allowedOrigins.includes(origin || '')) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  // This is the key header for private network requests
  if (req.headers['access-control-request-private-network']) {
    res.header('Access-Control-Allow-Private-Network', 'true');
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMax,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// Body parsing and compression
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Proxy configuration
const proxyOptions: Options<http.IncomingMessage, http.ServerResponse> = {
  target: config.proxy.target,
  changeOrigin: true,
  xfwd: true,
  timeout: 30000,
  proxyTimeout: 30000,

  on: {
    // Handle error events
    error(err, req, res) {
      console.error('Proxy error:', err);

      // Check if res is a ServerResponse (not a Socket)
      if ('writeHead' in res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Print server unavailable',
          message: 'Unable to connect to the print server. Please try again later.'
        }));
      } else {
        res.end('Bad gateway.');
      }
    },

    // Log proxy requests
    proxyReq(proxyReq: http.ClientRequest, req: http.IncomingMessage, res: http.ServerResponse) {
      console.log(`Proxying ${req.method} ${req.url} to ${config.proxy.target}`);
    },

    // Log proxy responses
    proxyRes(proxyRes: http.IncomingMessage, req: http.IncomingMessage, res: http.ServerResponse) {
      console.log(`Received response ${proxyRes.statusCode} for ${req.method} ${req.url}`);
    }
  }
};

// Create proxy middleware
const proxy = createProxyMiddleware(proxyOptions);

// Health check endpoint for the proxy itself
app.get('/proxy-health', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    target: config.proxy.target,
    uptime: process.uptime()
  });
});

// Forward all other requests to the print server
app.use('/', proxy);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Proxy server error:', err);
  res.status(500).json({
    success: false,
    error: 'Proxy server error',
    message: 'An unexpected error occurred in the proxy server.'
  });
});

// Start the proxy server
const server = app.listen(config.proxy.port, config.proxy.host, () => {
  console.log(`🚀 Proxy server running on ${config.proxy.host}:${config.proxy.port}`);
  console.log(`📡 Forwarding requests to: ${config.proxy.target}`);
  console.log(`🔒 CORS origins: ${config.security.allowedOrigins.join(', ')}`);
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`${signal} received, shutting down proxy server gracefully`);
  server.close(() => {
    console.log('Proxy server shut down complete');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;