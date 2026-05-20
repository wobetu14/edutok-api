import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from './errorHandler';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new ApiError(401, 'Missing or invalid Authorization header'));
  }

  const payload = verifyAccessToken(header.slice(7));
  if (!payload) {
    return next(new ApiError(401, 'Invalid or expired access token'));
  }

  req.user = { id: payload.sub, role: payload.role, username: payload.username };
  next();
}
