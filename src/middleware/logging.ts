import { Request, Response, NextFunction } from 'express';


export const logging = (req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  const protocol = req.secure ? 'HTTPS' : 'HTTP';
  const userAgent = req.get('User-Agent') || 'Unknown';
  console.log(`[${timestamp}] ${protocol} ${req.method} ${req.path} - ${req.ip} - ${userAgent.substring(0, 50)}`);
  next();
};