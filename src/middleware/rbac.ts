import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { ApiError } from './errorHandler';

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, 'Unauthenticated'));
    if (!roles.includes(req.user.role as Role)) {
      return next(new ApiError(403, 'Insufficient permissions'));
    }
    next();
  };
}
