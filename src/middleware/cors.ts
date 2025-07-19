import { Request, Response, NextFunction } from 'express';
import { config } from '../config';



export const corsConfig = (req: Request, res: Response, next: NextFunction): void => {
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
};