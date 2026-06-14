import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../errors/HttpError.js';

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.authUser?.role !== 'admin') {
    next(new HttpError(403, 'forbidden'));
    return;
  }
  next();
}
