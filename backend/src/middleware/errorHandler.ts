import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { HttpError } from '../errors/HttpError.js';
import { logger } from '../logger.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    const path = req.originalUrl ?? req.url ?? '';
    if (path.startsWith('/api/auth') && (err.status === 401 || err.status === 403)) {
      logger.warn('auth_http_error', {
        path,
        code: err.code,
        ip: req.ip,
        method: req.method,
      });
    }
    res.status(err.status).json({ error: err.code });
    return;
  }
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'file_too_large' });
    return;
  }
  logger.error('Unhandled error', err);
  res.status(500).json({ error: 'internal_error' });
}
