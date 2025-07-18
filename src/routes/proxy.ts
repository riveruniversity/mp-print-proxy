import { Router, Request, Response } from 'express';
import express from 'express';

const router = Router();

// Apply JSON parsing only to these specific routes
// router.use(express.json({ limit: '10mb' }));

// Health check endpoint for the proxy itself
router.get('/proxy-health', (req: Request, res: Response) => {
  const config = {
    target: process.env.PRINT_SERVER_URL || 'http://localhost:3000'
  };
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    target: config.target,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// Test endpoint to verify proxy can reach target server
router.get('/test-connection', async (req: Request, res: Response) => {
  const config = {
    target: process.env.PRINT_SERVER_URL || 'http://localhost:3000'
  };
  
  try {
    const response = await fetch(`${config.target}/health`);
    const data = await response.text();
    
    res.json({
      success: true,
      message: 'Successfully connected to print server',
      target: config.target,
      targetStatus: response.status,
      targetResponse: data
    });
  } catch (error: any) {
    console.error('❌ Cannot reach target server:', error.message);
    res.status(502).json({
      success: false,
      error: 'Cannot reach print server',
      target: config.target,
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
    target: process.env.PRINT_SERVER_URL || 'http://localhost:3000'
  });
});

export default router;