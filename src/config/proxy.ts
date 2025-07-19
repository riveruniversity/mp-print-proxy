import http from 'http';
import { Options } from 'http-proxy-middleware';
import { config } from '.';

// Proxy configuration with proper error handling
export const proxyOptions: Options = {
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