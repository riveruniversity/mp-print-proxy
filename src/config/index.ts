import dotenv from 'dotenv';

dotenv.config();


// Configuration
export const config = {
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
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000'),
    certPass: process.env.SSL_CERT_PASS
  }
};

console.log('🔧 Proxy Configuration:');
console.log(`   Target: ${config.target.url}`);
console.log(`   HTTP Port: ${config.proxy.httpPort}`);
console.log(`   HTTPS Port: ${config.proxy.httpsPort}`);
console.log(`   Host: ${config.proxy.host}`);