import { Router, Request, Response } from 'express';
import { config } from '../proxy-server';

const router = Router();

// DON'T USE JSON parsing !!!
// router.use(express.json({ limit: '10mb' }));

// Health check endpoint for the proxy itself
router.get('/proxy-health', (req: Request, res: Response) => {
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    target: config.target.url,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// Test endpoint to verify proxy can reach target server
router.get('/test-connection', async (req: Request, res: Response) => {

  try {
    const response = await fetch(`${config.target.url}/health`);
    const data = await response.text();
    
    res.json({
      success: true,
      message: 'Successfully connected to print server',
      target: config.target.url,
      targetStatus: response.status,
      targetResponse: data
    });
  } catch (error: any) {
    console.error('❌ Cannot reach target server:', error.message);
    res.status(502).json({
      success: false,
      error: 'Cannot reach print server',
      target: config.target.url,
      details: error.message
    });
  }
});

// Status endpoint for monitoring
router.get('/status', (req: Request, res: Response) => {
  res.json({
    proxy: {
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      env: process.env.NODE_ENV || 'development'
    },
    target: config.target.url
  });
});

export default router;