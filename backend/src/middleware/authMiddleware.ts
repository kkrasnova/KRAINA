import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/tokens.js';
import { HttpError } from '../errors/HttpError.js';
import { pool } from '../db/pool.js';

export async function authenticateToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    next(new HttpError(401, 'token_invalid'));
    return;
  }
  const token = h.slice(7);
  try {
    const p = verifyAccessToken(token);
    const r = await pool.query(`SELECT id, status FROM users WHERE id = $1`, [p.sub]);
    if (!r.rowCount) {
      next(new HttpError(401, 'token_invalid'));
      return;
    }
    const st = (r.rows[0] as { status: string }).status;
    if (st === 'banned') {
      next(new HttpError(403, 'account_banned'));
      return;
    }
    if (st === 'deleted') {
      next(new HttpError(401, 'token_invalid'));
      return;
    }
    req.authUser = { id: p.sub, email: p.email, role: p.role };
    next();
  } catch {
    next(new HttpError(401, 'token_invalid'));
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = h.slice(7);
  try {
    const p = verifyAccessToken(token);
    const r = await pool.query(`SELECT id, status FROM users WHERE id = $1`, [p.sub]);
    if (r.rowCount && (r.rows[0] as { status: string }).status === 'active') {
      req.authUser = { id: p.sub, email: p.email, role: p.role };
    }
  } catch {
    
  }
  next();
}
